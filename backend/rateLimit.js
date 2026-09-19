import { kvGet, kvSet } from './store.js'

// Fixed-window attempt counters, per client IP (or per account, see accountAttemptKey).
//
// The backend is serverless (Vercel): every invocation may get a fresh process, so a counter in
// a plain variable resets all the time. The counts live in the shared KV store instead — the
// same one that holds the guest's daily AI limit.
//
// This is hand-rolled rather than express-rate-limit for that reason, which is also why CodeQL's
// "missing rate limiting" query cannot see it: it only recognises the known middleware packages.

export const WINDOW_MS = 15 * 60 * 1000  // a 15-minute window

export function attemptKey(prefix, req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'noip'
  const window = Math.floor(Date.now() / WINDOW_MS)
  return `auth:${prefix}:${ip.replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 45)}:${window}`
}

// The same window counted per account instead of per IP, for an action taken inside a session.
// Whoever is guessing there already holds the account's token and can switch networks at will,
// so an IP counter would not slow them down; the account is the thing being attacked.
export function accountAttemptKey(prefix, userId) {
  return `auth:${prefix}:${String(userId).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64)}:${Math.floor(Date.now() / WINDOW_MS)}`
}

export async function tooManyFails(key, max) {
  return (Number(await kvGet(key)) || 0) >= max
}

export async function recordFail(key) {
  await kvSet(key, (Number(await kvGet(key)) || 0) + 1)
}

// Minutes left in the window — so a response can name a deadline instead of "wait a bit"
export const minutesLeft = () => Math.max(1, Math.ceil((WINDOW_MS - (Date.now() % WINDOW_MS)) / 60000))
