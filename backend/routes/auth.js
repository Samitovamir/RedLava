import { Router } from 'express'
import { expectedToken, requireAuth } from '../authGuard.js'

const router = Router()

// Вход: проверяем пароль, отдаём токен для последующих запросов к API.
router.post('/login', (req, res) => {
  if (!process.env.APP_PASSWORD) return res.status(503).json({ error: 'auth_not_configured' })
  const { password } = req.body || {}
  if (typeof password === 'string' && password.length > 0 && password === process.env.APP_PASSWORD) {
    return res.json({ token: expectedToken() })
  }
  return res.status(401).json({ error: 'wrong_password' })
})

// Проверка действующего токена (для тихого входа при открытии сайта).
router.get('/verify', requireAuth, (_req, res) => res.json({ ok: true }))

export default router
