import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import aiRoutes from './routes/ai.js'
import calendarRoutes from './routes/calendar.js'
import gmailRoutes from './routes/gmail.js'
import garminRoutes from './routes/garmin.js'
import whoopRoutes from './routes/whoop.js'
import historyRoutes from './routes/history.js'
import labsRoutes from './routes/labs.js'
import nutritionRoutes from './routes/nutrition.js'
import syncRoutes from './routes/sync.js'
import authRoutes from './routes/auth.js'
import { requireAuth, roleFromReq } from './authGuard.js'

// Locally we read ../.env. On Vercel the variables come from the project settings
// (process.env) and there is no .env file — config simply does nothing, which is fine.
config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') })

const app = express()

// Security headers on responses (CSP for the page itself is configured separately in
// vercel.json — here the API only returns JSON, which CSP does not affect, so we turn it
// off to keep it out of the way).
app.use(helmet({ contentSecurityPolicy: false }))

// In production the frontend and the API share one domain, so the browser has nowhere to
// make a cross-origin request from; by default (no ALLOWED_ORIGIN) CORS for other domains
// is CLOSED. Locally (frontend on :5173, backend on :3001) we keep it open, otherwise
// development does not work at all. ALLOWED_ORIGIN can be set in the Vercel settings
// (comma-separated for several domains) if access from another domain is ever needed.
const allowedOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean)
app.use(cors({ origin: process.env.LOCAL_DEV === '1' ? true : (allowedOrigins.length ? allowedOrigins : false) }))
app.use(express.json({ limit: '10mb' }))

// On Vercel the catch-all function receives the path /api/*. To be safe we guarantee the
// /api prefix, so the routes match no matter how the platform hands us the path.
app.use((req, _res, next) => {
  if (!req.url.startsWith('/api/') && req.url !== '/api') req.url = '/api' + req.url
  next()
})

// GUEST: the user's real data is out of reach in principle. Any request to an integration
// endpoint carrying a guest token is intercepted HERE and answered with demo/empty data,
// never reaching the real Google/Whoop/Garmin/Gmail. That way a guest physically cannot see
// the owner's data. The disconnect endpoints belong here too: they only checked requireAuth
// (ANY valid token), and guest/123 is common knowledge (it is printed right on the sign-in
// screen and in the README) — without this line a guest could genuinely disconnect someone
// else's integrations. The route handlers now ALSO check for the account's own slot (scopeOf)
// themselves — the guard is not only here, in case this middleware is refactored later.
const GUEST_BLOCK = new Set([
  '/api/whoop/data', '/api/whoop/status', '/api/whoop/connect-url', '/api/whoop/disconnect',
  '/api/garmin/data', '/api/garmin/status', '/api/garmin/planned', '/api/garmin/connect', '/api/garmin/connect-url', '/api/garmin/disconnect',
  '/api/calendar/status', '/api/calendar/events', '/api/calendar/connect-url',
  '/api/calendar/create', '/api/calendar/update', '/api/calendar/delete', '/api/calendar/disconnect',
  '/api/gmail/status', '/api/gmail/send',
  '/api/labs/status', '/api/labs/files', '/api/labs/reports', '/api/labs/parse', '/api/labs/upload', '/api/labs/disconnect'
])
// The guest is a public demo: it never sees real data and has none of its own.
// Ordinary accounts (the 'user' role) do NOT reach this block, and that is deliberate:
// every data key carries its owner's id (userScope.js), so an account can physically
// only reach its own slot — it needs no separate ban.
app.use(async (req, res, next) => {
  if ((await roleFromReq(req)) !== 'guest') return next()
  const p = req.path
  if (p.startsWith('/api/garmin/activity')) return res.json({ connected: false, demo: true })
  if (!GUEST_BLOCK.has(p)) return next()
  if (p === '/api/gmail/send') return res.json({ ok: true, demo: true })        // pretend we did — nothing is actually sent
  if (p === '/api/calendar/create' || p === '/api/calendar/update' || p === '/api/calendar/delete') return res.json({ success: true, demo: true })
  if (p.endsWith('/disconnect')) return res.json({ ok: true, demo: true })      // pretend we did — nothing is actually disconnected
  if (p === '/api/labs/parse' || p === '/api/labs/upload') return res.json({ ok: false, message: 'В демо-режиме загрузка анализов отключена' })
  return res.json({ connected: false, planned: [], reports: [], files: [], events: [], demo: true })
})

// Public routes
app.use('/api/auth', authRoutes)
app.get('/api/health', (_, res) => res.json({ status: 'ok' }))

// Private routes — only after signing in with a password
app.use('/api/ai', requireAuth, aiRoutes)
app.use('/api/history', requireAuth, historyRoutes)
app.use('/api/labs', labsRoutes)
app.use('/api/nutrition', requireAuth, nutritionRoutes)
app.use('/api/sync', requireAuth, syncRoutes)

// Integrations: these contain a public OAuth callback (a browser redirect),
// so the sign-in requirement is applied selectively inside the routes.
app.use('/api/calendar', calendarRoutes)
app.use('/api/gmail', requireAuth, gmailRoutes)
app.use('/api/whoop', whoopRoutes)
app.use('/api/garmin', requireAuth, garminRoutes)

export default app
