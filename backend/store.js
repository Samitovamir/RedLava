// Простое key-value хранилище для токенов подключений.
// В проде — Vercel KV / Upstash Redis (через REST, env подставляет Vercel).
// Локально без настроек — в памяти + файл (чтобы перезапуск бэкенда не сбрасывал подключения).

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ''
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''

const FILE = join(dirname(fileURLToPath(import.meta.url)), '.localstore.json')
// Жёсткий таймаут на каждый KV-запрос: критическая секция под замком должна
// гарантированно укладываться в LOCK_TTL, иначе зависший SET переоткрывает гонку.
const KV_TIMEOUT_MS = 3000
const kvSignal = () => AbortSignal.timeout(KV_TIMEOUT_MS)
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
    const r = await fetch(`${URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: kvSignal() })
    const d = await r.json()
    return d.result ? JSON.parse(d.result) : null
  } catch { return null }
}

// Возвращает true при успешной записи (важно для надёжной ротации токенов).
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

// Команда Redis через Upstash REST (массив в теле) — для SET с флагами и EVAL.
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

// Атомарный single-flight замок с ВЛАДЕЛЬЦЕМ (fenced): SET key <token> EX ttl NX.
// Возвращает уникальный токен-владелец при захвате, иначе null. Кросс-инстансно на
// Upstash; локально (без URL) — в памяти с истечением. Нужен, чтобы параллельные
// запросы не жгли одноразовый refresh_token Whoop одновременно.
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

// Снятие замка ТОЛЬКО своим токеном (compare-and-delete): держатель с истёкшим TTL
// не может снести замок преемника. На Upstash — атомарно через EVAL.
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

// Запись с ФЕНСИНГОМ замка: пишет value в key ТОЛЬКО если замок lockKey всё ещё
// принадлежит lockToken (атомарно через EVAL). Защищает от «замороженного» serverless-
// инстанса, чей TTL замка уже истёк на стороне Redis: его запоздалая запись отвергается,
// поэтому stale-ротация/пометка dead не затрут валидный токен преемника.
// Возвращает { applied, error }: applied — записали; error — сбой инфраструктуры (повтор).
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
