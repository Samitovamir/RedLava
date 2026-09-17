import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { kvGet, kvSet, kvLock, kvUnlock } from './store.js'

/*
  Аккаунты пользователей (этап «а» перехода на мультипользовательскую модель).

  Вход — по ИМЕНИ и паролю (не по почте): так же, как владелец входил раньше,
  чтобы на одном экране не было путаницы «тут имя, а тут почта». Почты у аккаунта
  пока нет вовсе — добавим, когда понадобится восстановление пароля.

  Хранение — в том же KV, что и всё остальное, двумя ключами:
    users:by-login:<имя в нижнем регистре>  → id пользователя (индекс для входа)
    users:<id>                              → { id, name, passwordHash, createdAt }

  Почему bcryptjs, а не bcrypt/argon2: те требуют нативной сборки при установке,
  а бэкенд едет serverless-функцией на Vercel — нативный модуль там лишний риск
  на этапе сборки. Чистый JS медленнее по CPU, но вход — не горячий путь.

  ВАЖНО: сами данные (календарь, Whoop, Garmin, анализы) пока НЕ привязаны к
  аккаунту — это этапы «б»/«в»/«г». До них новый аккаунт намеренно не получает
  доступа к реальным данным владельца (см. app.js, DEMO_ROLES).
*/

const BCRYPT_ROUNDS = 10
export const MIN_PASSWORD_LENGTH = 8
const MIN_NAME_LENGTH = 2
const MAX_NAME_LENGTH = 40
// Имена, которые нельзя занимать: 'guest' — публичное демо, иначе чужой аккаунт
// с таким именем начал бы перехватывать демо-вход.
const RESERVED_NAMES = new Set(['guest', 'гость'])
// Пробелы и точки/дефисы/подчёркивания разрешаем, «собаку» — нет: имя не должно
// выглядеть почтой, иначе снова та самая путаница.
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u

export const normalizeLogin = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')

const loginKey = (name) => `users:by-login:${normalizeLogin(name)}`
const userKey = (id) => `users:${id}`

// Проверка входных данных при регистрации → код ошибки или null, если всё в порядке.
export function validateCredentials(name, password) {
  const n = String(name || '').trim()
  const norm = normalizeLogin(n)
  if (!norm || norm.length < MIN_NAME_LENGTH || norm.length > MAX_NAME_LENGTH || !NAME_RE.test(n)) return 'bad_name'
  if (RESERVED_NAMES.has(norm)) return 'name_reserved'
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) return 'weak_password'
  // bcrypt учитывает только первые 72 байта пароля — длиннее просто нет смысла принимать
  if (Buffer.byteLength(password, 'utf8') > 72) return 'password_too_long'
  return null
}

export async function getUserById(id) {
  if (!id) return null
  return (await kvGet(userKey(id))) || null
}

export async function findUserByLogin(name) {
  const id = await kvGet(loginKey(name))
  if (!id) return null
  return await getUserById(id)
}

// Создать аккаунт. Возвращает { user } либо { error: 'name_taken' | 'store_failed' | 'busy' }.
// Проверка «занято ли имя» и запись идут под замком: без него два одновременных
// запроса с одним именем могли бы создать две записи и затереть индекс друг друга.
export async function createUser(name, password) {
  const display = String(name || '').trim().replace(/\s+/g, ' ')
  const norm = normalizeLogin(display)
  const lockKey = `users:create-lock:${norm}`
  const lockToken = await kvLock(lockKey, 10)
  if (!lockToken) return { error: 'busy' }
  try {
    if (await kvGet(loginKey(norm))) return { error: 'name_taken' }

    const user = {
      id: crypto.randomUUID(),
      name: display,                 // как ввёл человек — для отображения
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      createdAt: Date.now()
    }
    // Сначала саму запись, потом индекс: если упадём между ними, останется «сирота»
    // без индекса (имя будет считаться свободным), а не индекс без записи —
    // из двух неполных состояний это безопаснее.
    if (!(await kvSet(userKey(user.id), user))) return { error: 'store_failed' }
    if (!(await kvSet(loginKey(norm), user.id))) return { error: 'store_failed' }
    return { user }
  } finally {
    await kvUnlock(lockKey, lockToken)
  }
}

// Вход: имя + пароль → запись пользователя или null.
export async function verifyUserPassword(name, password) {
  const user = await findUserByLogin(name)
  if (!user?.passwordHash) return null
  const ok = await bcrypt.compare(String(password || ''), user.passwordHash)
  return ok ? user : null
}

// Публичная (безопасная для отдачи на фронт) проекция записи — без хеша пароля.
export const publicUser = (user) => (user ? { id: user.id, name: user.name } : null)
