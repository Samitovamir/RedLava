import crypto from 'crypto'

// Токен выводится из пароля детерминированно: знать его = знать пароль.
// Пароль хранится только в переменной окружения, в коде/бандле его нет.
export function expectedToken() {
  const pw = process.env.APP_PASSWORD || ''
  return crypto.createHmac('sha256', pw).update('albert-dashboard-v1').digest('hex')
}

// Защита приватных маршрутов: пускаем только с валидным Bearer-токеном.
export function requireAuth(req, res, next) {
  if (!process.env.APP_PASSWORD) {
    // Пароль не задан на сервере — закрываем доступ, чтобы данные не утекли.
    return res.status(503).json({ error: 'auth_not_configured' })
  }
  const hdr = req.headers.authorization || ''
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : ''
  const exp = expectedToken()
  const a = Buffer.from(token)
  const b = Buffer.from(exp)
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next()
  return res.status(401).json({ error: 'unauthorized' })
}
