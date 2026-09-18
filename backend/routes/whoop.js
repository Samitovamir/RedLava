import { Router } from 'express'
import crypto from 'crypto'
import { requireAuth } from '../authGuard.js'
import { kvGet, kvSet, kvDel, kvLock, kvUnlock, kvSetIfLocked } from '../store.js'
import { kvGetScoped, kvSetScoped, kvDelScoped, scopedKey, scopeOf } from '../userScope.js'

const router = Router()

// Key prefixes; the real keys carry the data owner's id (see userScope.js).
// The lock is per-person too: refreshing one person's token must not
// block everybody else.
const TOKENS_KEY = 'whoop:tokens'
const LOCK_KEY = 'whoop:refresh-lock'
const lockKeyOf = (userId) => scopedKey(LOCK_KEY, userId)
const ACCESS_SKEW_MS = 60 * 1000   // refresh the access_token a minute before it expires
// The critical section under the lock is HARD-bounded by timeouts:
//   kvGet(≤3s) + refreshGrant(≤7s) + persistRotation(3×≤3s + backoff ≈ 9.5s) ≈ 19.5s.
// LOCK_TTL_S = 35s leaves ~15s of headroom, so the lock cannot expire while its holder
// is still working (and Vercel kills a longer run before it manages to write anything).
const LOCK_TTL_S = 35
const REFRESH_TIMEOUT_MS = 7000   // hard timeout on the refresh grant
const delay = (ms) => new Promise(r => setTimeout(r, ms))
const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
const API = 'https://api.prod.whoop.com/developer'
const SCOPE = 'offline read:recovery read:sleep read:cycles read:workout read:profile read:body_measurement'

const configured = () =>
  !!(process.env.WHOOP_CLIENT_ID && process.env.WHOOP_CLIENT_SECRET && process.env.WHOOP_REDIRECT_URI)

