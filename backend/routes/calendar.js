import { Router } from 'express'
import crypto from 'crypto'
import { requireAuth } from '../authGuard.js'
import { kvGet, kvSet, kvDel } from '../store.js'
import { kvGetScoped, kvSetScoped, kvDelScoped, scopeOf } from '../userScope.js'

const router = Router()

// The key's base; the real key also carries the data owner's id (see userScope.js)
const TOKENS_KEY = 'google:tokens'
// One shared Google sign-in for every service: calendar + sending mail (Gmail)
const SCOPE = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send'
const TZ = 'Europe/Moscow'

const configured = () =>
  !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI)

// Where to send the user back to after OAuth (the "Connections" page)
function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL
  const proto = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}`
}

// Refresh the access_token using the refresh_token (exported — shared by Gmail and the other Google services)
export async function getAccessToken(userId) {
  if (!userId) return null
  const t = await kvGetScoped(TOKENS_KEY, userId)
  if (!t?.refresh_token || t.dead) return null   // don't poke a dead token — it needs a reconnect
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: t.refresh_token,
    grant_type: 'refresh_token'
  })
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  })
  if (!r.ok) {
    // invalid_grant = the refresh_token has expired or been revoked. For Google apps still in
    // "Testing" status the token only lives 7 days. We mark it dead so /status can honestly say
    // "reconnect" instead of showing a green check over a silently empty calendar.
    // (A network error or a 5xx does NOT bury the token.)
    try { const e = await r.json(); if (e?.error === 'invalid_grant') await kvSetScoped(TOKENS_KEY, userId, { ...t, dead: true, dead_at: Date.now() }) } catch { /* a temporary failure — leave the token alone */ }
    return null
  }
  const d = await r.json()
  return d.access_token || null
}

// Google ISO → date/time in Moscow time
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

// 1) Get the Google sign-in link (called from the app, with a token)
router.get('/connect-url', requireAuth, async (req, res) => {
  if (!configured()) return res.status(503).json({ error: 'not_configured' })
  const state = crypto.randomBytes(16).toString('hex')
  await kvSet('google:state:' + state, { at: Date.now(), userId: scopeOf(req) })
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

// 2) Google redirects back here (public — it is a browser navigation)
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
    if (!d.refresh_token) return back(false)  // offline access is required
    if (!pending.userId) return back(false)   // an old state with no owner — we don't guess whose it is
    await kvSetScoped(TOKENS_KEY, pending.userId, { refresh_token: d.refresh_token, connected_at: Date.now() })
    return back(true)
  } catch { return back(false) }
})

// 3) Connection status. Honestly: a token marked dead (its refresh failed with invalid_grant)
// means "not connected" + needsReconnect, so the UI offers to reconnect (same as Whoop).
router.get('/status', requireAuth, async (req, res) => {
  const t = await kvGetScoped(TOKENS_KEY, scopeOf(req))
  const hasToken = !!t?.refresh_token
  res.json({
    configured: configured(),
    connected: hasToken && !t.dead,
    needsReconnect: hasToken && !!t.dead
  })
})

// Disconnects the caller's OWN integration: the key carries the data owner's id, so someone
// else's cannot be touched. A guest has no business here (it has no slot of its own) — and
// app.js cuts it off anyway.
router.post('/disconnect', requireAuth, async (req, res) => {
  if (!scopeOf(req)) return res.status(403).json({ error: 'forbidden' })
  await kvDelScoped(TOKENS_KEY, scopeOf(req))
  res.json({ ok: true })
})

// 5) Load the upcoming events
router.get('/events', requireAuth, async (req, res) => {
  if (!configured()) return res.json({ events: [], connected: false })
  const access = await getAccessToken(scopeOf(req))   // on invalid_grant this marks the token dead
  if (!access) {
    const t = await kvGetScoped(TOKENS_KEY, scopeOf(req))
    return res.json({ events: [], connected: false, needsReconnect: !!(t?.refresh_token && t.dead) })
  }
  // timeMin is the START of today in Moscow time, not "now" — otherwise today's events that
  // have already passed drop out of the schedule. This way they stay visible all day.
  const mp = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
  const pad = n => String(n).padStart(2, '0')
  const dayStartMsk = `${mp.getFullYear()}-${pad(mp.getMonth() + 1)}-${pad(mp.getDate())}T00:00:00+03:00`
  const params = new URLSearchParams({
    timeMin: dayStartMsk,
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

// 6) Create an event in Google (used by the AI and by manual adds)
router.post('/create', requireAuth, async (req, res) => {
  if (!configured()) return res.json({ success: false, message: 'not_configured' })
  const access = await getAccessToken(scopeOf(req))
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

// Google event ids are base32hex (a–v, 0–9); instances of a recurring event add "_" and a
// timestamp such as 20260918T063000Z. Anything else is refused before it reaches the URL:
// the id used to be pasted into the path as-is, so "../../<calendarId>" turned a request to
// delete one event into a request to delete a whole calendar, with the user's own token.
// It is also encoded as a path segment, in case this check is ever loosened.
const GOOGLE_ID = /^[A-Za-z0-9_]{1,1024}$/
const eventUrl = (googleId) =>
  `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleId)}`

// 7) Reschedule or edit an event (by googleId)
router.post('/update', requireAuth, async (req, res) => {
  const access = await getAccessToken(scopeOf(req))
  if (!access) return res.json({ success: false, message: 'not_connected' })
  const { googleId, title, date, start, end, who } = req.body || {}
  if (!GOOGLE_ID.test(String(googleId || ''))) return res.status(400).json({ success: false, message: 'no_id' })
  const patch = {}
  if (title) patch.summary = title
  if (date && start) patch.start = { dateTime: `${date}T${start}:00`, timeZone: TZ }
  if (date && end) patch.end = { dateTime: `${date}T${end}:00`, timeZone: TZ }
  if (who !== undefined) patch.description = who ? `С кем: ${who}` : ''
  const r = await fetch(eventUrl(googleId), {
    method: 'PATCH', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  })
  res.json({ success: r.ok })
})

// 8) Delete an event (by googleId)
router.post('/delete', requireAuth, async (req, res) => {
  const access = await getAccessToken(scopeOf(req))
  if (!access) return res.json({ success: false, message: 'not_connected' })
  const { googleId } = req.body || {}
  if (!GOOGLE_ID.test(String(googleId || ''))) return res.status(400).json({ success: false, message: 'no_id' })
  const r = await fetch(eventUrl(googleId), {
    method: 'DELETE', headers: { Authorization: `Bearer ${access}` }
  })
  res.json({ success: r.ok || r.status === 410 }) // 410 = already deleted
})

export default router
