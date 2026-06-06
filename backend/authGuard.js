import crypto from 'crypto'

// Две роли: 'albert' (полный доступ к реальным данным) и 'guest' (демо, без реальных данных).
// Токены детерминированы от APP_PASSWORD (секрет сервера) — гость не знает пароль владельца,
// поэтому НЕ может вычислить его токен и добраться до реальных данных.
const GUEST_PASSWORD = () => process.env.GUEST_PASSWORD || '123'

export function tokenFor(role) {
  const pw = process.env.APP_PASSWORD || ''
  return crypto.createHmac('sha256', pw).update('albert-dashboard-v1:' + role).digest('hex')
}
// Старый формат токена (без роли) — принимаем как albert, чтобы не разлогинивать после деплоя.
function legacyToken() {
  const pw = process.env.APP_PASSWORD || ''
  return crypto.createHmac('sha256', pw).update('albert-dashboard-v1').digest('hex')
}

// Проверка пары имя+пароль при входе → роль или null.
export function roleForLogin(username, password) {
  if (typeof password !== 'string' || !password) return null
  const u = (username || '').trim().toLowerCase()
  if (process.env.APP_PASSWORD && password === process.env.APP_PASSWORD && (u === 'albert' || u === '')) return 'albert'
  if (u === 'guest' && password === GUEST_PASSWORD()) return 'guest'
  return null
}

const safeEqual = (token, exp) => {
  const a = Buffer.from(token), b = Buffer.from(exp)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Защита приватных маршрутов. Выставляет req.role ('albert' | 'guest').
export function requireAuth(req, res, next) {
  if (!process.env.APP_PASSWORD) return res.status(503).json({ error: 'auth_not_configured' })
  const hdr = req.headers.authorization || ''
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'unauthorized' })
  if (safeEqual(token, tokenFor('albert')) || safeEqual(token, legacyToken())) { req.role = 'albert'; return next() }
  if (safeEqual(token, tokenFor('guest'))) { req.role = 'guest'; return next() }
  return res.status(401).json({ error: 'unauthorized' })
}

// Гость: реальные данные недоступны.
export const isGuestReq = (req) => req.role === 'guest'

// Определить роль по токену без отклонения запроса (для централизованного гард-мидлвара).
export function roleFromReq(req) {
  if (!process.env.APP_PASSWORD) return null
  const hdr = req.headers.authorization || ''
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : ''
  if (!token) return null
  if (safeEqual(token, tokenFor('albert')) || safeEqual(token, legacyToken())) return 'albert'
  if (safeEqual(token, tokenFor('guest'))) return 'guest'
  return null
}

// Совместимость: старый импорт expectedToken (= токен albert)
export const expectedToken = () => tokenFor('albert')
