// Vercel serverless-функция для всех /api/* (см. routes в vercel.json).
// Legacy-роут сохраняет исходный путь (/api/ai/chat и т.д.), поэтому маршруты Express совпадают.
import app from '../backend/app.js'

export default app
