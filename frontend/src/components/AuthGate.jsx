import { useState, useEffect } from 'react'
import { getToken, setToken, clearToken, setRole } from '../api/authFetch.js'
import { seedGuestDemo } from '../utils/demo.js'

/*
  Ворота входа. Пока не введён правильный пароль — показываем экран входа,
  само приложение и его данные не монтируются. Токен хранится на устройстве,
  поэтому повторно вводить пароль не нужно.
*/
export default function AuthGate({ children }) {
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Если токен протух во время работы — вернуть на экран входа
  useEffect(() => {
    const onUnauth = () => setAuthed(false)
    window.addEventListener('albert-unauthorized', onUnauth)
    return () => window.removeEventListener('albert-unauthorized', onUnauth)
  }, [])

  // Тихий вход при открытии, если токен уже есть и он валиден
  useEffect(() => {
    const t = getToken()
    if (!t) { setChecking(false); return }
    fetch('/api/auth/verify')
      .then(async r => {
        if (r.ok) { const d = await r.json(); setRole(d.role); if (d.role === 'guest') seedGuestDemo(); setAuthed(true) }
        else clearToken()  // токен недействителен — остаёмся на экране входа
      })
      .catch(() => setAuthed(true)) // нет связи — доверяем токену, не блокируем
      .finally(() => setChecking(false))
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (!username.trim() || !password.trim() || busy) return
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      if (r.ok) {
        const d = await r.json()
        setToken(d.token)
        setRole(d.role)
        if (d.role === 'guest') seedGuestDemo({ force: true })  // свежий демо при входе
        setAuthed(true)
      } else if (r.status === 401) {
        setError('Неверное имя или пароль')
      } else if (r.status === 503) {
        setError('Вход ещё не настроен на сервере.')
      } else {
        setError('Не удалось войти. Попробуйте позже.')
      }
    } catch {
      setError('Нет связи с сервером.')
    }
    setBusy(false)
  }

  if (checking) return <div className="auth-splash" />
  if (authed) return children

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">A</div>
        <h1 className="auth-title">Дашборд владельца</h1>
        <p className="auth-sub">Личный кабинет. Введите имя и пароль, чтобы войти.</p>
        <input
          className="auth-input"
          type="text"
          placeholder="Имя"
          autoCapitalize="off"
          autoCorrect="off"
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoFocus
        />
        <input
          className="auth-input"
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        {error && <div className="auth-error">{error}</div>}
        <button className="auth-btn" type="submit" disabled={busy || !username.trim() || !password.trim()}>
          {busy ? 'Проверяю…' : 'Войти'}
        </button>
        <p className="auth-guest">Хотите просто посмотреть? Войдите как <b>guest</b> / <b>123</b> — увидите демо без личных данных.</p>
      </form>

      <style>{`
        .auth-splash { position: fixed; inset: 0; background: var(--bg-primary, #1e1b18); }
        .auth-screen {
          position: fixed; inset: 0;
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
          background:
            radial-gradient(700px circle at 50% -10%, rgba(129,140,248,0.10), transparent 60%),
            var(--bg-primary, #1e1b18);
          font-family: Inter, system-ui, sans-serif;
        }
        .auth-card {
          width: 100%; max-width: 380px;
          display: flex; flex-direction: column; align-items: center; gap: 14px;
          background: var(--bg-card, #2c2825);
          border: 1px solid var(--border, #3a3633);
          border-radius: 20px;
          padding: 36px 28px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.5);
        }
        .auth-logo {
          width: 52px; height: 52px; border-radius: 14px;
          background: var(--accent, #818cf8); color: var(--bg-primary, #1e1b18);
          display: flex; align-items: center; justify-content: center;
          font-size: 26px; font-weight: 800;
        }
        .auth-title { font-size: 22px; font-weight: 700; color: var(--foreground, #e2e8f0); margin: 6px 0 0; }
        .auth-sub { font-size: 14px; color: var(--muted, #9ca3af); text-align: center; margin: 0 0 6px; line-height: 1.5; }
        .auth-input {
          width: 100%; box-sizing: border-box;
          background: var(--bg-secondary, #3a3633);
          border: 1px solid var(--border, #3a3633);
          border-radius: 12px; padding: 14px 16px;
          font-family: inherit; font-size: 16px; color: var(--foreground, #e2e8f0);
          outline: none; transition: border-color 0.15s;
        }
        .auth-input:focus { border-color: var(--accent, #818cf8); }
        .auth-input::placeholder { color: var(--muted, #9ca3af); }
        .auth-error { width: 100%; font-size: 13.5px; color: var(--red, #ef4444); text-align: center; }
        .auth-btn {
          width: 100%; padding: 14px; border: none; border-radius: 12px;
          background: var(--accent, #818cf8); color: var(--bg-primary, #1e1b18);
          font-family: inherit; font-size: 16px; font-weight: 700; cursor: pointer;
          transition: opacity 0.15s;
        }
        .auth-btn:hover:not(:disabled) { opacity: 0.9; }
        .auth-btn:disabled { opacity: 0.5; cursor: default; }
        .auth-guest { font-size: 12.5px; color: var(--muted, #9ca3af); text-align: center; line-height: 1.5; margin-top: 2px; }
        .auth-guest b { color: var(--foreground, #e2e8f0); font-weight: 700; }
      `}</style>
    </div>
  )
}