function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL
  const proto = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}`
}

// Is the cache still good? (an access_token exists and hasn't expired, with margin)
function cacheValid(t) {
  return !!(t?.access_token && t.access_expires_at && Date.now() < t.access_expires_at - ACCESS_SKEW_MS)
}

// A single refresh grant. Returns { ok:true, data } | { ok:false, terminal:bool }.
// terminal=true → the refresh_token is dead (invalid_grant) → a reconnect is needed.
// terminal=false → a temporary failure (5xx/429/network) → leave the token ALONE.
async function refreshGrant(refresh_token) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token,
    client_id: process.env.WHOOP_CLIENT_ID,
    client_secret: process.env.WHOOP_CLIENT_SECRET,
    scope: 'offline'   // required: without it Whoop won't return a NEW refresh_token
  })
  let r
  try {
    r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS) })
  } catch { return { ok: false, terminal: false } } // network/timeout — temporary
  if (r.ok) {
    let d
    try { d = await r.json() } catch { return { ok: false, terminal: false } }
    if (!d.access_token) return { ok: false, terminal: false }
    return { ok: true, data: d }
  }
  // Terminal ONLY on invalid_grant (RFC 6749 §5.2) — the one code that means the
  // refresh_token was already used, has expired or was revoked. An empty body, 429, 5xx,
  // invalid_request, a proxy/WAF 4xx — all temporary (never mark a live token dead).
  let terminal = false
  if (r.status >= 400 && r.status < 500 && r.status !== 429) {
    try { const e = await r.json(); terminal = e?.error === 'invalid_grant' } catch { /* no body → temporary */ }
  }
  return { ok: false, terminal }
}

// Save the rotated record FENCED BY THE LOCK: we write only while we genuinely still hold
// the lock (kvSetIfLocked). If the instance froze and the lock's TTL expired, the late write
// is rejected and we don't clobber our successor's token. Returns 'saved' | 'lostlock' | 'failed'.
async function persistRotation(prev, d, lockToken, userId) {
  const expires_in = Number(d.expires_in) || 3600
  const rec = {
    refresh_token: d.refresh_token || prev.refresh_token, // offline → a new one; otherwise keep the current
    access_token: d.access_token,
    access_expires_at: Date.now() + expires_in * 1000,
    connected_at: prev.connected_at || Date.now(),
    updated_at: Date.now()
  }
  for (let i = 0; i < 3; i++) {
    const r = await kvSetIfLocked(scopedKey(TOKENS_KEY, userId), rec, lockKeyOf(userId), lockToken)
    if (r.applied) return 'saved'
    if (!r.error) return 'lostlock'   // lock lost (TTL expired while frozen) — the record isn't ours
    await delay(150)                  // network failure — retry
  }
  return 'failed'
}

// Mutate TOKENS_KEY under the shared lock (serialized against the refresh holder).
// Authoritative operations (/callback, /disconnect) wait a little on a busy lock, then
// go ahead regardless (the user's latest intent outweighs a background refresh).
async function withTokenLock(fn, userId) {
  let lockToken = null
  // The ~8s budget covers a normal refresh holder (refresh ≤7s); after that we write
  // authoritatively anyway (a reconnect/disconnect outweighs a background refresh; the
  // fencing on the holder's side stops its stale write clobbering our fresh token/deletion).
  for (let i = 0; i < 20 && !lockToken; i++) {
    lockToken = await kvLock(lockKeyOf(userId), LOCK_TTL_S)
    if (!lockToken) await delay(400)
  }
  try { return await fn() } finally { if (lockToken) await kvUnlock(lockKeyOf(userId), lockToken) }
}

// Get a working access_token. Returns { access } | { error: 'reauth' | 'transient' }.
// Single-flight through the KV lock: concurrent requests don't burn the one-shot refresh_token —
// only the lock holder refreshes, everyone else waits and reuses the fresh access_token.
async function getAccessToken({ force = false, staleAccess = null, userId = null } = {}) {
  if (!userId) return { error: 'reauth' }
  let t = await kvGetScoped(TOKENS_KEY, userId)
  if (!t?.refresh_token) return { error: 'reauth' }
  if (t.dead) return { error: 'reauth' }
  if (!force && cacheValid(t)) return { access: t.access_token }

  const lockToken = await kvLock(lockKeyOf(userId), LOCK_TTL_S)
  if (!lockToken) {
    // Someone else is already refreshing — wait for a FRESH token (force: strictly different
    // from the rejected one). The ~8s wait budget covers a holder's typical refresh (1–2s);
    // a rare slow one yields transient (a single empty response, self-healing on the next call).
    for (let i = 0; i < 20; i++) {
      await delay(400)
      t = await kvGetScoped(TOKENS_KEY, userId)
      if (t?.dead) return { error: 'reauth' }
      if (cacheValid(t) && t.access_token !== staleAccess) return { access: t.access_token }
    }
    return { error: 'transient' }
  }
  try {
    // Re-read under the lock: the previous holder may have rotated the token just now.
    t = await kvGetScoped(TOKENS_KEY, userId)
    if (!t?.refresh_token) return { error: 'reauth' }
    if (t.dead) return { error: 'reauth' }
    if (!force && cacheValid(t)) return { access: t.access_token }

    const res = await refreshGrant(t.refresh_token)
    if (res.ok) {
      // The rotated token was written (fenced) → hand out the fresh access;
      // 'lostlock'/'failed' → transient (the next call will pick up the current token).
      return (await persistRotation(t, res.data, lockToken, userId)) === 'saved'
        ? { access: res.data.access_token } : { error: 'transient' }
    }
    if (res.terminal) {
      // Re-read under the lock:
      const cur = await kvGetScoped(TOKENS_KEY, userId)
      // the record is gone (/disconnect) — do NOT resurrect a zombie token.
      if (!cur?.refresh_token) return { error: 'reauth' }
      // someone reconnected (a different refresh_token) — the verdict isn't ours; leave the fresh token alone.
      if (cur.refresh_token !== t.refresh_token) {
        return cacheValid(cur) ? { access: cur.access_token } : { error: 'transient' }
      }
      // Mark the token dead FENCED BY THE LOCK (if we lost the lock while frozen → don't
      // declare it dead, return transient: the next holder will settle the truth from a consistent read).
      for (let i = 0; i < 3; i++) {
        const r = await kvSetIfLocked(scopedKey(TOKENS_KEY, userId), { ...cur, dead: true, dead_at: Date.now() }, lockKeyOf(userId), lockToken)
        if (r.applied) return { error: 'reauth' }
        if (!r.error) return { error: 'transient' } // lock lost
        await delay(150)
      }
      return { error: 'transient' } // the write failed (network) — don't lie about being dead
    }
    return { error: 'transient' }
  } finally {
    await kvUnlock(lockKeyOf(userId), lockToken)
  }
}

// Returns the parsed JSON, null on an ordinary error, or 'unauth' on a 401
// (the API rejected the access_token → give /data a chance to force a refresh).
async function whoopGet(path, access) {
  let r
  try { r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(8000) }) }
  catch { return null }
  if (r.status === 401) return 'unauth'
  if (!r.ok) return null
  try { return await r.json() } catch { return null }
}

const ms2h = (m) => Math.round((m / 3600000) * 10) / 10

router.get('/connect-url', requireAuth, async (req, res) => {
  if (!configured()) return res.status(503).json({ error: 'not_configured' })
  const state = crypto.randomBytes(16).toString('hex')
  // state carries the initiator's id: the callback arrives from the browser without a token,
  // so without this there would be no way to tell whose connection to record.
  await kvSet('whoop:state:' + state, { at: Date.now(), userId: scopeOf(req) })
  const params = new URLSearchParams({
    client_id: process.env.WHOOP_CLIENT_ID,
    redirect_uri: process.env.WHOOP_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    state
  })
  res.json({ url: `${AUTH_URL}?${params}` })
})

router.get('/callback', async (req, res) => {
  const { code, state } = req.query
  const back = (ok) => res.redirect(`${appUrl(req)}/connections?whoop=${ok ? 'ok' : 'err'}`)
  try {
    if (!code || !state) return back(false)
    const pending = await kvGet('whoop:state:' + state)
    if (!pending) return back(false)
    await kvDel('whoop:state:' + state)
    const body = new URLSearchParams({
      grant_type: 'authorization_code', code,
      client_id: process.env.WHOOP_CLIENT_ID, client_secret: process.env.WHOOP_CLIENT_SECRET,
      redirect_uri: process.env.WHOOP_REDIRECT_URI
    })
    const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    if (!r.ok) return back(false)
    const d = await r.json()
    if (!d.refresh_token) return back(false)
    // A fresh connection: write the token and cache the access_token right away (and do NOT inherit dead).
    // Under the shared lock — so a background refresh can't clobber the fresh token (or mark it dead).
    if (!pending.userId) return back(false)   // old state with no owner — don't guess whose it is
    await withTokenLock(() => kvSetScoped(TOKENS_KEY, pending.userId, {
      refresh_token: d.refresh_token,
      access_token: d.access_token || null,
      access_expires_at: d.access_token ? Date.now() + (Number(d.expires_in) || 3600) * 1000 : 0,
      connected_at: Date.now()
    }), pending.userId)
    return back(true)
  } catch { return back(false) }
})

router.get('/status', requireAuth, async (req, res) => {
  const t = await kvGetScoped(TOKENS_KEY, scopeOf(req))
  // Be honest: a token marked dead (its refresh failed with invalid_grant) means not
  // connected, so the UI offers a reconnect. Whoop itself isn't called for this.
  res.json({ configured: configured(), connected: !!(t?.refresh_token && !t.dead) })
})

// Disconnects YOUR OWN integration: the key carries the data owner's id, so nobody else's can be touched.
// A guest has no business here (they have no slot of their own) — app.js turns them away as well.
router.post('/disconnect', requireAuth, async (req, res) => {
  if (!scopeOf(req)) return res.status(403).json({ error: 'forbidden' })
  // Under the shared lock — so a concurrent refresh can't resurrect the deleted token.
  await withTokenLock(() => kvDelScoped(TOKENS_KEY, scopeOf(req)), scopeOf(req))
  res.json({ ok: true })
})

// Fresh Whoop data → shaped for the Health page
router.get('/data', requireAuth, async (req, res) => {
  if (!configured()) return res.json({ connected: false })
  const userId = scopeOf(req)
  let tok = await getAccessToken({ userId })
  if (!tok.access) return res.json({ connected: false, needsReauth: tok.error === 'reauth' })

  const fetchAll = (access) => Promise.all([
    whoopGet('/v2/recovery?limit=7', access),
    whoopGet('/v2/activity/sleep?limit=10', access),
    whoopGet('/v2/cycle?limit=1', access)
  ])
  let [rec, sleep, cycle] = await fetchAll(tok.access)
  // The cached access_token was rejected (401) — force a refresh (demanding a FRESH token,
  // different from the rejected one) and retry once.
  if (rec === 'unauth' || sleep === 'unauth' || cycle === 'unauth') {
    tok = await getAccessToken({ force: true, staleAccess: tok.access, userId })
    if (!tok.access) return res.json({ connected: false, needsReauth: tok.error === 'reauth' })
    ;[rec, sleep, cycle] = await fetchAll(tok.access)
    // Even the fresh token is rejected by the API → the connection has to be re-created, not zeroed out.
    if (rec === 'unauth' || sleep === 'unauth' || cycle === 'unauth') {
      return res.json({ connected: false, needsReauth: true })
    }
  }

  const r = rec?.records?.[0]?.score || {}

  // A week of recovery — built from the real records (oldest to newest)
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace('.', '')
  const week = (rec?.records || [])
    .filter(x => x.score?.recovery_score != null)
    .map(x => ({
      day: cap(new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'short' }).format(new Date(x.created_at))),
      recovery: Math.round(x.score.recovery_score)
    }))
    .reverse()
  // Take the last NIGHT sleep, not a nap: Whoop stores a nap as a record of its
  // own, and with limit=1 it can shadow the main night's sleep.
  const sleepRecords = sleep?.records || []
  const sleepRec = sleepRecords.find(x => x.nap !== true) || sleepRecords[0] || {}
  const sRec = sleepRec.score || {}
  const cRec = cycle?.records?.[0]?.score || {}
  const stage = sRec.stage_summary || {}
  const need = sRec.sleep_needed || {}

  const slept = ms2h((stage.total_light_sleep_time_milli || 0) + (stage.total_slow_wave_sleep_time_milli || 0) + (stage.total_rem_sleep_time_milli || 0))
  const needed = ms2h((need.baseline_milli || 0) + (need.need_from_sleep_debt_milli || 0) + (need.need_from_recent_strain_milli || 0))

  // Real sleep stages (minutes) — so the phase bar updates instead of showing demo data
  const ms2min = (m) => Math.round((m || 0) / 60000)
  const stages = {
    awake: ms2min(stage.total_awake_time_milli),
    light: ms2min(stage.total_light_sleep_time_milli),
    rem: ms2min(stage.total_rem_sleep_time_milli),
    deep: ms2min(stage.total_slow_wave_sleep_time_milli)
  }
  const mskHHMM = (iso) => {
    if (!iso) return null
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) } catch { return null }
  }

  // A nap gets a tile of its own. Show it only if it is more recent than the night's
  // sleep (i.e. it happened today after waking up), not a stale one out of the history.
  const napRec = sleepRecords.find(x => x.nap === true && (!sleepRec.start || new Date(x.start) > new Date(sleepRec.start)))
  const napStage = napRec?.score?.stage_summary || {}
  const nap = napRec ? {
    hoursSlept: ms2h((napStage.total_light_sleep_time_milli || 0) + (napStage.total_slow_wave_sleep_time_milli || 0) + (napStage.total_rem_sleep_time_milli || 0)),
    start: mskHHMM(napRec.start),
    end: mskHHMM(napRec.end),
    performance: Math.round(napRec.score?.sleep_performance_percentage ?? 0)
  } : null

  res.json({
    connected: true,
    whoop: {
      recovery: Math.round(r.recovery_score ?? 0),
      strain: Math.round((cRec.strain ?? 0) * 10) / 10,
      hrv: Math.round(r.hrv_rmssd_milli ?? 0),
      rhr: Math.round(r.resting_heart_rate ?? 0),
      spo2: Math.round(r.spo2_percentage ?? 0),
      respiratoryRate: Math.round((sRec.respiratory_rate ?? 0) * 10) / 10,
      sleep: {
        hoursSlept: slept,
        hoursNeeded: needed,
        performance: Math.round(sRec.sleep_performance_percentage ?? 0),
        efficiency: Math.round(sRec.sleep_efficiency_percentage ?? 0),
        stages,
        start: mskHHMM(sleepRec.start),
        end: mskHHMM(sleepRec.end),
        cycles: sRec.sleep_cycle_count ?? null,
        disturbances: sRec.disturbance_count ?? null
      },
      nap,
      week
    }
  })
})

export default router
