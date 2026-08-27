# RedLava

A personal training and health dashboard for endurance athletes. Training data from **Garmin** and **WHOOP**, calendar from **Google**, and blood work parsed straight out of uploaded PDFs — all in one place, with an AI assistant that *acts* (creates calendar events, drafts emails, remembers facts about you) rather than just summarising.

**Live demo:** https://saa-website-omega.vercel.app — sign in as `guest` / `123` to browse a full demo with sample data.

> Built for a real user (an amateur triathlete) who was checking four different apps every morning. It has been in daily use since June 2026.

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
- **Auth** is HMAC-SHA256 tokens compared with `crypto.timingSafeEqual`, with a guest role the backend serves demo data to — real data is never sent to a guest session.
- **AI cost guard**: per-minute/hour/day request limits and a message size cap, since one dashboard load fans out to ~10–15 AI cards.
- **Design system**: four themes driven entirely by CSS custom properties; components never hardcode a colour.
- **Bilingual** (EN/RU): first visit follows the browser locale, then the choice is remembered.

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
