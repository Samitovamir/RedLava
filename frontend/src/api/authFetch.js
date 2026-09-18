// App-wide authorization: the token is attached to every /api request, so we don't have to
// rewrite each fetch in the code. On a 401 we clear it and ask for a fresh sign-in.

const TOKEN_KEY = 'albert-auth'
const ROLE_KEY = 'albert-role'

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export const setToken = (t) => {
  try { localStorage.setItem(TOKEN_KEY, t) } catch { /* ignore */ }
}
export const clearToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ROLE_KEY)
    localStorage.removeItem('albert-user-id'); localStorage.removeItem('albert-username')
  } catch { /* ignore */ }
}

// Sign-in role: 'user' (a regular account with its own data) | 'guest' (the public demo)
export const getRole = () => {
  try { return localStorage.getItem(ROLE_KEY) } catch { return null }
}
export const setRole = (r) => {
  try { r ? localStorage.setItem(ROLE_KEY, r) : localStorage.removeItem(ROLE_KEY) } catch { /* ignore */ }
}
// The account id. A guest has none: the demo has no data of its own, nothing to identify.
const USER_ID_KEY = 'albert-user-id'
export const getUserId = () => {
  try { return localStorage.getItem(USER_ID_KEY) } catch { return null }
}
export const setUserId = (id) => {
  try { id ? localStorage.setItem(USER_ID_KEY, id) : localStorage.removeItem(USER_ID_KEY) } catch { /* ignore */ }
}
// The account's username — for display ("Signed in as …" in Settings).
const USERNAME_KEY = 'albert-username'
export const getUsername = () => {
  try { return localStorage.getItem(USERNAME_KEY) } catch { return null }
}
export const setUsername = (username) => {
  try { username ? localStorage.setItem(USERNAME_KEY, username) : localStorage.removeItem(USERNAME_KEY) } catch { /* ignore */ }
}


export const isGuest = () => getRole() === 'guest'

// A permanent device identifier — so the daily AI limit for guests is counted PER DEVICE
// instead of being shared by all guests. Created once and kept in the browser.
const DEVICE_KEY = 'albert-device'
export const getDeviceId = () => {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = (crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2)))
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch { return 'nodevice' }
}

// The chosen interface language, or the browser's locale on a first visit —
// the same rule LanguageContext uses, kept here so plain fetch() calls have it too.
const LANG_KEY = 'redlava-lang'
export const getLang = () => {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'ru' || saved === 'en') return saved
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
    return langs.some(l => String(l).toLowerCase().startsWith('ru')) ? 'ru' : 'en'
  } catch { return 'en' }
}

let installed = false
export function installAuthFetch() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const orig = window.fetch.bind(window)
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    if (!url.startsWith('/api/')) return orig(input, init)

    const headers = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {})
    const token = getToken()
    // Do NOT overwrite Authorization if the caller has already set its own
    if (token && !headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token)
    headers.set('X-Device-Id', getDeviceId())
    // The interface language, so the server can answer in it. Without this the
    // backend replied in Russian always, and an English UI showed Russian errors.
    headers.set('X-Lang', getLang())

    const res = await orig(input, { ...init, headers })
    // The token is expired or invalid — except on the sign-in endpoints themselves
    if (res.status === 401 && !url.includes('/api/auth/')) {
      clearToken()
      window.dispatchEvent(new Event('albert-unauthorized'))
    }
    return res
  }
}
