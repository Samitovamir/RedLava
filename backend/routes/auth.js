import { Router } from 'express'
import crypto from 'crypto'
import { signToken, guestRoleForLogin, requireAuth, bumpUserEpoch } from '../authGuard.js'
import { attemptKey, tooManyFails, recordFail, minutesLeft } from '../rateLimit.js'
import { createUser, verifyUserPassword, validateCredentials, publicUser, getUserById, MIN_PASSWORD_LENGTH } from '../users.js'

const router = Router()

// --- Brute-force protection (sign-in and registration) ---
// Counters per IP in the shared KV store, see rateLimit.js for why they aren't in memory.
const LOGIN_MAX_FAILS = 8         // failed sign-ins per window — blocked beyond that
// Registrations from one IP per window. The real defense against outsiders is REGISTRATION_CODE;
// this limit only exists to stop a scripted flood, which is why it's generous: a club may
// sign up as a whole team one evening from a single Wi-Fi (or behind a carrier NAT), and
// 5 attempts hit the wall there instantly, locking real people out for 15 minutes.
const REGISTER_MAX = 30

// A successful registration spends the limit too — otherwise "5 registrations from one IP"
// would cap nothing. BUT typos in the form (a short password, a name already taken) do NOT
// count: they create nothing, and on club Wi-Fi one person would burn the limit for everyone.
const recordAttempt = recordFail

// Constant-time comparison: the invitation code is a secret, and a plain === gives away the
// length of the matching prefix through the response time.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b))
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

// Public information about how sign-in works — so the sign-in screen knows whether to show
// the invitation code field, and doesn't offer registration where it is closed.
router.get('/config', (_req, res) => res.json({
  registrationCodeRequired: !!process.env.REGISTRATION_CODE,
  minPasswordLength: MIN_PASSWORD_LENGTH
}))

// Registration of an ordinary account (username + password). When REGISTRATION_CODE is set we
// require it: that way the club hands out access by invitation instead of opening registration
// to the whole internet. With the variable unset, registration is open (handy while developing).
router.post('/register', async (req, res) => {
  const key = attemptKey('register', req)
  if (await tooManyFails(key, REGISTER_MAX)) {
    return res.status(429).json({ error: 'too_many_attempts', retryInMinutes: minutesLeft() })
  }

  const { username, password, code } = req.body || {}

  const required = process.env.REGISTRATION_CODE
  if (required && (typeof code !== 'string' || !code || !safeEqual(code, required))) {
    await recordFail(key)   // someone is guessing the code — count it
    return res.status(403).json({ error: 'bad_code' })
  }

  // A typo in the form isn't punished by the limit (see the comment on recordAttempt).
  // We do NOT send error text: we return a code and the frontend renders it in the UI
  // language — otherwise a Russian string from the server would surface in the English UI.
  const invalid = validateCredentials(username, password)
  if (invalid) return res.status(400).json({ error: invalid, minPasswordLength: MIN_PASSWORD_LENGTH })

  const { user, error } = await createUser(username, password)
  if (error === 'name_taken') return res.status(409).json({ error })
  if (error) return res.status(503).json({ error })

  await recordAttempt(key)   // a successful registration spends the limit too
  return res.json({ token: await signToken('user', user.id), role: 'user', user: publicUser(user) })
})

// Sign-in — username + password. Two paths tried in order, not a branch on the input:
//   1) an ordinary account (the username is in users:by-login, the password matches the hash);
//   2) if that didn't match — the guest demo via GUEST_PASSWORD (which has no account record).
// There is no separate owner sign-in: every person is an ordinary account. The isAdmin flag on
// the record is reserved for admin actions that don't exist yet (see the note in authGuard.js).
router.post('/login', async (req, res) => {
  const key = attemptKey('fails', req)
  if (await tooManyFails(key, LOGIN_MAX_FAILS)) {
    return res.status(429).json({ error: 'too_many_attempts', retryInMinutes: minutesLeft() })
  }

  const { username, password } = req.body || {}

  const user = await verifyUserPassword(username, password)
  if (user) return res.json({ token: await signToken('user', user.id), role: 'user', user: publicUser(user) })

  const role = guestRoleForLogin(username, password)
  if (!role) {
    await recordFail(key)  // only failures count — nobody is penalized for getting it right first try
    return res.status(401).json({ error: 'wrong_password' })
  }
  return res.json({ token: await signToken(role), role })
})

// Checking a valid token (for the silent sign-in when the site opens) — we return the role and
// a FRESH token: an active user thereby extends their session by another TOKEN_TTL and is never
// signed out on their own, while a genuinely abandoned or stolen token expires after TOKEN_TTL.
router.get('/verify', requireAuth, async (req, res) => {
  // The frontend needs the account record for two things: showing "you are signed in as …" in
  // Settings, and deciding whether to show the admin actions (publicUser exposes isAdmin).
  const user = req.role === 'user' ? publicUser(await getUserById(req.userId)) : null
  res.json({ ok: true, role: req.role, userId: req.userId || null, user, token: await signToken(req.role, req.userId) })
})

// "Sign out everywhere" — everywhere of YOUR OWN. Bumps this account's personal session epoch:
// every token issued to it earlier stops working at once, and nothing changes for anyone else.
// The epoch used to be shared, so this button signed the whole club out — correct for the
// single-user version, where "all sessions" and "my sessions" were the same thing, and wrong
// once accounts arrived. Scenario: phone stolen → sign in from the laptop → (change the
// password) → throw out your own sessions. A guest has nothing to revoke: the demo has no
// account, and therefore no personal epoch either.
router.post('/logout-all', requireAuth, async (req, res) => {
  if (req.role !== 'user' || !req.userId) return res.status(403).json({ error: 'forbidden' })
  await bumpUserEpoch(req.userId)
  // A fresh token with the new epoch, so the device the button was pressed on stays signed in.
  res.json({ ok: true, token: await signToken(req.role, req.userId) })
})

export default router
