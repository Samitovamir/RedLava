import { Router } from 'express'
import { tokenFor, roleForLogin, requireAuth } from '../authGuard.js'

const router = Router()

// Вход: проверяем имя+пароль, отдаём токен и роль (albert | guest).
router.post('/login', (req, res) => {
  if (!process.env.APP_PASSWORD) return res.status(503).json({ error: 'auth_not_configured' })
  const { username, password } = req.body || {}
  const role = roleForLogin(username, password)
  if (!role) return res.status(401).json({ error: 'wrong_password' })
  return res.json({ token: tokenFor(role), role })
})

// Проверка действующего токена (для тихого входа при открытии сайта) — возвращаем роль.
router.get('/verify', requireAuth, (req, res) => res.json({ ok: true, role: req.role }))

export default router
