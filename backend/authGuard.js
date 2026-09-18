import jwt from 'jsonwebtoken'
import { kvGet, kvSet } from './store.js'

// Роли:
//   'owner' — владелец. Вход по общему паролю APP_PASSWORD, без имени: так он входил,
//             когда приложение было однопользовательским. Его данные живут под id 'owner'.
//   'guest' — публичное демо. Реальных данных не видит никогда: запросы к интеграциям
//             перехватываются в app.js (GUEST_BLOCK) и отдают демо-заглушки.
//   'user'  — обычный аккаунт: имя + пароль, хранится в users.js. Видит только свои
//             данные — каждый ключ хранилища несёт id владельца, см. userScope.js.
const VALID_ROLES = new Set(['owner', 'guest', 'user'])
const GUEST_PASSWORD = () => process.env.GUEST_PASSWORD || '123'

// Секрет подписи токенов. Исторически это был APP_PASSWORD (пароль владельца) — оставляем
// как запасной вариант, чтобы ничего не разлогинилось, но правильнее задать отдельный
// JWT_SECRET: пароль владельца со временем уйдёт совсем, а подпись токенов должна пережить это.
const secret = () => process.env.JWT_SECRET || process.env.APP_PASSWORD || ''

// Токен — подписанный JWT (HMAC-SHA256), а не вечная константа:
//  • живёт TOKEN_TTL и сам это проверяет (jwt.verify отклоняет просроченный),
//  • несёт "эпоху" (auth:epoch в общем KV-сторе) — подняв её на 1 (bumpAuthEpoch), можно
//    мгновенно разлогинить ВСЕ выданные раньше токены, не трогая пароль.
// При активном использовании токен молча продлевается на /api/auth/verify (см. routes/auth.js),
// поэтому обычный пользователь не разлогинивается сам по себе — только по-настоящему
// заброшенный или украденный токен истечёт через TOKEN_TTL бездействия.
const TOKEN_TTL = '30d'

async function currentEpoch() {
  return Number(await kvGet('auth:epoch')) || 0
}

// Поднять эпоху на 1 → все ранее выданные токены сразу перестают проходить.
// Используется кнопкой «выйти со всех устройств».
export async function bumpAuthEpoch() {
  await kvSet('auth:epoch', (await currentEpoch()) + 1)
}

// userId кладём в токен только для настоящих аккаунтов (role 'user'); у owner/guest его нет.
export async function signToken(role, userId = null) {
  const payload = { role, epoch: await currentEpoch() }
  if (userId) payload.userId = userId
  return jwt.sign(payload, secret(), { expiresIn: TOKEN_TTL })
}

// Старый путь входа: имя+пароль из переменных окружения → роль или null.
// Обычные аккаунты (имя+пароль) проверяются отдельно, в users.js.
export function roleForLogin(username, password) {
  if (typeof password !== 'string' || !password) return null
  const u = (username || '').trim().toLowerCase()
  if (u === 'guest') return password === GUEST_PASSWORD() ? 'guest' : null
  // Имя владельца не проверяем строго — пускаем по паролю (пустое имя тоже подходит)
  if (process.env.APP_PASSWORD && password === process.env.APP_PASSWORD) return 'owner'
  return null
}

function bearerToken(req) {
  const hdr = req.headers.authorization || ''
  return hdr.startsWith('Bearer ') ? hdr.slice(7) : ''
}

// Разобрать и проверить токен → { role, userId } или null. Проверяет подпись,
// срок действия (jwt.verify) И эпоху (не отозван ли массовым разлогином).
async function identityFromToken(token) {
  if (!token || !secret()) return null
  let payload
  try { payload = jwt.verify(token, secret()) } catch { return null }  // просрочен/подделан/старый формат
  if (!VALID_ROLES.has(payload.role)) return null
  if ((Number(payload.epoch) || 0) < (await currentEpoch())) return null  // отозван
  return { role: payload.role, userId: payload.userId || null }
}

// Защита приватных маршрутов. Выставляет req.role и req.userId (последний — только у role 'user').
export async function requireAuth(req, res, next) {
  if (!secret()) return res.status(503).json({ error: 'auth_not_configured' })
  try {
    const identity = await identityFromToken(bearerToken(req))
    if (!identity) return res.status(401).json({ error: 'unauthorized' })
    req.role = identity.role
    req.userId = identity.userId
    next()
  } catch {
    res.status(401).json({ error: 'unauthorized' })
  }
}

// Гость: реальные данные недоступны.
export const isGuestReq = (req) => req.role === 'guest'

// Определить роль по токену без отклонения запроса (для централизованного гард-мидлвара в app.js).
export async function roleFromReq(req) {
  if (!secret()) return null
  try { return (await identityFromToken(bearerToken(req)))?.role || null } catch { return null }
}
