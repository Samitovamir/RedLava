import { Router } from 'express'
import { signToken, roleForLogin, requireAuth, bumpAuthEpoch } from '../authGuard.js'
import { kvGet, kvSet } from '../store.js'

const router = Router()

// --- Защита от подбора пароля ---
// Бэкенд serverless (Vercel) — у каждого вызова может быть новый процесс, поэтому счётчик
// в обычной переменной не сработает (сбрасывается каждый раз). Используем kvGet/kvSet —
// тот же общий стор, что и для дневного лимита ИИ у гостя.
const LOGIN_WINDOW_MS = 15 * 60 * 1000  // окно 15 минут
const LOGIN_MAX_FAILS = 8               // неудачных попыток за окно — дальше блок

function loginAttemptKey(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'noip'
  const window = Math.floor(Date.now() / LOGIN_WINDOW_MS)
  return `auth:fails:${ip.replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 45)}:${window}`
}

// Вход: проверяем имя+пароль, отдаём токен и роль (owner | guest).
router.post('/login', async (req, res) => {
  if (!process.env.APP_PASSWORD) return res.status(503).json({ error: 'auth_not_configured' })

  const attemptKey = loginAttemptKey(req)
  const fails = Number(await kvGet(attemptKey)) || 0
  if (fails >= LOGIN_MAX_FAILS) {
    return res.status(429).json({ error: 'too_many_attempts', message: 'Слишком много неудачных попыток входа. Подождите немного и попробуйте снова.' })
  }

  const { username, password } = req.body || {}
  const role = roleForLogin(username, password)
  if (!role) {
    await kvSet(attemptKey, fails + 1)  // считаем только неудачи — угадавший с первого раза не наказывается
    return res.status(401).json({ error: 'wrong_password' })
  }
  return res.json({ token: await signToken(role), role })
})

// Проверка действующего токена (для тихого входа при открытии сайта) — возвращаем роль
// и СВЕЖИЙ токен: активный пользователь так продлевает себе сессию на ещё TOKEN_TTL и никогда
// не разлогинивается сам по себе, а истинно заброшенный/украденный токен через TOKEN_TTL истечёт.
router.get('/verify', requireAuth, async (req, res) => res.json({ ok: true, role: req.role, token: await signToken(req.role) }))

// «Выйти со всех устройств»: поднимает эпоху сессий — все ранее выданные токены (свои и чужие,
// owner и guest) сразу перестают действовать, без смены пароля. Доступно только владельцу.
router.post('/logout-all', requireAuth, async (req, res) => {
  if (req.role !== 'owner') return res.status(403).json({ error: 'forbidden' })
  await bumpAuthEpoch()
  res.json({ ok: true })
})

export default router
