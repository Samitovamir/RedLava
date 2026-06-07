// Авторизация на уровне всего приложения: токен добавляется ко всем /api запросам,
// чтобы не переписывать каждый fetch в коде. При 401 — сбрасываем и просим войти снова.

const TOKEN_KEY = 'albert-auth'
const ROLE_KEY = 'albert-role'

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export const setToken = (t) => {
  try { localStorage.setItem(TOKEN_KEY, t) } catch { /* ignore */ }
}
export const clearToken = () => {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ROLE_KEY) } catch { /* ignore */ }
}

// Роль входа: 'albert' (реальные данные) | 'guest' (демо)
export const getRole = () => {
  try { return localStorage.getItem(ROLE_KEY) } catch { return null }
}
export const setRole = (r) => {
  try { r ? localStorage.setItem(ROLE_KEY, r) : localStorage.removeItem(ROLE_KEY) } catch { /* ignore */ }
}
export const isGuest = () => getRole() === 'guest'

// Постоянный идентификатор устройства — чтобы дневной лимит ИИ для гостей считался
// ПО УСТРОЙСТВУ, а не общим на всех гостей. Создаётся один раз и хранится в браузере.
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
    if (token) headers.set('Authorization', 'Bearer ' + token)
    headers.set('X-Device-Id', getDeviceId())

    const res = await orig(input, { ...init, headers })
    // Токен протух / неверный — кроме самих эндпоинтов входа
    if (res.status === 401 && !url.includes('/api/auth/')) {
      clearToken()
      window.dispatchEvent(new Event('albert-unauthorized'))
    }
    return res
  }
}
