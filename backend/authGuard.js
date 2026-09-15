import jwt from 'jsonwebtoken'
import { kvGet, kvSet } from './store.js'

// Две роли: 'owner' (полный доступ к реальным данным) и 'guest' (демо, без реальных данных).
const GUEST_PASSWORD = () => process.env.GUEST_PASSWORD || '123'
const secret = () => process.env.APP_PASSWORD || ''

// Токен — подписанный JWT (HMAC-SHA256 тем же секретом APP_PASSWORD), а не вечная константа:
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

// Поднять эпоху на 1 → все ранее выданные токены (owner и guest) сразу перестают проходить.
// Используется кнопкой «выйти со всех устройств».
export async function bumpAuthEpoch() {
  await kvSet('auth:epoch', (await currentEpoch()) + 1)
}

export async function signToken(role) {
  return jwt.sign({ role, epoch: await currentEpoch() }, secret(), { expiresIn: TOKEN_TTL })
}

// Проверка пары имя+пароль при входе → роль или null.
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

// Разобрать и проверить токен запроса → роль ('owner' | 'guest') или null. Проверяет подпись,
// срок действия (jwt.verify) И эпоху (не отозван ли массовым разлогином).
async function roleFromToken(token) {
  if (!token || !secret()) return null
  let payload
  try { payload = jwt.verify(token, secret()) } catch { return null }  // просрочен/подделан/старый формат
  if (payload.role !== 'owner' && payload.role !== 'guest') return null
  if ((Number(payload.epoch) || 0) < (await currentEpoch())) return null  // отозван
  return payload.role
}

// Защита приватных маршрутов. Выставляет req.role ('owner' | 'guest').
export async function requireAuth(req, res, next) {
  if (!process.env.APP_PASSWORD) return res.status(503).json({ error: 'auth_not_configured' })
  try {
    const role = await roleFromToken(bearerToken(req))
    if (!role) return res.status(401).json({ error: 'unauthorized' })
    req.role = role
    next()
  } catch {
    res.status(401).json({ error: 'unauthorized' })
  }
}

// Гость: реальные данные недоступны.
export const isGuestReq = (req) => req.role === 'guest'

// Определить роль по токену без отклонения запроса (для централизованного гард-мидлвара в app.js).
export async function roleFromReq(req) {
  if (!process.env.APP_PASSWORD) return null
  try { return await roleFromToken(bearerToken(req)) } catch { return null }
}
