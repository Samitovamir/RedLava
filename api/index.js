// The Vercel serverless function behind every /api/* request (see routes in vercel.json).
// The legacy route preserves the original path (/api/ai/chat etc.), so the Express routes still match.
import app from '../backend/app.js'

export default app
