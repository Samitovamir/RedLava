// Catch-all serverless-функция: все запросы /api/* приходят сюда и обрабатываются
// тем же Express-приложением, что и локально. Catch-all сохраняет полный путь
// (/api/ai/chat и т.д.), поэтому маршруты Express совпадают.
import app from '../backend/app.js'

export default app
