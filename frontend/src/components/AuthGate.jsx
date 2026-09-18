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
  const [minPasswordLength, setMinPasswordLength] = useState(8)
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
      errTooMany: (min) => min ? `Слишком много попыток. Попробуйте через ${min} мин.` : 'Слишком много попыток. Подождите немного.',
      passwordHint: (n) => `Пароль — минимум ${n} символов`,
      srvErr: {
        weak_password: (n) => `Пароль должен быть не короче ${n} символов.`,
        password_too_long: () => 'Пароль слишком длинный.',
        bad_name: () => 'Имя: от 2 до 40 символов, без «@» и спецсимволов.',
        name_reserved: () => 'Это имя занято системой, выберите другое.',
        name_taken: () => 'Такое имя уже занято.',
        bad_code: () => 'Неверный код приглашения.',
        store_failed: () => 'Не удалось создать аккаунт. Попробуйте ещё раз.',
        busy: () => 'Сервер занят, попробуйте ещё раз.',
      },
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
      errTooMany: (min) => min ? `Too many attempts. Try again in ${min} min.` : 'Too many attempts. Please wait a bit.',
      passwordHint: (n) => `Password — at least ${n} characters`,
      srvErr: {
        weak_password: (n) => `Password must be at least ${n} characters.`,
        password_too_long: () => 'That password is too long.',
        bad_name: () => 'Name: 2 to 40 characters, no “@” or special characters.',
        name_reserved: () => 'That name is reserved, please pick another.',
        name_taken: () => 'That name is already taken.',
        bad_code: () => 'Wrong invite code.',
        store_failed: () => 'Couldn’t create the account. Please try again.',
        busy: () => 'Server is busy, please try again.',
      },
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
      .then(d => {
        if (!d) return
        setCodeRequired(!!d.registrationCodeRequired)
        if (d.minPasswordLength) setMinPasswordLength(d.minPasswordLength)
      })
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
      } else {
        // Сервер отдаёт КОД ошибки, а не текст: перевод берём из своего словаря, иначе
        // в английском интерфейсе показывалась бы русская строка с бэкенда.
        const d = await r.json().catch(() => null)
        const translate = t.srvErr[d?.error]
        if (r.status === 429) setError(t.errTooMany(d?.retryInMinutes))
        else if (r.status === 503 && d?.error !== 'store_failed') setError(t.errNotConfigured)
        else if (translate) setError(translate(d?.minPasswordLength || minPasswordLength))
        else if (r.status === 401) setError(t.errCreds)
        else setError(t.errFailed)
      }
    } catch {
      setError(t.errNoConnection)
    }
    setBusy(false)
  }

  function switchMode() {
    setMode(m => (m === 'login' ? 'register' : 'login'))
    setError(''); setCode('')
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
          onChange={e => { setUsername(e.target.value); if (error) setError('') }}
          autoFocus
        />
        <input
          className="auth-input"
          type="password"
          placeholder={t.password}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          value={password}
          onChange={e => { setPassword(e.target.value); if (error) setError('') }}
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
        {mode === 'register' && <p className="auth-hint">{t.passwordHint(minPasswordLength)}</p>}
        {error && <div className="auth-error" role="alert">{error}</div>}
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
        /* overflow-y + margin:auto вместо align-items:center — карточка центрируется, когда
           место есть, и ЛИСТАЕТСЯ, когда его нет: горизонтальная ориентация, открытая
           клавиатура на Android, Split View. Раньше при высоте < ~570px логотип уезжал
           за верхний край без возможности доскроллить. Шрифт не задаём — наследуется
           общий Plus Jakarta Sans (здесь стоял Inter, который в проекте не подключён). */
        .auth-screen {
          position: fixed; inset: 0;
          display: flex; justify-content: center;
          padding: 24px;
          overflow-y: auto;
          background: var(--bg-primary);
        }
        .auth-card {
          width: 100%; max-width: 380px;
          margin: auto;
          display: flex; flex-direction: column; align-items: center; gap: 14px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 36px 28px;
          box-shadow: 0 24px 60px var(--scrim);
        }
        .auth-logo {
          width: 52px; height: 52px; border-radius: 14px;
          background: var(--accent); color: var(--on-accent);
          display: flex; align-items: center; justify-content: center;
          font-size: 26px; font-weight: 800;
        }
        .auth-title { font-size: 22px; font-weight: 700; color: var(--foreground); margin: 6px 0 0; }
        .auth-sub { font-size: 14px; color: var(--text-secondary); text-align: center; margin: 0 0 6px; line-height: 1.5; }
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
        /* Фон кнопки — из градиента кнопок дизайн-системы, а не из --accent: тот токен
           предназначен для текста/иконок и на светлых темах давал контраст ~2:1,
           из-за чего активная кнопка выглядела выключенной. */
        .auth-btn {
          width: 100%; padding: 14px; border: none; border-radius: 12px;
          background: linear-gradient(var(--accent-btn-top), var(--accent-btn-bot));
          color: var(--on-accent);
          font-family: inherit; font-size: 16px; font-weight: 700; cursor: pointer;
          transition: filter 0.15s;
        }
        .auth-btn:hover:not(:disabled) { filter: brightness(1.08); }
        /* Честный disabled: нейтральная плашка и приглушённый текст, а не просто opacity —
           иначе непонятно, кнопка ещё активна или уже нет. */
        .auth-btn:disabled {
          background: var(--bg-tile); color: var(--text-muted);
          cursor: default; filter: none;
        }
        .auth-switch {
          background: none; border: none; padding: 2px; cursor: pointer;
          font-family: inherit; font-size: 13.5px; color: var(--accent);
        }
        .auth-switch:hover { text-decoration: underline; }
        .auth-guest { font-size: 12.5px; color: var(--text-secondary); text-align: center; line-height: 1.5; margin-top: 2px; }
        .auth-hint { font-size: 12.5px; color: var(--text-secondary); text-align: center; line-height: 1.5; margin: -4px 0 2px; }
        .auth-guest b { color: var(--foreground); font-weight: 700; }
      `}</style>
    </div>
  )
}
