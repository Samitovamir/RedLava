# Security

RedLava is a small multi-account web app for a triathlon club: invite-only accounts, a public
demo login, an AI assistant that takes real actions (calendar, email drafts), and OAuth
connections to Google, WHOOP and Garmin. This document is a short threat model: who can do
what, what protects each boundary, and what is knowingly left open.

## Actors

| Actor | Access |
|---|---|
| **Member** | An ordinary account. Sees and changes only their own data and their own integrations. There is no privileged role. |
| **Guest** | The public demo (`guest` / `123`, printed on the sign-in screen by design). Gets demo data only; never reaches a real integration. |
| **AI agent** (Claude) | Acts for the signed-in member. Can create events directly; moving or deleting an event and sending an email need the member's tap. Reads data the member did not write — calendar invite titles, email bodies — which is a prompt-injection surface. |
| **Outsider** | No account. Can register only with the invite code. |
| **OAuth providers** | Issue the refresh tokens, which are stored per account in the KV store (Upstash Redis in production, a local file in development). |

## What is in place

**Accounts and passwords** (`backend/users.js`, `backend/routes/auth.js`)
- Passwords are hashed with bcrypt (bcryptjs, 10 rounds), at least 8 characters, at most
  72 bytes — bcrypt ignores anything past that, so longer input is refused instead.
- Usernames are unique regardless of case and surrounding spaces; creation runs under a KV
  lock so two simultaneous sign-ups cannot claim the same name.
- Registration requires `REGISTRATION_CODE`, compared in constant time.

**Sessions** (`backend/authGuard.js`)
- HS256 JWTs with the algorithm pinned on verification, a 30-day lifetime, renewed each time
  the app opens.
- Every account has its own session epoch, carried in its tokens. "Sign out other devices"
  bumps that account's epoch: its older tokens stop working, the device that pressed the button
  gets a fresh token, and nobody else is affected. The cost is one key read per request.
- A token's role must match its shape: a `user` token must carry an account id, a `guest`
  token must not.

**Isolation between accounts**
- Every stored key carries its owner's id (`backend/userScope.js`), so one account's data
  cannot be addressed from another. The browser tests check this directly.
- Requests from the guest to integration endpoints are answered with demo data in
  `backend/app.js`, before they reach a real handler.

**Brute force** (`backend/rateLimit.js`) — fixed-window counters per IP in the shared KV store,
because in-memory counters reset on every serverless cold start:
- sign-in: 8 failed attempts per 15 minutes;
- registration: 30 per 15 minutes (the invite code is the real gate);
- Garmin connect: 6 failed attempts per 15 minutes. It forwards a username and password to
  Garmin, so without a cap the server could be used to try passwords against other people's
  Garmin accounts.

**OAuth** — a random state per flow, bound to the account that started it and deleted on use.

**Input that reaches outbound URLs** — calendar event ids are checked against Google's id
format and URL-encoded before they become part of a Google API path.

**Headers** (`vercel.json`, `backend/app.js`)
- The page has a CSP with no `unsafe-inline` for scripts: its two inline scripts are allowed
  by SHA-256 hash. Also HSTS (two years), `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy` and a `Permissions-Policy`.
- The API uses helmet's defaults, CSP included.
- CORS is closed to other origins unless `ALLOWED_ORIGIN` is set.

**The AI agent** (`backend/routes/ai.js`)
- The system prompt is the server's alone. The dashboard snapshot and the page's task arrive
  in the first user message, in fenced blocks that the rules describe as data, not
  instructions. The snapshot used to sit in the system prompt, next to the rules.
- The rules state that commands come only from what the member wrote, never from text inside
  the data.
- Moving or deleting an event needs a human tap (`ConfirmAiActionModal.jsx`); an email is
  only ever a draft the member sends.
- Cost limits: messages up to 4,000 characters; a per-instance fuse of 60 requests a minute,
  300 an hour and 1,000 a day; a daily allowance of 15 requests per guest device and
  150 per account (`AI_USER_DAILY_LIMIT`), kept in KV.

**Pipeline** — every push runs CodeQL, a gitleaks secret scan over the full history and
ESLint. Dependabot watches dependencies (major bumps are reviewed by hand). `npm test` runs
11 browser tests, including cross-account isolation and session revocation.

## Known limitations

- **No password change or reset yet.** "Sign out other devices" ends existing sessions, but
  it cannot lock out someone who knows the password. A change-password endpoint that also
  bumps the session epoch is the next thing to add.
- **No second factor.**
- **The session token is in `localStorage`**, readable by any script on the page. There is no
  `dangerouslySetInnerHTML` in the app and the CSP blocks injected inline scripts, but an
  `httpOnly` cookie would remove the exposure.
- **Much of the data is held in the browser.** The schedule, nutrition profile and similar
  data live in `localStorage` and in a per-account synced copy on the server, so they share
  the token's exposure. This is also why CodeQL's clear-text-storage finding is accepted below.
- **The per-minute/hour/day AI fuse is in memory**, per serverless instance: a cost fuse, not
  a hard global cap. The daily allowances in KV are the durable limit.
- **OAuth state entries don't expire** if a flow is abandoned half-way. They are single-use
  and bound to an account, so this is clutter rather than a bypass.
- **`react-router-dom` v6** has two moderate advisories fixed only in v7, a breaking upgrade.
  One concerns server-side rendering, which the app does not use; the other is an open
  redirect through `<Link>` / `navigate()`. The upgrade is planned.
- **Garmin credentials** pass through the backend to Garmin over TLS, because Garmin offers no
  OAuth for personal accounts. Only the session token Garmin returns is stored.

## Static analysis: findings reviewed and accepted

The first CodeQL run on this code raised 12 alerts. Eight were fixed in code: path injection
through calendar event ids (two), client-controlled text in the AI system prompt (three), two
regular expressions with quadratic backtracking, and the disabled API CSP. Garmin connect
really had no limit and now has one, though CodeQL cannot see it. Four alerts remain and are
accepted:

| Rule | Where | Why it stays |
|---|---|---|
| `js/missing-rate-limiting` | `auth.js` sign-in, `garmin.js` connect | Both are limited by the KV counters in `rateLimit.js`. CodeQL only recognises known middleware packages, which keep their counts in memory and so would not work on serverless. |
| `js/cors-permissive-configuration` | `app.js` | CORS is open only with `LOCAL_DEV=1`, for the Vite dev server on another port. In production it is closed. |
| `js/clear-text-storage-of-sensitive-data` | `utils/nutrition.js` | The nutrition profile lives in the browser like the rest of the client-held data; see Known limitations. |

## Reporting

This is a personal project, not a maintained service. If you find something, open an issue or
reach out through the contact on my GitHub profile.
