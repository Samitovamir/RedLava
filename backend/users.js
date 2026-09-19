import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { kvGet, kvSet, kvLock, kvUnlock } from './store.js'

/*
  User accounts: creation, lookup by login, password verification.

  Sign-in uses a USERNAME and a password, not an email address, so one screen can't
  leave you wondering "is this the name field or the email field?". An account has no
  email at all for now — we'll add one once password recovery needs it. The username
  is both the login and what the interface displays: a second "display name" field
  would not buy anybody anything right now.

  Everything is stored in the same KV as the rest of the app, under two keys:
    users:by-login:<lowercased username>  → the user's id (the sign-in index)
    users:<id>  → { id, username, passwordHash, isAdmin, createdAt }

  Why bcryptjs rather than bcrypt/argon2: those need a native build at install time,
  and the backend ships as a serverless function on Vercel — a native module there is
  needless build-time risk. Pure JS costs more CPU, but sign-in isn't a hot path.

  Isolating an account's data (calendar, Whoop, Garmin, blood tests) does not happen
  here: every key in the store carries the data owner's id, see userScope.js. That's
  why there is no separate "keep new accounts away from the owner's data" rule — an
  account physically only ever reaches its own slot.
*/

const BCRYPT_ROUNDS = 10
export const MIN_PASSWORD_LENGTH = 8
const MIN_NAME_LENGTH = 2
const MAX_NAME_LENGTH = 40
// Logins nobody may claim: 'guest' is the public demo, otherwise someone's account
// under that username would start hijacking the demo sign-in.
const RESERVED_NAMES = new Set(['guest', 'гость'])
// Spaces and dots/hyphens/underscores are allowed, "@" is not: a username must not
// look like an email address, or we're back to that same confusion.
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u

export const normalizeLogin = (username) => String(username || '').trim().toLowerCase().replace(/\s+/g, ' ')

const loginKey = (username) => `users:by-login:${normalizeLogin(username)}`
const userKey = (id) => `users:${id}`

// Validates sign-up input → an error code, or null when everything checks out.
export function validateCredentials(username, password) {
  const n = String(username || '').trim()
  const norm = normalizeLogin(n)
  if (!norm || norm.length < MIN_NAME_LENGTH || norm.length > MAX_NAME_LENGTH || !NAME_RE.test(n)) return 'bad_name'
  if (RESERVED_NAMES.has(norm)) return 'name_reserved'
  return validatePassword(password)
}

// The password half of it, shared by sign-up and a password change.
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) return 'weak_password'
  // bcrypt only takes the first 72 bytes of a password into account — accepting more is pointless
  if (Buffer.byteLength(password, 'utf8') > 72) return 'password_too_long'
  return null
}

export async function getUserById(id) {
  if (!id) return null
  return (await kvGet(userKey(id))) || null
}

export async function findUserByLogin(username) {
  const id = await kvGet(loginKey(username))
  if (!id) return null
  return await getUserById(id)
}

// Creates an account. Returns { user } or { error: 'name_taken' | 'store_failed' | 'busy' }.
// The "is this username taken?" check and the write both happen under a lock: without one,
// two simultaneous requests for the same username could create two records and overwrite
// each other's index entry. That is exactly what makes two "Amir" accounts impossible: an
// index on the normalized (trimmed, lowercased) login, plus a lock held across check and write.
export async function createUser(username, password) {
  const display = String(username || '').trim().replace(/\s+/g, ' ')
  const norm = normalizeLogin(display)
  const lockKey = `users:create-lock:${norm}`
  const lockToken = await kvLock(lockKey, 10)
  if (!lockToken) return { error: 'busy' }
  try {
    if (await kvGet(loginKey(norm))) return { error: 'name_taken' }

    const user = {
      id: crypto.randomUUID(),
      username: display,             // exactly as the person typed it — case is kept for display
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      // Admin rights are granted only by editing the record in the store, never through the UI.
      isAdmin: false,
      createdAt: Date.now()
    }
    // The record first, the index second: if we die in between, what's left is an orphan
    // with no index (the name still counts as free) rather than an index with no record —
    // of the two half-finished states, that's the safer one.
    if (!(await kvSet(userKey(user.id), user))) return { error: 'store_failed' }
    if (!(await kvSet(loginKey(norm), user.id))) return { error: 'store_failed' }
    return { user }
  } finally {
    await kvUnlock(lockKey, lockToken)
  }
}

// Sign-in: username + password → the user record, or null.
export async function verifyUserPassword(username, password) {
  const user = await findUserByLogin(username)
  if (!user?.passwordHash) return null
  const ok = await bcrypt.compare(String(password || ''), user.passwordHash)
  return ok ? user : null
}

// Changing a password. The current one has to match even though the caller is signed in:
// a session is not proof of knowing the password (a phone left unlocked, a token lifted from
// a browser), and without this check it would be enough to lock the owner out for good.
// Returns {} or { error: 'weak_password' | 'password_too_long' | 'wrong_password' |
// 'same_password' | 'store_failed' }. Signing out the other devices is the caller's job.
export async function changePassword(userId, currentPassword, newPassword) {
  const invalid = validatePassword(newPassword)
  if (invalid) return { error: invalid }
  const user = await getUserById(userId)
  if (!user?.passwordHash) return { error: 'store_failed' }
  if (!(await bcrypt.compare(String(currentPassword || ''), user.passwordHash))) return { error: 'wrong_password' }
  if (newPassword === currentPassword) return { error: 'same_password' }
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  if (!(await kvSet(userKey(userId), { ...user, passwordHash }))) return { error: 'store_failed' }
  return {}
}

// The public projection of a record, safe to send to the frontend — no password hash.
export const publicUser = (user) => (user
  ? { id: user.id, username: user.username, isAdmin: !!user.isAdmin }
  : null)
