import { Router } from 'express'
import crypto from 'crypto'
import { requireAuth } from '../authGuard.js'
import { kvGet, kvSet, kvDel } from '../store.js'

const router = Router()

const TOKENS_KEY = 'whoop:tokens'
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

async function getAccessToken() {
  const t = await kvGet(TOKENS_KEY)
  if (!t?.refresh_token) return null
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: t.refresh_token,
    client_id: process.env.WHOOP_CLIENT_ID,
    client_secret: process.env.WHOOP_CLIENT_SECRET,
    scope: 'offline'
  })
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  if (!r.ok) return null
  const d = await r.json()
  if (d.refresh_token) await kvSet(TOKENS_KEY, { refresh_token: d.refresh_token, updated_at: Date.now() })
  return d.access_token || null
}

async function whoopGet(path, access) {
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${access}` } })
  if (!r.ok) return null
  return r.json()
}

const ms2h = (m) => Math.round((m / 3600000) * 10) / 10

router.get('/connect-url', requireAuth, async (_req, res) => {
  if (!configured()) return res.status(503).json({ error: 'not_configured' })
  const state = crypto.randomBytes(16).toString('hex')
  await kvSet('whoop:state:' + state, { at: Date.now() })
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
    await kvSet(TOKENS_KEY, { refresh_token: d.refresh_token, connected_at: Date.now() })
    return back(true)
  } catch { return back(false) }
})

router.get('/status', requireAuth, async (_req, res) => {
  const t = await kvGet(TOKENS_KEY)
  res.json({ configured: configured(), connected: !!t?.refresh_token })
})

router.post('/disconnect', requireAuth, async (_req, res) => {
  await kvDel(TOKENS_KEY)
  res.json({ ok: true })
})

// Свежие данные Whoop → форма для страницы «Здоровье»
router.get('/data', requireAuth, async (_req, res) => {
  if (!configured()) return res.json({ connected: false })
  const access = await getAccessToken()
  if (!access) return res.json({ connected: false })

  const [rec, sleep, cycle] = await Promise.all([
    whoopGet('/v2/recovery?limit=7', access),
    whoopGet('/v2/activity/sleep?limit=1', access),
    whoopGet('/v2/cycle?limit=1', access)
  ])
  const r = rec?.records?.[0]?.score || {}

  // Неделя восстановления — из реальных записей (от старых к новым)
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace('.', '')
  const week = (rec?.records || [])
    .filter(x => x.score?.recovery_score != null)
    .map(x => ({
      day: cap(new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'short' }).format(new Date(x.created_at))),
      recovery: Math.round(x.score.recovery_score)
    }))
    .reverse()
  const sleepRec = sleep?.records?.[0] || {}
  const sRec = sleepRec.score || {}
  const cRec = cycle?.records?.[0]?.score || {}
  const stage = sRec.stage_summary || {}
  const need = sRec.sleep_needed || {}

  const slept = ms2h((stage.total_light_sleep_time_milli || 0) + (stage.total_slow_wave_sleep_time_milli || 0) + (stage.total_rem_sleep_time_milli || 0))
  const needed = ms2h((need.baseline_milli || 0) + (need.need_from_sleep_debt_milli || 0) + (need.need_from_recent_strain_milli || 0))

  // Реальные стадии сна (минуты) — чтобы полоса фаз обновлялась, а не показывала демо
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
      week
    }
  })
})

export default router
