import express from 'express'
import cors from 'cors'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import aiRoutes from './routes/ai.js'
import calendarRoutes from './routes/calendar.js'
import garminRoutes from './routes/garmin.js'
import whoopRoutes from './routes/whoop.js'
import historyRoutes from './routes/history.js'
import labsRoutes from './routes/labs.js'
import nutritionRoutes from './routes/nutrition.js'
import authRoutes from './routes/auth.js'
import { requireAuth } from './authGuard.js'

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

// Открытые маршруты
app.use('/api/auth', authRoutes)
app.get('/api/health', (_, res) => res.json({ status: 'ok' }))

// Приватные маршруты — только после входа по паролю
app.use('/api/ai', requireAuth, aiRoutes)
app.use('/api/history', requireAuth, historyRoutes)
app.use('/api/labs', labsRoutes)
app.use('/api/nutrition', requireAuth, nutritionRoutes)

// Интеграции: внутри есть публичный OAuth-callback (переход в браузере),
// поэтому требование входа применяется точечно внутри роутов.
app.use('/api/calendar', calendarRoutes)
app.use('/api/whoop', whoopRoutes)
app.use('/api/garmin', requireAuth, garminRoutes)

export default app
