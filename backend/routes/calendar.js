import { Router } from 'express'
import crypto from 'crypto'
import { requireAuth } from '../authGuard.js'
import { kvGet, kvSet, kvDel } from '../store.js'

const router = Router()

const TOKENS_KEY = 'google:tokens'
const SCOPE = 'https://www.googleapis.com/auth/calendar'
const TZ = 'Europe/Moscow'

const configured = () =>
  !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI)

// Куда вернуть пользователя после OAuth (на страницу «Подключения»)
function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL
  const proto = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}`
}

// Обновить access_token по refresh_token
async function getAccessToken() {
  const t = await kvGet(TOKENS_KEY)
  if (!t?.refresh_token) return null
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: t.refresh_token,
    grant_type: 'refresh_token'
  })
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  })
  if (!r.ok) return null
  const d = await r.json()
  return d.access_token || null
}

// Google ISO → дата/время в МСК
function toMsk(iso) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return { date, time }
}

function mapEvent(ev) {
  const startRaw = ev.start?.dateTime || (ev.start?.date ? ev.start.date + 'T00:00:00+03:00' : null)
  const endRaw = ev.end?.dateTime || (ev.end?.date ? ev.end.date + 'T00:00:00+03:00' : null)
  if (!startRaw) return null
  const s = toMsk(startRaw)
  const e = endRaw ? toMsk(endRaw) : { time: s.time }
  const who = (ev.attendees || []).map(a => a.displayName || a.email).filter(Boolean).join(', ')
    || ev.organizer?.displayName || ''
  return {
    type: 'calendar',
    title: ev.summary || 'Событие',
    date: s.date,
    start: ev.start?.date ? '00:00' : s.time,
    end: ev.end?.date ? '23:59' : e.time,
    who,
    priority: 3,
    googleId: ev.id
  }
}

// 1) Получить ссылку для входа в Google (вызывается из приложения, с токеном)
router.get('/connect-url', requireAuth, async (req, res) => {
  if (!configured()) return res.status(503).json({ error: 'not_configured' })
  const state = crypto.randomBytes(16).toString('hex')
  await kvSet('google:state:' + state, { at: Date.now() })
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state
  })
  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
})

// 2) Google возвращает сюда (публично — это переход в браузере)
router.get('/callback', async (req, res) => {
  const { code, state } = req.query
  const back = (ok) => res.redirect(`${appUrl(req)}/connections?google=${ok ? 'ok' : 'err'}`)
  try {
    if (!code || !state) return back(false)
    const pending = await kvGet('google:state:' + state)
    if (!pending) return back(false)
    await kvDel('google:state:' + state)

    const body = new URLSearchParams({
      code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code'
    })
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
    })
    if (!r.ok) return back(false)
    const d = await r.json()
    if (!d.refresh_token) return back(false)  // нужен offline-доступ
    await kvSet(TOKENS_KEY, { refresh_token: d.refresh_token, connected_at: Date.now() })
    return back(true)
  } catch { return back(false) }
})

// 3) Статус подключения
router.get('/status', requireAuth, async (_req, res) => {
  const t = await kvGet(TOKENS_KEY)
  res.json({ configured: configured(), connected: !!t?.refresh_token })
})

// 4) Отключить
router.post('/disconnect', requireAuth, async (_req, res) => {
  await kvDel(TOKENS_KEY)
  res.json({ ok: true })
})

// 5) Загрузить ближайшие события
router.get('/events', requireAuth, async (_req, res) => {
  if (!configured()) return res.json({ events: [], connected: false })
  const access = await getAccessToken()
  if (!access) return res.json({ events: [], connected: false })
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    maxResults: '50', singleEvents: 'true', orderBy: 'startTime'
  })
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${access}` }
  })
  if (!r.ok) return res.json({ events: [], connected: true, error: 'fetch_failed' })
  const d = await r.json()
  const events = (d.items || []).map(mapEvent).filter(Boolean)
  res.json({ events, connected: true })
})

// 6) Создать событие в Google (для ИИ и ручного добавления)
router.post('/create', requireAuth, async (req, res) => {
  if (!configured()) return res.json({ success: false, message: 'not_configured' })
  const access = await getAccessToken()
  if (!access) return res.json({ success: false, message: 'not_connected' })
  const { title, date, start, end, who } = req.body || {}
  if (!title || !date || !start) return res.status(400).json({ success: false, message: 'bad_input' })
  const ev = {
    summary: title,
    description: who ? `С кем: ${who}` : undefined,
    start: { dateTime: `${date}T${start}:00`, timeZone: TZ },
    end: { dateTime: `${date}T${end || start}:00`, timeZone: TZ }
  }
  const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(ev)
  })
  if (!r.ok) return res.json({ success: false, message: 'create_failed' })
  const d = await r.json()
  res.json({ success: true, id: d.id })
})

// 7) Перенести/изменить событие (по googleId)
router.post('/update', requireAuth, async (req, res) => {
  const access = await getAccessToken()
  if (!access) return res.json({ success: false, message: 'not_connected' })
  const { googleId, title, date, start, end, who } = req.body || {}
  if (!googleId) return res.status(400).json({ success: false, message: 'no_id' })
  const patch = {}
  if (title) patch.summary = title
  if (date && start) patch.start = { dateTime: `${date}T${start}:00`, timeZone: TZ }
  if (date && end) patch.end = { dateTime: `${date}T${end}:00`, timeZone: TZ }
  if (who !== undefined) patch.description = who ? `С кем: ${who}` : ''
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleId}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  })
  res.json({ success: r.ok })
})

// 8) Удалить событие (по googleId)
router.post('/delete', requireAuth, async (req, res) => {
  const access = await getAccessToken()
  if (!access) return res.json({ success: false, message: 'not_connected' })
  const { googleId } = req.body || {}
  if (!googleId) return res.status(400).json({ success: false, message: 'no_id' })
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleId}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${access}` }
  })
  res.json({ success: r.ok || r.status === 410 }) // 410 = уже удалено
})

export default router
