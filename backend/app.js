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

// Локально читаем ../.env. На Vercel переменные приходят из настроек проекта (process.env),
// файла .env там нет — config просто ничего не делает, это нормально.
config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') })

const app = express()

// Заголовки безопасности ответа (CSP отдельно настроен для самой страницы в vercel.json —
// здесь API отдаёт только JSON, CSP на него не влияет, поэтому отключаем, чтобы не мешал).
app.use(helmet({ contentSecurityPolicy: false }))

// В проде фронт и API на одном домене — кросс-доменные запросы браузеру идти неоткуда,
// поэтому по умолчанию (без ALLOWED_ORIGIN) CORS для чужих доменов ЗАКРЫТ. Локально
// (frontend на :5173, backend на :3001) держим открытым, иначе разработка не заведётся.
// ALLOWED_ORIGIN можно задать в настройках Vercel (через запятую — несколько доменов),
// если когда-нибудь понадобится доступ с другого домена.
const allowedOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean)
app.use(cors({ origin: process.env.LOCAL_DEV === '1' ? true : (allowedOrigins.length ? allowedOrigins : false) }))
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
// disconnect-эндпоинты — тоже сюда: они лишь проверяли requireAuth (валидный ЛЮБОЙ токен),
// а guest/123 общеизвестен (написан прямо на экране входа и в README) — без этой строки гость
// мог бы по-настоящему отключить чужие интеграции. Роут-хендлеры теперь ТОЖЕ проверяют
// наличие своей ячейки данных (scopeOf) сами — защита не только тут, на случай будущего
// рефакторинга этого мидлвара.
const GUEST_BLOCK = new Set([
  '/api/whoop/data', '/api/whoop/status', '/api/whoop/connect-url', '/api/whoop/disconnect',
  '/api/garmin/data', '/api/garmin/status', '/api/garmin/planned', '/api/garmin/connect', '/api/garmin/connect-url', '/api/garmin/disconnect',
  '/api/calendar/status', '/api/calendar/events', '/api/calendar/connect-url',
  '/api/calendar/create', '/api/calendar/update', '/api/calendar/delete', '/api/calendar/disconnect',
  '/api/gmail/status', '/api/gmail/send',
  '/api/labs/status', '/api/labs/files', '/api/labs/reports', '/api/labs/parse', '/api/labs/upload', '/api/labs/disconnect'
])
// Гость — публичное демо: реальных данных не видит никогда, своих у него нет.
// Обычные аккаунты (роль 'user') сюда НЕ ПОПАДАЮТ, и это намеренно: каждый ключ
// данных несёт id владельца (userScope.js), поэтому аккаунт физически ходит только
// в свою ячейку — отдельный запрет ему не нужен.
app.use(async (req, res, next) => {
  if ((await roleFromReq(req)) !== 'guest') return next()
  const p = req.path
  if (p.startsWith('/api/garmin/activity')) return res.json({ connected: false, demo: true })
  if (!GUEST_BLOCK.has(p)) return next()
  if (p === '/api/gmail/send') return res.json({ ok: true, demo: true })        // делаем вид — реально не отправляем
  if (p === '/api/calendar/create' || p === '/api/calendar/update' || p === '/api/calendar/delete') return res.json({ success: true, demo: true })
  if (p.endsWith('/disconnect')) return res.json({ ok: true, demo: true })      // делаем вид — реально не отключаем
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
