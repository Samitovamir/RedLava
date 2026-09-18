import { useEffect } from 'react'

/*
  Visual theme. Two independent settings:
   - albert-theme        — the DESKTOP choice (the leather themes and so on), default black-leather.
   - albert-theme-mobile — the PHONE choice: 'auto' | 'ios-dark' | 'ios-light', default 'auto'.

  Only the minimal iOS themes are offered on a phone. 'auto' follows the phone's own
  appearance (prefers-color-scheme): system dark → ios-dark, light → ios-light, and it
  switches live when the user changes the phone's theme.

  The source of truth for the applied theme is the <html data-theme> attribute. resolveTheme()
  works out the "effective" theme from the device and the system; applyTheme() sets it.
*/

const KEY = 'albert-theme'
const MOBILE_KEY = 'albert-theme-mobile'
export const DEFAULT_DESKTOP = 'black-leather'
export const DEFAULT_MOBILE = 'auto'   // by default we follow the phone's appearance (dark/light)
const MOBILE_Q = '(max-width: 640px)'
const DARK_Q = '(prefers-color-scheme: dark)'
const EVT = 'albert-theme-change'

const NOOP_MQ = { matches: false, addEventListener() {}, removeEventListener() {} }
const mq = (q) => { try { return window.matchMedia(q) } catch { return NOOP_MQ } }

export const isMobileViewport = () => mq(MOBILE_Q).matches
const prefersDark = () => mq(DARK_Q).matches

export function getDesktopTheme() {
  try { return localStorage.getItem(KEY) || DEFAULT_DESKTOP } catch { return DEFAULT_DESKTOP }
}
export function getMobilePref() {
  try {
    const v = localStorage.getItem(MOBILE_KEY)
    if (v === 'red-lava') return 'auto'   // RedLava is gone — migrate it to auto
    return v || DEFAULT_MOBILE
  } catch { return DEFAULT_MOBILE }
}

// The effective data-theme, accounting for the device and the phone's system theme.
export function resolveTheme() {
  if (isMobileViewport()) {
    const m = getMobilePref()
    if (m === 'ios-dark' || m === 'ios-light' || m === 'brown-leather') return m
    return prefersDark() ? 'ios-dark' : 'ios-light' // 'auto' → follow the phone
  }
  return getDesktopTheme()
}

// In Safari (in a tab) the top strip holding the status bar is tinted from <meta theme-color>.
// We paint it with the app background (--bg-app) so the notch/edge blends into the site
// instead of looking like a strip borrowed from elsewhere. On the home screen (standalone)
// the content already runs under the Dynamic Island (apple-mobile-web-app-status-bar-style=black-translucent).
function syncThemeColor() {
  try {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-app').trim()
    if (!bg) return
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'theme-color')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', bg)
  } catch { /* ignore */ }
}

export function applyTheme() {
  try { document.documentElement.setAttribute('data-theme', resolveTheme()) } catch { /* ignore */ }
  syncThemeColor()
}

function emit() { try { window.dispatchEvent(new CustomEvent(EVT)) } catch { /* ignore */ } }

export function setDesktopTheme(id) { try { localStorage.setItem(KEY, id) } catch { /* ignore */ } applyTheme(); emit() }
export function setMobilePref(id) { try { localStorage.setItem(MOBILE_KEY, id) } catch { /* ignore */ } applyTheme(); emit() }

// Keeps <html data-theme> in step with the device and the system theme, live.
// Call it once in App. onChange (optional) fires on every change, so the UI can refresh its selection.
export function useThemeSync(onChange) {
  useEffect(() => {
    applyTheme()
    const m = mq(MOBILE_Q), d = mq(DARK_Q)
    const on = () => { applyTheme(); onChange?.() }
    m.addEventListener('change', on)
    d.addEventListener('change', on)
    window.addEventListener(EVT, on)
    return () => {
      m.removeEventListener('change', on)
      d.removeEventListener('change', on)
      window.removeEventListener(EVT, on)
    }
  }, [onChange])
}
