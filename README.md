# RedLava

A personal training and health dashboard for endurance athletes. Training data from **Garmin** and **WHOOP**, calendar from **Google**, and blood work parsed straight out of uploaded PDFs — all in one place, with an AI assistant that *acts* (creates calendar events, drafts emails, remembers facts about you) rather than just summarising.

**Live demo:** https://saa-website-omega.vercel.app — sign in as `guest` / `123` to browse a full demo with sample data.

> Built for a real user (an amateur triathlete) who was checking four different apps every morning. It has been in daily use since June 2026.

![Home — the Status card reads every domain at once](docs/home.png)

<p align="center">
  <img src="docs/health.png" width="58%" alt="Health — blood tests parsed from PDFs, tracked over time" />
  <img src="docs/sport-mobile.png" width="20%" alt="Sport on a phone" />
</p>

<sup>Screenshots are the guest demo (`guest` / `123`) — sample data, not anyone's real health records.</sup>

---

## What it does

| Area | What's there |
|---|---|
| **Status** | One card that reads every domain at once — stress, schedule load, training readiness, recovery-vs-strain, nutrition — each with a personal AI recommendation and a deterministic fallback when the AI is unavailable |
| **Schedule** | Google Calendar two-way sync; the assistant can create, move and delete events |
| **Sport** | Garmin Connect: workouts with per-kilometre splits, GPS track, HR/elevation/power charts; training status, load (ACWR), HRV, race predictions, lactate threshold |
| **Health** | WHOOP recovery/sleep/strain; blood tests uploaded as PDF or photo are parsed by Claude vision into ~76 known markers, tracked over time with reference ranges and trends |
| **Nutrition** | Photo food diary, barcode scanning (Open Food Facts), calorie/macro targets, FODMAP flagging |
| **Assistant** | Claude with tool use — 8 real tools (`create_event`, `send_email`, `remember_fact`, `route_eta`, …). It builds a snapshot of the whole dashboard as context, so answers are grounded in the user's actual data |

## Architecture

```
frontend/  React 18 + Vite SPA
  ├─ shells/     alternative layout over the same data ("command center"; default is classic)
  ├─ components/ presentational + gauge widgets (all SVG, no chart library)
  ├─ context/    events, history, memory, language
  └─ utils/      domain logic kept out of components (labs, nutrition, whoop, daySignal)

backend/   Express, deployed as a single Vercel serverless function (api/index.js)
  └─ routes/     one module per integration: calendar, gmail, garmin, whoop, labs,
                 nutrition, sync, history, ai, auth
```

**Notable bits**

- **Token rotation under concurrency.** WHOOP issues single-use refresh tokens. Parallel serverless invocations racing to refresh would invalidate each other, so refreshes are serialised behind a KV lock and the new token pair is written in one fenced operation.
- **Google OAuth in "Testing" mode expires refresh tokens every 7 days.** The backend detects `invalid_grant`, marks the token dead instead of retrying forever, and surfaces a reconnect banner.
- **Revocable stateless sessions.** A JWT cannot normally be taken back — a stolen one works until it expires. Each token therefore carries a session epoch that is kept per account, so "sign out my other devices" invalidates one person's tokens and nobody else's, at the cost of a single key read per request. See [Security](#security).
- **AI cost guard**: per-minute/hour/day request limits and a message size cap, since one dashboard load fans out to ~10–15 AI cards.
- **Design system**: four themes driven entirely by CSS custom properties; components never hardcode a colour.
- **Bilingual** (EN/RU): first visit follows the browser locale, then the choice is remembered.

## Security

Auth is signed, short-lived JWTs with a per-account revocation epoch; passwords are
bcrypt-hashed; every stored key carries its owner's id, so accounts cannot read each
other's data. CSP is served with SHA-256 hashes of the two inline scripts (no
`unsafe-inline` for `script-src`), OAuth callbacks are protected by single-use state,
and login, registration and the reset flow are rate-limited in the KV store. The
assistant's system prompt states an instruction hierarchy so text inside the user's own
data cannot act as a command, and destructive tool calls need a human confirmation.

Every push runs **CodeQL** and a **gitleaks** secret scan over the full history;
Dependabot watches dependencies with major bumps deliberately ignored. The threat model,
and the risks knowingly accepted, are written down in [SECURITY.md](SECURITY.md).

## Stack

React 18 · Vite · React Router · Framer Motion · Express · Vercel serverless · Claude API (`@anthropic-ai/sdk`) · Google Calendar & Gmail APIs · Garmin Connect · WHOOP API · Yandex.Disk

## Running locally

```bash
cp .env.example .env        # fill in the keys you need; .env is gitignored

cd backend  && npm install && npm run dev    # http://localhost:3001
cd frontend && npm install && npm run dev    # http://localhost:5173
```

The frontend proxies `/api/*` to the backend in dev. Without an `ANTHROPIC_API_KEY` everything still renders — AI cards fall back to deterministic text.

## Notes

Blood-test marker names are stored in Russian because they double as the matching keys when parsing Russian lab PDFs; English display names sit alongside them (`nameEn`) and are used by the English UI.
