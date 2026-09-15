# Security

This is a single-owner personal dashboard with a public demo login, an AI agent that
takes real actions (calendar, email), and OAuth-connected third-party accounts
(Google, Whoop, Garmin). This document is a short threat model: who the actors are,
what's protected, and what's explicitly out of scope for a project this size.

## Actors

| Actor | Access |
|---|---|
| **Owner** | Full access — real calendar, health data, lab results, AI assistant with tool use |
| **Guest** | Demo-only login (`guest` / a password shown right on the sign-in screen and in the README, by design — it's a public demo). Never sees real data; every integration endpoint that would return or mutate real data is intercepted server-side before it reaches the real Google/Whoop/Garmin/Gmail APIs |
| **AI agent (Claude)** | Runs with the owner's authority when the owner is signed in. Can create/move/delete calendar events and draft (never auto-send) emails. Its context includes data the owner didn't type themselves — calendar event titles, in principle third-party email content — which is a real prompt-injection surface (see below) |
| **OAuth providers** (Google, Whoop, Garmin) | Hold the actual refresh tokens; the backend stores them in a KV store (Upstash Redis in prod, a local file in dev) |

## What's in place

- **Auth**: signed JWTs (`backend/authGuard.js`), not a permanent shared secret. Short
  session, silently renewed on every app open (`/api/auth/verify`) so an active user
  never has to re-login, but an abandoned or stolen token expires. A revocation
  "epoch" stored server-side lets the owner invalidate every outstanding token
  instantly (`POST /api/auth/logout-all`, exposed as "Sign out everywhere" in
  Settings → Connections) without changing the password.
- **Login is rate-limited** per IP (`backend/routes/auth.js`) — a fixed-window
  counter through the same shared KV store used elsewhere, so it works correctly
  across serverless invocations (a plain in-memory counter would reset on every
  cold start on Vercel).
- **Guest isolation is enforced twice**: a path allowlist in `backend/app.js`
  intercepts every integration endpoint for guest tokens before it reaches the
  real route handler, *and* the handlers that perform account-level mutations
  (`*/disconnect`) independently check `req.role === 'owner'`. Belt and suspenders
  on purpose — an oversight in one list shouldn't be enough to expose real data or
  let a guest disconnect the owner's real accounts. (An earlier version of this
  project had exactly that gap: `*/disconnect` checked for *any* valid token, not
  specifically the owner, and guest credentials are public. Fixed and covered by
  the allowlist now.)
- **Security headers**: `helmet` on the API (`backend/app.js`); a hand-built CSP,
  HSTS, `X-Frame-Options: DENY`, `Referrer-Policy` and a `Permissions-Policy` on the
  actual page (`vercel.json` → `headers`). The CSP has no `unsafe-inline` for
  scripts — the two inline `<script>` blocks in `frontend/index.html` (theme applied
  before first paint, orientation-lock message) are allow-listed by exact SHA-256
  hash instead, so any injected inline script is blocked by the browser regardless
  of where it came from.
- **CORS** defaults to closed for any origin other than the site itself in
  production; open origins require explicitly setting `ALLOWED_ORIGIN`.
- **Prompt-injection mitigation for the AI agent** — two layers, since prompt-level
  instructions alone are a soft control:
  1. The system prompt (`backend/routes/ai.js`) explicitly tells the model that the
     only source of commands is the owner's own message in the chat, and that text
     found *inside* dashboard data (event titles, email bodies) is data to describe,
     never an instruction to act on.
  2. Destructive tool calls (`move_event`, `delete_event`) no longer execute
     automatically. They're queued and require an explicit tap from the owner
     (`ConfirmAiActionModal.jsx`) before anything real happens to the calendar —
     the same pattern the assistant already used for `send_email` (draft +
     human-confirmed send, never auto-sent). `create_event` still applies
     immediately: additive and easily undone, not worth the extra friction.

## Known limitations / accepted risk

- The session token lives in `localStorage`, not an `httpOnly` cookie — readable by
  any script that runs on the page. Given the app has no `dangerouslySetInnerHTML`
  anywhere today, there's no known XSS vector, but this is a real residual risk if
  one is ever introduced (e.g. rendering AI-fetched web content as HTML). Moving to
  an `httpOnly` cookie is the correct long-term fix; not done yet because it
  changes the request model for a single-page app talking to a serverless function
  on the same origin, and wasn't worth rushing alongside everything else here.
- No 2FA on the owner login yet. Single factor (password) protected by the rate
  limiter above.
- `npm audit` is clean on `backend/` and the repo root; `frontend/` has one
  remaining moderate advisory in `react-router-dom` (open redirect / SSR
  hydration) with a fix only available via a major-version bump (v6 → v7), which
  is an API-breaking change across the whole router — deliberately not rushed in
  alongside a security pass. Tracked, not forgotten.
- Garmin credentials are submitted directly to this backend (no OAuth is offered
  by Garmin Connect for personal accounts) and forwarded over TLS; they are not
  stored by this app beyond the session token Garmin itself issues.

## Reporting

This is a personal project, not a maintained public service — if you find
something, open an issue or reach out directly rather than filing through a formal
disclosure program.
