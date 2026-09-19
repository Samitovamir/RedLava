// Brings up a throwaway copy of the app for the browser tests: its own backend,
// its own frontend, its own store file, its own signing secret.
//
// Why not just use the dev servers you already have running: the tests register
// accounts and write sync blobs, and those would land in backend/.localstore.json
// next to your real work. A separate store also means a test run always starts
// from an empty system, which is the only way "a brand new account sees X" can be
// a meaningful assertion.
//
// Nothing here needs credentials. Without ANTHROPIC_API_KEY the AI cards fall
// back to deterministic text, which is exactly what we want to assert against.

import { spawn } from 'child_process'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// One fixed pair of ports, so test files must run one at a time (npm test passes
// --test-concurrency=1). Run in parallel, the first file to finish stopped the servers the
// other was still using, and its pages started answering 500.
export const API_PORT = Number(process.env.TEST_API_PORT) || 3101
export const WEB_PORT = Number(process.env.TEST_WEB_PORT) || 5273
export const WEB = `http://localhost:${WEB_PORT}`
export const API = `http://localhost:${API_PORT}`

const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function waitForHttp(url, { timeoutMs = 60000, label = url } = {}) {
  const deadline = Date.now() + timeoutMs
  let lastErr = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (res.status < 500) return
      lastErr = new Error(`${label} answered ${res.status}`)
    } catch (e) { lastErr = e }
    await wait(300)
  }
  throw new Error(`${label} never came up in ${timeoutMs}ms: ${lastErr?.message || 'no response'}`)
}

// Collects a child's output so a failed start-up says why instead of just timing out.
function watch(child, name, sink) {
  const push = (buf) => { sink.push(`[${name}] ${String(buf).trimEnd()}`); if (sink.length > 60) sink.shift() }
  child.stdout?.on('data', push)
  child.stderr?.on('data', push)
}

export async function startApp() {
  const storeDir = await mkdtemp(join(tmpdir(), 'redlava-test-'))
  const storeFile = join(storeDir, 'store.json')
  const logs = []

  const env = {
    ...process.env,
    LOCAL_DEV: '1',
    LOCALSTORE_FILE: storeFile,
    // Generated per run: tokens from one run must not verify in the next.
    JWT_SECRET: crypto.randomBytes(48).toString('base64'),
    GUEST_PASSWORD: '123',
    PORT: String(API_PORT),
    // Deliberately empty: a test that needs a real Garmin or a paid AI key is a
    // test that will be switched off within a week.
    ANTHROPIC_API_KEY: '',
    KV_REST_API_URL: '',
    KV_REST_API_TOKEN: '',
    UPSTASH_REDIS_REST_URL: '',
    UPSTASH_REDIS_REST_TOKEN: '',
    REGISTRATION_CODE: '',
  }

  const api = spawn('node', ['server.js'], { cwd: join(ROOT, 'backend'), env, stdio: ['ignore', 'pipe', 'pipe'] })
  watch(api, 'api', logs)

  const web = spawn('npx', ['vite', '--port', String(WEB_PORT), '--strictPort'], {
    cwd: join(ROOT, 'frontend'),
    env: { ...env, VITE_PORT: String(WEB_PORT), VITE_API_TARGET: API },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  watch(web, 'web', logs)

  const stop = async () => {
    for (const c of [web, api]) { try { c.kill('SIGTERM') } catch { /* already gone */ } }
    await wait(300)
    for (const c of [web, api]) { try { c.kill('SIGKILL') } catch { /* already gone */ } }
    await rm(storeDir, { recursive: true, force: true })
  }

  try {
    await waitForHttp(`${API}/api/health`, { label: 'backend' })
    await waitForHttp(WEB, { label: 'frontend' })
  } catch (e) {
    await stop()
    throw new Error(`${e.message}\n--- last output ---\n${logs.join('\n')}`)
  }

  return { stop, storeFile, API, WEB }
}
