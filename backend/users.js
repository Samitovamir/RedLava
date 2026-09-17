import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { kvGet, kvSet, kvLock, kvUnlock } from './store.js'

/*
  Аккаунты пользователей (этап «а» перехода на мультипользовательскую модель).

  Хранение — в том же KV, что и всё остальное, двумя ключами:
    users:by-email:<email>  → id пользователя (индекс для входа по почте)
    users:<id>              → { id, email, passwordHash, createdAt }

  Почему bcryptjs, а не bcrypt/argon2: те требуют нативной сборки при установке,
  а бэкенд едет serverless-функцией на Vercel — нативный модуль там лишний риск
  на этапе сборки. Чистый JS медленнее по CPU, но вход — не горячий путь.

  ВАЖНО: сами данные (календарь, Whoop, Garmin, анализы) пока НЕ привязаны к
  аккаунту — это этапы (б)/(в)/(г). До них новый аккаунт намеренно не получает
  доступа к реальным данным владельца (см. app.js, DEMO_ROLES).
*/

const BCRYPT_ROUNDS = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const MIN_PASSWORD_LENGTH = 8

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase()

const emailKey = (email) => `users:by-email:${normalizeEmail(email)}`
const userKey = (id) => `users:${id}`

// Проверка входных данных при регистрации → код ошибки или null, если всё в порядке.
export function validateCredentials(email, password) {
  const e = normalizeEmail(email)
  if (!e || e.length > 200 || !EMAIL_RE.test(e)) return 'bad_email'
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) return 'weak_password'
  // bcrypt учитывает только первые 72 байта пароля — длиннее просто нет смысла принимать
  if (Buffer.byteLength(password, 'utf8') > 72) return 'password_too_long'
  return null
}

export async function getUserById(id) {
  if (!id) return null
  return (await kvGet(userKey(id))) || null
}

export async function findUserByEmail(email) {
  const id = await kvGet(emailKey(email))
  if (!id) return null
  return await getUserById(id)
}

// Создать аккаунт. Возвращает { user } либо { error: 'email_taken' | 'store_failed' | 'busy' }.
// Проверка «занят ли email» и запись идут под замком: без него два одновременных
// запроса с одной почтой могли бы создать две записи и затереть индекс друг друга.
export async function createUser(email, password) {
  const e = normalizeEmail(email)
  const lockKey = `users:create-lock:${e}`
  const lockToken = await kvLock(lockKey, 10)
  if (!lockToken) return { error: 'busy' }
  try {
    if (await kvGet(emailKey(e))) return { error: 'email_taken' }

    const user = {
      id: crypto.randomUUID(),
      email: e,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      createdAt: Date.now()
    }
    // Сначала саму запись, потом индекс: если упадём между ними, останется «сирота»
    // без индекса (почта будет считаться свободной), а не индекс без записи —
    // из двух неполных состояний это безопаснее.
    if (!(await kvSet(userKey(user.id), user))) return { error: 'store_failed' }
    if (!(await kvSet(emailKey(e), user.id))) return { error: 'store_failed' }
    return { user }
  } finally {
    await kvUnlock(lockKey, lockToken)
  }
}

// Вход: почта + пароль → запись пользователя или null.
export async function verifyUserPassword(email, password) {
  const user = await findUserByEmail(email)
  if (!user?.passwordHash) return null
  const ok = await bcrypt.compare(String(password || ''), user.passwordHash)
  return ok ? user : null
}

// Публичная (безопасная для отдачи на фронт) проекция записи — без хеша пароля.
export const publicUser = (user) => (user ? { id: user.id, email: user.email } : null)
