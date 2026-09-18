import { useState, useEffect } from 'react'
import { getToken, setToken, clearToken, setRole, setUserId, setUserName } from '../api/authFetch.js'
import { claimLocalData } from '../utils/accountData.js'
import { seedGuestDemo } from '../utils/demo.js'
import { useT, useLang } from '../context/LanguageContext.jsx'

/*
  Ворота входа. Пока не введён правильный пароль — показываем экран входа,
  само приложение и его данные не монтируются. Токен хранится на устройстве,
  поэтому повторно вводить пароль не нужно.
*/
export default function AuthGate({ children }) {
  const { lang } = useLang()
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [mode, setMode] = useState('login')          // 'login' | 'register'
  const [codeRequired, setCodeRequired] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const t = useT({
    ru: {
      title: 'RedLava',
      sub: 'Личный кабинет. Введите имя и пароль, чтобы войти.',
      subReg: 'Новый аккаунт. Придумайте имя и пароль — ими и будете входить.',
      name: 'Имя',
      password: 'Пароль',
      code: 'Код приглашения',
      checking: 'Проверяю…',
      creating: 'Создаю…',
      login: 'Войти',
      register: 'Создать аккаунт',
      toRegister: 'Нет аккаунта? Создать',
      toLogin: 'Уже есть аккаунт? Войти',
      errCreds: 'Неверное имя или пароль',
      errNotConfigured: 'Вход ещё не настроен на сервере.',
      errFailed: 'Не удалось войти. Попробуйте позже.',
      errNoConnection: 'Нет связи с сервером.',
      errTooMany: 'Слишком много попыток. Подождите немного.',
      guestPre: 'Хотите просто посмотреть? Войдите как ',
      guestPost: ' — увидите демо без личных данных.',
    },
    en: {
      title: 'RedLava',
      sub: 'Personal account. Enter your name and password to sign in.',
      subReg: 'New account. Pick a name and password — you’ll sign in with those.',
      name: 'Name',
      password: 'Password',
      code: 'Invite code',
      checking: 'Checking…',
      creating: 'Creating…',
      login: 'Sign in',
      register: 'Create account',
      toRegister: 'No account? Create one',
      toLogin: 'Already have an account? Sign in',
      errCreds: 'Wrong name or password',
      errNotConfigured: 'Sign-in is not set up on the server yet.',
      errFailed: 'Couldn’t sign in. Please try again later.',
      errNoConnection: 'No connection to the server.',
      errTooMany: 'Too many attempts. Please wait a bit.',
      guestPre: 'Just want to look around? Sign in as ',
      guestPost: ' — you’ll see a demo with no personal data.',
    },
  })

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
        if (r.ok) {
          const d = await r.json()
          // До монтирования приложения: если в браузере лежат данные другого аккаунта —
          // стереть, ПРЕЖДЕ чем записывать новые role/userId/name — иначе сама эта запись
          // попадёт под стирание (она тоже 'albert-*', а wipe должен снести только старое).
          claimLocalData(d.userId || d.role || null)
          if (d.token) setToken(d.token)  // сервер продлил сессию — сохраняем свежий токен
          setRole(d.role)
          setUserId(d.userId || null)
          setUserName(d.user?.name || null)
          if (d.role === 'guest') seedGuestDemo({ lang })
          setAuthed(true)
        }
        else clearToken()  // токен недействителен — остаёмся на экране входа
      })
      .catch(() => setAuthed(true)) // нет связи — доверяем токену, не блокируем
      .finally(() => setChecking(false))
  }, [])

  // Нужен ли код приглашения при регистрации — знает только сервер (REGISTRATION_CODE)
  useEffect(() => {
    fetch('/api/auth/config')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCodeRequired(!!d.registrationCodeRequired) })
      .catch(() => { /* не критично — поле просто не покажем */ })
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (!username.trim() || !password.trim() || busy) return
    setBusy(true); setError('')
    const registering = mode === 'register'
    try {
      const r = await fetch(registering ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registering
          ? { name: username, password, code: code.trim() || undefined }
          : { username, password })
      })
      if (r.ok) {
        const d = await r.json()
        claimLocalData(d.user?.id || d.role || null)   // чужие данные в этом браузере — стереть до старта
        setToken(d.token)
        setRole(d.role)
        setUserId(d.user?.id || null)
        setUserName(d.user?.name || null)
        if (d.role === 'guest') seedGuestDemo({ force: true, lang })  // свежий демо при входе
        setAuthed(true)
      } else if (r.status === 429) {
        setError(t.errTooMany)
      } else if (r.status === 503) {
        setError(t.errNotConfigured)
      } else if (registering) {
        // при регистрации сервер присылает понятную причину (занятая почта, слабый пароль, код)
        const d = await r.json().catch(() => null)
        setError(d?.message || t.errFailed)
      } else if (r.status === 401) {
        setError(t.errCreds)
      } else {
        setError(t.errFailed)
      }
    } catch {
      setError(t.errNoConnection)
    }
    setBusy(false)
  }

  function switchMode() {
    setMode(m => (m === 'login' ? 'register' : 'login'))
    setError(''); setPassword(''); setCode('')
  }

  if (checking) return <div className="auth-splash" />
  if (authed) return children

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">R</div>
        <h1 className="auth-title">{t.title}</h1>
        <p className="auth-sub">{mode === 'register' ? t.subReg : t.sub}</p>
        <input
          className="auth-input"
          type="text"
          placeholder={t.name}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoFocus
        />
        <input
          className="auth-input"
          type="password"
          placeholder={t.password}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        {mode === 'register' && codeRequired && (
          <input
            className="auth-input"
            type="text"
            placeholder={t.code}
            autoCapitalize="off"
            autoCorrect="off"
            value={code}
            onChange={e => setCode(e.target.value)}
          />
        )}
        {error && <div className="auth-error">{error}</div>}
        <button className="auth-btn" type="submit" disabled={busy || !username.trim() || !password.trim()}>
          {busy ? (mode === 'register' ? t.creating : t.checking) : (mode === 'register' ? t.register : t.login)}
        </button>
        <button className="auth-switch" type="button" onClick={switchMode}>
          {mode === 'register' ? t.toLogin : t.toRegister}
        </button>
        {mode === 'login' && <p className="auth-guest">{t.guestPre}<b>guest</b> / <b>123</b>{t.guestPost}</p>}
      </form>

      <style>{`
        .auth-splash { position: fixed; inset: 0; background: var(--bg-primary); }
        .auth-screen {
          position: fixed; inset: 0;
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
          background: var(--bg-primary);
          font-family: Inter, system-ui, sans-serif;
        }
        .auth-card {
          width: 100%; max-width: 380px;
          display: flex; flex-direction: column; align-items: center; gap: 14px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 36px 28px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.5);
        }
        .auth-logo {
          width: 52px; height: 52px; border-radius: 14px;
          background: var(--accent); color: var(--bg-primary);
          display: flex; align-items: center; justify-content: center;
          font-size: 26px; font-weight: 800;
        }
        .auth-title { font-size: 22px; font-weight: 700; color: var(--foreground); margin: 6px 0 0; }
        .auth-sub { font-size: 14px; color: var(--muted); text-align: center; margin: 0 0 6px; line-height: 1.5; }
        .auth-input {
          width: 100%; box-sizing: border-box;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px; padding: 14px 16px;
          font-family: inherit; font-size: 16px; color: var(--foreground);
          outline: none; transition: border-color 0.15s;
        }
        .auth-input:focus { border-color: var(--accent); }
        .auth-input::placeholder { color: var(--muted); }
        .auth-error { width: 100%; font-size: 13.5px; color: var(--red); text-align: center; }
        .auth-btn {
          width: 100%; padding: 14px; border: none; border-radius: 12px;
          background: var(--accent); color: var(--bg-primary);
          font-family: inherit; font-size: 16px; font-weight: 700; cursor: pointer;
          transition: opacity 0.15s;
        }
        .auth-btn:hover:not(:disabled) { opacity: 0.9; }
        .auth-btn:disabled { opacity: 0.5; cursor: default; }
        .auth-switch {
          background: none; border: none; padding: 2px; cursor: pointer;
          font-family: inherit; font-size: 13.5px; color: var(--accent);
        }
        .auth-switch:hover { text-decoration: underline; }
        .auth-guest { font-size: 12.5px; color: var(--muted); text-align: center; line-height: 1.5; margin-top: 2px; }
        .auth-guest b { color: var(--foreground); font-weight: 700; }
      `}</style>
    </div>
  )
}
