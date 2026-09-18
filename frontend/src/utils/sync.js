// Syncs data across the devices of ONE account.
// The model: a blob on the server in the account's own slot (see backend/userScope.js). We pull
// on app start (hydrating localStorage BEFORE the interface is shown), then push changes in the
// background, debounced, plus a push when the page goes away. Last write wins.
// Device-local settings (theme/layout/language) and the Whoop/Garmin caches are NOT synced —
// they are either per-device or restored from the server on their own.

import { isGuest } from '../api/authFetch.js'

const SYNC_KEYS = [
  'albert-events',            // schedule
  'albert-memory',            // what the assistant remembers about this person
  'albert-history',           // action log
  'albert-labs',              // blood tests
  'albert-nutrition-profile', // nutrition profile
  'albert-taste',             // taste preferences
  'albert-meal-plan',         // menu
  'albert-intake',            // what was eaten (the day's calories and macros)
  'albert-shopping-2',        // shopping list
  'albert-pantry',            // bought recently
  'albert-home-dish',         // the dish on the Home screen (for the current meal)
  'albert-saved-dishes',      // dishes saved from the photo diary (for a quick repeat)
  // NB: albert-intake-thumbs (photo thumbnails) is NOT synced — bulky base64, local only.
]
const AT_KEY = 'albert-sync-at'
let lastSnap = ''

function collectState() {
  const state = {}
  for (const k of SYNC_KEYS) {
    try { const v = localStorage.getItem(k); if (v != null) state[k] = v } catch { /* ignore */ }
  }
  return state
}
// Canonical snapshot (SYNC_KEYS only, in their order) — for comparing local vs server.
function snapshotOf(obj) {
  const s = {}
  for (const k of SYNC_KEYS) { const v = obj?.[k]; if (v != null) s[k] = v }
  return JSON.stringify(s)
}

// Pull the server blob. IMPORTANT: we overwrite localStorage ONLY if the server really is newer
// than local (serverAt > localAt). Otherwise local edits that never made it to the server
// (a meal logged, then the app closed before the push) would be wiped by the pull on startup —
// the meal "disappeared". If local is not older, leave it alone and let the next push send it.
export async function pullSync() {
  if (isGuest()) return
  try {
    const res = await fetch('/api/sync/state')
    if (!res.ok) { lastSnap = JSON.stringify(collectState()); return }
    const data = await res.json()
    const localAt = Number(localStorage.getItem(AT_KEY) || 0)
    const serverAt = Number(data?.updatedAt || 0)
    const serverHasState = !!(data?.ok && data.state && typeof data.state === 'object' && Object.keys(data.state).length)
    const localEmpty = JSON.stringify(collectState()) === '{}'   // a new device / a cleared cache
    if (serverHasState && (serverAt > localAt || localEmpty)) {
      // The server is newer OR local is empty — safe to hydrate.
      for (const [k, v] of Object.entries(data.state)) {
        try { if (typeof v === 'string') localStorage.setItem(k, v) } catch { /* ignore */ }
      }
      try { localStorage.setItem(AT_KEY, String(serverAt)) } catch { /* ignore */ }
      lastSnap = JSON.stringify(collectState())
    } else {
      // Local is not older than the server — do NOT overwrite. Baseline snapshot = the server's:
      // if local differs (there are unsynced edits), the next pushSync will send them.
      lastSnap = snapshotOf(data?.state || {})
    }
  } catch {
    lastSnap = JSON.stringify(collectState())
  }
}

// Send the current state to the server if it changed since the last push.
// keepalive=true is for the push on backgrounding/closing: the browser aborts a normal fetch on
// unload, so edits (a meal logged a moment ago) never reached the server. keepalive lets the
// request finish after the page goes away (body limit ~64 KB — the snapshot is text and
// thumbnails are left out of the sync, so we fit).
export async function pushSync(opts = {}) {
  if (isGuest()) return
  const state = collectState()
  const snap = JSON.stringify(state)
  if (snap === lastSnap) return
  try {
    const updatedAt = Date.now()
    const res = await fetch('/api/sync/state', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, updatedAt }),
      keepalive: !!opts.keepalive,
    })
    if (res.ok) {
      lastSnap = snap
      try { localStorage.setItem(AT_KEY, String(updatedAt)) } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

let started = false
export function startSync() {
  if (started || isGuest() || typeof window === 'undefined') return
  started = true
  // Do NOT re-initialize lastSnap here: pullSync has already set it. Resetting it to the current
  // local state would "forget" the unsynced edits, and the push would never send them.
  setInterval(() => { pushSync() }, 8000)
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pushSync({ keepalive: true }) })
  window.addEventListener('pagehide', () => { pushSync({ keepalive: true }) })
}
