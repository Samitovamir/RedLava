// Vercel serverless-эндпоинт: монтирует тот же Express-app, что и локально.
// Все /api/* запросы Vercel направляет сюда (см. vercel.json).
import app from '../backend/app.js'

export default app
