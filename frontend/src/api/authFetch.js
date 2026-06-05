// Авторизация на уровне всего приложения: токен добавляется ко всем /api запросам,
// чтобы не переписывать каждый fetch в коде. При 401 — сбрасываем и просим войти снова.

const TOKEN_KEY = 'albert-auth'

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export const setToken = (t) => {
  try { localStorage.setItem(TOKEN_KEY, t) } catch { /* ignore */ }
}
export const clearToken = () => {
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
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

    const res = await orig(input, { ...init, headers })
    // Токен протух / неверный — кроме самих эндпоинтов входа
    if (res.status === 401 && !url.includes('/api/auth/')) {
      clearToken()
      window.dispatchEvent(new Event('albert-unauthorized'))
    }
    return res
  }
}
