import jwt from 'jsonwebtoken'
import { kvGet, kvSet } from './store.js'

// Roles:
//   'guest' — the public demo. Never sees real data: requests to the integrations are
//             intercepted in app.js (GUEST_BLOCK) and answered with demo stubs.
//   'user'  — an ordinary account: name + password, a record in users.js. Sees only its own
//             data — every store key carries the owner's id, see userScope.js.
//
// There is NO privileged role. There used to be a third one, 'owner': sign-in with the
// shared APP_PASSWORD, data under a fixed id, server-side rights granted by the role alone.
// That amounted to a "special person" inside a multi-user system — a separate sign-in path,
// a separate branch in every check, and inherited legacy keys.
// The actions that used to require that role are now personal: everyone manages their own
// sessions and their own data. For the genuinely administrative ones still to come (listing
// members, resetting a member's password) the account record carries an isAdmin field — the
// check against it will land together with those actions, not ahead of them.
const VALID_ROLES = new Set(['guest', 'user'])
const GUEST_PASSWORD = () => process.env.GUEST_PASSWORD || '123'

// The token signing secret. REQUIRED, and as a value of its own — APP_PASSWORD used to be
// able to stand in here, which was bad for two reasons: changing one person's password
// signed everyone out (the signatures stop matching), and a password makes a low-entropy
// cryptographic key — an HS256 signature over a short password falls to an offline brute
// force once you hold any token we issued. Generate one: openssl rand -base64 48
const secret = () => process.env.JWT_SECRET || ''

// A token is a signed JWT (HMAC-SHA256), not an eternal constant:
//  • it lives for TOKEN_TTL and checks that itself (jwt.verify rejects an expired one),
//  • it carries its owner's session epoch (see below).
// While a token is in active use it is silently renewed on /api/auth/verify (routes/auth.js),
// so an ordinary user never gets signed out on their own — only a token that is genuinely
// abandoned or stolen expires, after TOKEN_TTL of inactivity.
const TOKEN_TTL = '30d'

// The session epoch is PER ACCOUNT: auth:epoch:<id>.
// Why it exists at all: a JWT is not stored on the server, so it cannot be revoked — a stolen
// one keeps working until it expires. The epoch is baked into the token when it is issued and
// compared on verification; bump it by 1 and every token previously issued to THAT person is
// void instantly. Why per account rather than global: a global one would mean that "sign out
// everywhere" signs out the whole club, including people who had nothing to do with the
// incident. The scenario that has to work: phone stolen → sign in from the laptop → change
// the password → throw away your own sessions, and nothing happens to anyone else.
const epochKey = (userId) => `auth:epoch:${userId}`

async function currentEpoch(userId) {
  if (!userId) return 0            // a guest has no account, nothing to revoke
  return Number(await kvGet(epochKey(userId))) || 0
}

// Revoke every token of a single account. Called by the "sign out everywhere" button, and
// must also be called when the password changes: otherwise a stolen device keeps working off
// its old token, which knows nothing about the new password.
export async function bumpUserEpoch(userId) {
  if (!userId) return
  await kvSet(epochKey(userId), (await currentEpoch(userId)) + 1)
}

export async function signToken(role, userId = null) {
  const payload = { role, epoch: await currentEpoch(userId) }
  if (userId) payload.userId = userId
  return jwt.sign(payload, secret(), { expiresIn: TOKEN_TTL })
}

// Guest sign-in is the only path that does not go through users.js: the demo has no account
// record, and its password lives in an environment variable.
export function guestRoleForLogin(username, password) {
  if (typeof password !== 'string' || !password) return null
  if ((username || '').trim().toLowerCase() !== 'guest') return null
  return password === GUEST_PASSWORD() ? 'guest' : null
}

function bearerToken(req) {
  const hdr = req.headers.authorization || ''
  return hdr.startsWith('Bearer ') ? hdr.slice(7) : ''
}

// Parse and verify a token → { role, userId } or null. Three independent checks: the
// signature and expiry (jwt.verify), that the role is a known one, and mass revocation (the epoch).
async function identityFromToken(token) {
  if (!token || !secret()) return null
  let payload
  // algorithms is pinned explicitly: without it the verifying side accepts whatever algorithm
  // the token itself names — and that is the classic way to get around the signature check.
  try { payload = jwt.verify(token, secret(), { algorithms: ['HS256'] }) } catch { return null }
  // The role from the token is checked against the whitelist even though the signature is
  // already verified: the signature proves we issued the token, not that its contents still
  // make sense. Tokens carrying the removed 'owner' role are rejected right here.
  if (!VALID_ROLES.has(payload.role)) return null
  const userId = payload.userId || null
  // An account must carry an id and a guest must not — otherwise the token was built wrong.
  if ((payload.role === 'user') !== !!userId) return null
  if ((Number(payload.epoch) || 0) < (await currentEpoch(userId))) return null
  return { role: payload.role, userId }
}

// Guards the private routes. Sets req.role and req.userId (the latter only for 'user').
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

// Guest: real data is off limits.
export const isGuestReq = (req) => req.role === 'guest'

// Resolve the role from a token without rejecting the request (for the guard middleware in app.js).
export async function roleFromReq(req) {
  if (!secret()) return null
  try { return (await identityFromToken(bearerToken(req)))?.role || null } catch { return null }
}
