import express from 'express'
import cors from 'cors'
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

// Локально читаем ../.env. На Vercel переменные приходят из настроек проекта (process.env),
// файла .env там нет — config просто ничего не делает, это нормально.
config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') })

const app = express()

// В проде фронт и API на одном домене (CORS не нужен), но оставляем гибкость:
// ALLOWED_ORIGIN можно задать в настройках Vercel для ограничения. По умолчанию — отражаем origin.
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || true }))
app.use(express.json({ limit: '10mb' }))

// На Vercel catch-all-функция получает путь /api/*. На всякий случай гарантируем
// префикс /api, чтобы маршруты совпадали независимо от того, как платформа передаёт путь.
app.use((req, _res, next) => {
  if (!req.url.startsWith('/api/') && req.url !== '/api') req.url = '/api' + req.url
  next()
})

// ГОСТЬ: реальные данные пользователя недоступны в принципе. Любой запрос к эндпоинтам
// интеграций под гостевым токеном перехватывается ЗДЕСЬ и отдаёт демо/пусто, не доходя
// до реальных Google/Whoop/Garmin/Gmail. Так гость физически не может увидеть данные владельца.
const GUEST_BLOCK = new Set([
  '/api/whoop/data', '/api/whoop/status', '/api/whoop/connect-url',
  '/api/garmin/data', '/api/garmin/status', '/api/garmin/planned', '/api/garmin/connect', '/api/garmin/connect-url',
  '/api/calendar/status', '/api/calendar/events', '/api/calendar/connect-url',
  '/api/calendar/create', '/api/calendar/update', '/api/calendar/delete',
  '/api/gmail/status', '/api/gmail/send',
  '/api/labs/status', '/api/labs/files', '/api/labs/reports', '/api/labs/parse', '/api/labs/upload'
])
app.use((req, res, next) => {
  if (roleFromReq(req) !== 'guest') return next()
  const p = req.path
  if (p.startsWith('/api/garmin/activity')) return res.json({ connected: false, demo: true })
  if (!GUEST_BLOCK.has(p)) return next()
  if (p === '/api/gmail/send') return res.json({ ok: true, demo: true })        // делаем вид — реально не отправляем
  if (p === '/api/calendar/create' || p === '/api/calendar/update' || p === '/api/calendar/delete') return res.json({ success: true, demo: true })
  if (p === '/api/labs/parse' || p === '/api/labs/upload') return res.json({ ok: false, message: 'В демо-режиме загрузка анализов отключена' })
  return res.json({ connected: false, planned: [], reports: [], files: [], events: [], demo: true })
})

// Открытые маршруты
app.use('/api/auth', authRoutes)
app.get('/api/health', (_, res) => res.json({ status: 'ok' }))

// Приватные маршруты — только после входа по паролю
app.use('/api/ai', requireAuth, aiRoutes)
app.use('/api/history', requireAuth, historyRoutes)
app.use('/api/labs', labsRoutes)
app.use('/api/nutrition', requireAuth, nutritionRoutes)
app.use('/api/sync', requireAuth, syncRoutes)

// Интеграции: внутри есть публичный OAuth-callback (переход в браузере),
// поэтому требование входа применяется точечно внутри роутов.
app.use('/api/calendar', calendarRoutes)
app.use('/api/gmail', requireAuth, gmailRoutes)
app.use('/api/whoop', whoopRoutes)
app.use('/api/garmin', requireAuth, garminRoutes)

export default app
