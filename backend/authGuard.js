import jwt from 'jsonwebtoken'
import { kvGet, kvSet } from './store.js'

// Роли:
//   'guest' — публичное демо. Реальных данных не видит никогда: запросы к интеграциям
//             перехватываются в app.js (GUEST_BLOCK) и отдают демо-заглушки.
//   'user'  — обычный аккаунт: имя + пароль, запись в users.js. Видит только свои данные —
//             каждый ключ хранилища несёт id владельца, см. userScope.js.
//
// Привилегированной роли НЕТ. Раньше была третья, 'owner': вход по общему паролю
// APP_PASSWORD, данные под фиксированным id, серверные права по самому факту роли.
// Это давало «особого человека» в мультипользовательской системе — отдельный путь входа,
// отдельную ветку в каждой проверке и наследование старых ключей.
// Действия, которые раньше требовали этой роли, стали личными: каждый распоряжается
// своими сессиями и своими данными. Для будущих действительно административных (список
// участников, сброс пароля участнику) в записи аккаунта есть поле isAdmin — проверка
// по нему добавится вместе с самими действиями, а не заранее.
const VALID_ROLES = new Set(['guest', 'user'])
const GUEST_PASSWORD = () => process.env.GUEST_PASSWORD || '123'

// Секрет подписи токенов. ОБЯЗАТЕЛЕН и отдельным значением — раньше сюда мог подставиться
// APP_PASSWORD, и это было плохо по двум причинам: смена пароля одного человека
// разлогинивала всех (подписи перестают сходиться), а пароль как криптографический ключ
// низкоэнтропийен — подпись HS256 на коротком пароле вскрывается офлайн-перебором, имея
// на руках любой выданный токен. Сгенерировать: openssl rand -base64 48
const secret = () => process.env.JWT_SECRET || ''

// Токен — подписанный JWT (HMAC-SHA256), а не вечная константа:
//  • живёт TOKEN_TTL и сам это проверяет (jwt.verify отклоняет просроченный),
//  • несёт эпоху сессий своего владельца (см. ниже).
// При активном использовании токен молча продлевается на /api/auth/verify (routes/auth.js),
// поэтому обычный пользователь не разлогинивается сам по себе — только по-настоящему
// заброшенный или украденный токен истечёт через TOKEN_TTL бездействия.
const TOKEN_TTL = '30d'

// Эпоха сессий — ПЕРСОНАЛЬНАЯ у каждого аккаунта: auth:epoch:<id>.
// Зачем вообще: JWT не хранится на сервере, поэтому отозвать его нельзя — украденный
// работает до истечения срока. Эпоха вшивается в токен при выдаче и сверяется при проверке;
// подняв её на 1, мы мгновенно обнуляем все ранее выданные токены ЭТОГО человека.
// Почему персональная, а не общая: общая означала бы, что «выйти со всех устройств»
// разлогинивает весь клуб, включая людей, не имеющих к событию отношения. Сценарий,
// который должен работать: украли телефон → зашёл с ноутбука → сменил пароль → выкинул
// свои сессии, у остальных ничего не произошло.
const epochKey = (userId) => `auth:epoch:${userId}`

async function currentEpoch(userId) {
  if (!userId) return 0            // у гостя нет аккаунта, отзывать нечего
  return Number(await kvGet(epochKey(userId))) || 0
}

// Отозвать все токены одного аккаунта. Вызывается кнопкой «выйти со всех устройств»
// и должна вызываться при смене пароля: иначе украденное устройство продолжит работать
// по старому токену, который про новый пароль ничего не знает.
export async function bumpUserEpoch(userId) {
  if (!userId) return
  await kvSet(epochKey(userId), (await currentEpoch(userId)) + 1)
}

export async function signToken(role, userId = null) {
  const payload = { role, epoch: await currentEpoch(userId) }
  if (userId) payload.userId = userId
  return jwt.sign(payload, secret(), { expiresIn: TOKEN_TTL })
}

// Гостевой вход — единственный путь, который не идёт через users.js: у демо нет записи
// аккаунта, пароль лежит в переменной окружения.
export function guestRoleForLogin(username, password) {
  if (typeof password !== 'string' || !password) return null
  if ((username || '').trim().toLowerCase() !== 'guest') return null
  return password === GUEST_PASSWORD() ? 'guest' : null
}

function bearerToken(req) {
  const hdr = req.headers.authorization || ''
  return hdr.startsWith('Bearer ') ? hdr.slice(7) : ''
}

// Разобрать и проверить токен → { role, userId } или null. Три независимые проверки:
// подпись и срок (jwt.verify), известность роли, не отозван ли массово (эпоха).
async function identityFromToken(token) {
  if (!token || !secret()) return null
  let payload
  // algorithms задан явно: без этого проверяющая сторона согласна на любой алгоритм,
  // указанный в самом токене, — а это классический способ обойти проверку подписи.
  try { payload = jwt.verify(token, secret(), { algorithms: ['HS256'] }) } catch { return null }
  // Роль из токена сверяем со списком, хотя подпись уже проверена: подпись доказывает,
  // что токен выдали мы, но не что его содержимое всё ещё осмысленно. Токены с удалённой
  // ролью 'owner' отвергаются именно здесь.
  if (!VALID_ROLES.has(payload.role)) return null
  const userId = payload.userId || null
  // Аккаунт обязан нести id, гость обязан его не нести — иначе токен собран неправильно.
  if ((payload.role === 'user') !== !!userId) return null
  if ((Number(payload.epoch) || 0) < (await currentEpoch(userId))) return null
  return { role: payload.role, userId }
}

// Защита приватных маршрутов. Выставляет req.role и req.userId (последний — только у 'user').
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

// Определить роль по токену без отклонения запроса (для гард-мидлвара в app.js).
export async function roleFromReq(req) {
  if (!secret()) return null
  try { return (await identityFromToken(bearerToken(req)))?.role || null } catch { return null }
}
