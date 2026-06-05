// Простое key-value хранилище для токенов подключений.
// В проде — Vercel KV / Upstash Redis (через REST, env подставляет Vercel).
// Локально без настроек — в памяти + файл (чтобы перезапуск бэкенда не сбрасывал подключения).

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ''
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''

const FILE = join(dirname(fileURLToPath(import.meta.url)), '.localstore.json')
const mem = new Map()
if (!URL) {
  try { Object.entries(JSON.parse(readFileSync(FILE, 'utf8'))).forEach(([k, v]) => mem.set(k, v)) } catch { /* нет файла — ок */ }
}
function persist() {
  try { writeFileSync(FILE, JSON.stringify(Object.fromEntries(mem))) } catch { /* ignore */ }
}

export const storeReady = () => !!URL

export async function kvGet(key) {
  if (!URL) return mem.has(key) ? mem.get(key) : null
  try {
    const r = await fetch(`${URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
    const d = await r.json()
    return d.result ? JSON.parse(d.result) : null
  } catch { return null }
}

export async function kvSet(key, value) {
  if (!URL) { mem.set(key, value); persist(); return }
  try {
    await fetch(`${URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    })
  } catch { /* ignore */ }
}

export async function kvDel(key) {
  if (!URL) { mem.delete(key); persist(); return }
  try {
    await fetch(`${URL}/del/${encodeURIComponent(key)}`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } })
  } catch { /* ignore */ }
}
