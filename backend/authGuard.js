import crypto from 'crypto'

// Две роли: 'owner' (полный доступ к реальным данным) и 'guest' (демо, без реальных данных).
// Токены детерминированы от APP_PASSWORD (секрет сервера) — гость не знает пароль владельца,
// поэтому НЕ может вычислить его токен и добраться до реальных данных.
const GUEST_PASSWORD = () => process.env.GUEST_PASSWORD || '123'

const hmac = (payload) => crypto.createHmac('sha256', process.env.APP_PASSWORD || '').update(payload).digest('hex')

export function tokenFor(role) {
  return hmac('albert-dashboard-v1:' + role)
}

// Токены прошлых версий принимаем как owner, чтобы деплой никого не разлогинивал:
//  • 'albert-dashboard-v1'         — формат без роли
//  • 'albert-dashboard-v1:albert'  — роль до переименования в 'owner'
const legacyOwnerTokens = () => [hmac('albert-dashboard-v1'), hmac('albert-dashboard-v1:albert')]

// Проверка пары имя+пароль при входе → роль или null.
export function roleForLogin(username, password) {
  if (typeof password !== 'string' || !password) return null
  const u = (username || '').trim().toLowerCase()
  if (u === 'guest') return password === GUEST_PASSWORD() ? 'guest' : null
  // Имя владельца не проверяем строго — пускаем по паролю (пустое имя тоже подходит)
  if (process.env.APP_PASSWORD && password === process.env.APP_PASSWORD) return 'owner'
  return null
}

const safeEqual = (token, exp) => {
  const a = Buffer.from(token), b = Buffer.from(exp)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Токен принадлежит владельцу? (текущий формат или один из старых)
const isOwnerToken = (token) =>
  safeEqual(token, tokenFor('owner')) || legacyOwnerTokens().some(t => safeEqual(token, t))

// Защита приватных маршрутов. Выставляет req.role ('owner' | 'guest').
export function requireAuth(req, res, next) {
  if (!process.env.APP_PASSWORD) return res.status(503).json({ error: 'auth_not_configured' })
  const hdr = req.headers.authorization || ''
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'unauthorized' })
  if (isOwnerToken(token)) { req.role = 'owner'; return next() }
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
  if (isOwnerToken(token)) return 'owner'
  if (safeEqual(token, tokenFor('guest'))) return 'guest'
  return null
}

// Совместимость: старый импорт expectedToken (= токен владельца)
export const expectedToken = () => tokenFor('owner')
