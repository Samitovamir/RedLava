// A simple key-value store for the integration tokens.
// In production: Vercel KV / Upstash Redis (over REST, with Vercel supplying the env vars).
// Locally, with nothing to configure: in memory plus a file, so restarting the backend does
// not drop the connections.

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ''
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''

// LOCALSTORE_FILE lets the tests point at a throwaway store instead of sharing
// the developer's own one, which they would otherwise fill with test accounts.
const FILE = process.env.LOCALSTORE_FILE || join(dirname(fileURLToPath(import.meta.url)), '.localstore.json')
// A hard timeout on every KV request: the critical section under the lock has to fit inside
// LOCK_TTL with certainty, otherwise a hung SET reopens the race.
const KV_TIMEOUT_MS = 3000
const kvSignal = () => AbortSignal.timeout(KV_TIMEOUT_MS)
const mem = new Map()
if (!URL) {
  try { Object.entries(JSON.parse(readFileSync(FILE, 'utf8'))).forEach(([k, v]) => mem.set(k, v)) } catch { /* no file yet — fine */ }
}
function persist() {
  try { writeFileSync(FILE, JSON.stringify(Object.fromEntries(mem))) } catch { /* ignore */ }
}

export const storeReady = () => !!URL

export async function kvGet(key) {
  if (!URL) return mem.has(key) ? mem.get(key) : null
  try {
    const r = await fetch(`${URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: kvSignal() })
    const d = await r.json()
    return d.result ? JSON.parse(d.result) : null
  } catch { return null }
}

// Returns true when the write succeeded (which matters for reliable token rotation).
export async function kvSet(key, value) {
  if (!URL) { mem.set(key, value); persist(); return true }
  try {
    const r = await fetch(`${URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
      signal: kvSignal()
    })
    return r.ok
  } catch { return false }
}

export async function kvDel(key) {
  if (!URL) { mem.delete(key); persist(); return }
  try {
    await fetch(`${URL}/del/${encodeURIComponent(key)}`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, signal: kvSignal() })
  } catch { /* ignore */ }
}

// A Redis command over the Upstash REST API (an array in the body) — for SET with flags and EVAL.
async function redisCmd(args) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: kvSignal()
  })
  return r.json()
}

const newOwner = () =>
  globalThis.crypto?.randomUUID?.() || (Date.now() + '-' + Math.random().toString(36).slice(2))

// An atomic single-flight lock with an OWNER (fenced): SET key <token> EX ttl NX.
// Returns a unique owner token when the lock is taken, otherwise null. Works across
// instances on Upstash; locally (with no URL) it lives in memory and expires. It exists so
// that parallel requests do not burn Whoop's single-use refresh_token at the same time.
export async function kvLock(key, ttlSec) {
  const token = newOwner()
  if (!URL) {
    const now = Date.now()
    const cur = mem.get('__lock__' + key)
    if (cur && cur.exp > now) return null
    mem.set('__lock__' + key, { token, exp: now + ttlSec * 1000 })
    return token
  }
  try {
    const d = await redisCmd(['SET', key, token, 'EX', String(ttlSec), 'NX'])
    return d.result === 'OK' ? token : null
  } catch { return null }
}

// Release the lock ONLY with your own token (compare-and-delete): a holder whose TTL has
// expired cannot tear down its successor's lock. On Upstash this is atomic, via EVAL.
export async function kvUnlock(key, token) {
  if (!token) return
  if (!URL) {
    const cur = mem.get('__lock__' + key)
    if (cur && cur.token === token) mem.delete('__lock__' + key)
    return
  }
  try {
    await redisCmd(['EVAL', 'if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end', '1', key, token])
  } catch { /* ignore */ }
}

// A FENCED write: stores value at key ONLY if the lock at lockKey still belongs to lockToken
// (atomically, via EVAL). It guards against a "frozen" serverless instance whose lock TTL has
// already expired on the Redis side: its late write is rejected, so a stale rotation or dead
// marking cannot overwrite the successor's valid token.
// Returns { applied, error }: applied — the write went through; error — infrastructure failure (retry).
export async function kvSetIfLocked(key, value, lockKey, lockToken) {
  if (!lockToken) return { applied: false, error: false }
  if (!URL) {
    const lk = mem.get('__lock__' + lockKey)
    if (lk && lk.token === lockToken && lk.exp > Date.now()) { mem.set(key, value); persist(); return { applied: true, error: false } }
    return { applied: false, error: false }
  }
  try {
    const d = await redisCmd(['EVAL', 'if redis.call("get",KEYS[2])==ARGV[2] then redis.call("set",KEYS[1],ARGV[1]); return 1 else return 0 end', '2', key, lockKey, JSON.stringify(value), lockToken])
    return { applied: d.result === 1, error: false }
  } catch { return { applied: false, error: true } }
}
