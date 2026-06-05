import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

/*
  Страница «Подключения».
   - Google Календарь — ЖИВОЕ подключение (OAuth через сервер).
   - Whoop / Garmin — пока демо-режим (включим следующими шагами).
*/

const STORE = 'albert-connections'

const SERVICES = [
  {
    id: 'google',
    name: 'Google Календарь',
    desc: 'События, встречи и напоминания — появятся в разделе «Расписание».',
    kind: 'oauth',
    live: true,
    endpoints: { url: '/api/calendar/connect-url', disconnect: '/api/calendar/disconnect', status: '/api/calendar/status' },
    color: '#4285F4',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    )
  },
  {
    id: 'whoop',
    name: 'Whoop',
    desc: 'Восстановление, сон, HRV и пульс покоя — раздел «Здоровье».',
    kind: 'oauth',
    live: true,
    endpoints: { url: '/api/whoop/connect-url', disconnect: '/api/whoop/disconnect', status: '/api/whoop/status' },
    color: '#16a34a',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      </svg>
    )
  },
  {
    id: 'garmin',
    name: 'Garmin',
    desc: 'Тренировки, пульс, шаги и активность — раздел «Спорт».',
    kind: 'login',
    live: true,
    endpoints: { connect: '/api/garmin/connect', disconnect: '/api/garmin/disconnect', status: '/api/garmin/status' },
    color: '#0ea5e9',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="6"/><path d="M12 9v3l2 1"/><path d="M9 2h6"/><path d="M9 22h6"/>
      </svg>
    )
  }
]

export default function Connections() {
  const [conns, setConns] = useState(() => {
    try { const s = localStorage.getItem(STORE); if (s) return JSON.parse(s) } catch { /* ignore */ }
    return {}
  })
  const [busy, setBusy] = useState(null)
  const [openForm, setOpenForm] = useState(null)
  const [form, setForm] = useState({ email: '', password: '' })
  const [notice, setNotice] = useState('')

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(conns)) } catch { /* ignore */ }
  }, [conns])

  // Возврат из Google OAuth + актуальный статус живых сервисов
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const names = { google: 'Google Календарь', whoop: 'Whoop' }
    let changed = false
    for (const key of Object.keys(names)) {
      const v = p.get(key)
      if (v === 'ok') { setNotice(`${names[key]} подключён ✓`); changed = true }
      else if (v === 'err') { setNotice(`Не удалось подключить ${names[key]}. Попробуйте ещё раз.`); changed = true }
    }
    if (changed) window.history.replaceState({}, '', '/connections')

    SERVICES.filter(s => s.live).forEach(s => {
      fetch(s.endpoints.status)
        .then(r => r.json())
        .then(d => setConns(c => ({ ...c, [s.id]: { connected: !!d.connected, configured: !!d.configured } })))
        .catch(() => {})
    })
  }, [])

  async function connect(svc) {
    if (svc.live) {
      setBusy(svc.id)
      try {
        const r = await fetch(svc.endpoints.url)
        if (r.status === 503) { setNotice(`${svc.name} ещё не настроен на сервере (нужны ключи доступа).`); setBusy(null); return }
        const d = await r.json()
        if (d.url) { window.location.href = d.url; return } // уходим на экран входа Google
        setNotice('Не удалось начать подключение.'); setBusy(null)
      } catch { setNotice('Нет связи с сервером.'); setBusy(null) }
      return
    }
    // демо-режим (Whoop/Garmin пока)
    setBusy(svc.id)
    setTimeout(() => {
      setConns(c => ({ ...c, [svc.id]: { connected: true, account: `Аккаунт ${svc.name}` } }))
      setBusy(null)
    }, 900)
  }

  function startLoginForm(svc) { setOpenForm(svc.id); setForm({ email: '', password: '' }) }

  async function submitLogin(svc) {
    if (!form.email.trim() || !form.password.trim()) return
    setBusy(svc.id)
    if (svc.live) {
      try {
        const r = await fetch(svc.endpoints.connect, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email.trim(), password: form.password })
        })
        const d = await r.json()
        if (d.success) {
          setConns(c => ({ ...c, [svc.id]: { connected: true, email: form.email.trim() } }))
          setNotice(`${svc.name} подключён ✓`)
          setForm({ email: '', password: '' }); setOpenForm(null)
        } else {
          setNotice(d.message || `Не удалось подключить ${svc.name}.`)
        }
      } catch { setNotice('Нет связи с сервером.') }
      setBusy(null)
      return
    }
    setTimeout(() => {
      setConns(c => ({ ...c, [svc.id]: { connected: true, email: form.email.trim() } }))
      setForm({ email: '', password: '' }); setOpenForm(null); setBusy(null)
    }, 900)
  }

  async function disconnect(svc) {
    if (svc.live) {
      try { await fetch(svc.endpoints.disconnect, { method: 'POST' }) } catch { /* ignore */ }
      // стираем загруженные данные сервиса, чтобы они не висели после отвязки
      try {
        if (svc.id === 'google') localStorage.removeItem('albert-events')
        if (svc.id === 'whoop') localStorage.removeItem('albert-whoop-live')
        if (svc.id === 'garmin') localStorage.removeItem('albert-garmin-live')
      } catch { /* ignore */ }
      setConns(c => ({ ...c, [svc.id]: { connected: false, configured: c[svc.id]?.configured } }))
      // перезагружаем, чтобы данные исчезли везде (расписание, здоровье, спорт, ИИ)
      setTimeout(() => window.location.reload(), 250)
      return
    }
    setConns(c => { const n = { ...c }; delete n[svc.id]; return n })
    setOpenForm(null)
  }

  return (
    <div className="conn-page">
      <div className="page-header">
        <h2>Подключения</h2>
        <span className="muted">Сервисы владельца</span>
      </div>

      <p className="conn-intro muted">
        Подключите ваши сервисы — и дашборд будет показывать настоящие данные:
        расписание, тренировки и здоровье. Подключить можно прямо здесь.
      </p>

      {notice && <div className="conn-notice">{notice}</div>}

      <div className="conn-list">
        {SERVICES.map((svc, i) => {
          const c = conns[svc.id]
          const connected = !!c?.connected
          const isBusy = busy === svc.id
          const formOpen = openForm === svc.id
          return (
            <motion.div
              key={svc.id}
              className={`card conn-card ${connected ? 'on' : ''}`}
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.06 }}
            >
              <div className="conn-row">
                <span className="conn-icon" style={{ background: `${svc.color}22`, color: svc.color }}>
                  {svc.icon}
                </span>
                <div className="conn-info">
                  <div className="conn-name">
                    {svc.name}
                    {connected
                      ? <span className="conn-badge on">Подключено</span>
                      : <span className="conn-badge">Не подключено</span>}
                    {!svc.live && <span className="conn-soon">демо</span>}
                  </div>
                  <div className="conn-desc muted">{svc.desc}</div>
                  {connected && <div className="conn-account">{c.email || c.account || 'Подключено'}</div>}
                </div>
                <div className="conn-action">
                  {connected ? (
                    <button className="conn-btn ghost" onClick={() => disconnect(svc)}>Отключить</button>
                  ) : svc.kind === 'oauth' ? (
                    <button className="conn-btn primary" disabled={isBusy} onClick={() => connect(svc)}>
                      {isBusy ? 'Подключение…' : 'Подключить'}
                    </button>
                  ) : (
                    <button className="conn-btn primary" disabled={isBusy} onClick={() => formOpen ? setOpenForm(null) : startLoginForm(svc)}>
                      {formOpen ? 'Свернуть' : 'Подключить'}
                    </button>
                  )}
                </div>
              </div>

              {svc.kind === 'login' && formOpen && !connected && (
                <motion.div className="conn-form" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                  <div className="conn-field">
                    <label>Email Garmin Connect</label>
                    <input type="email" placeholder="ваш@email.com" value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div className="conn-field">
                    <label>Пароль</label>
                    <input type="password" placeholder="••••••••" value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                  </div>
                  <div className="conn-form-foot">
                    <span className="conn-note muted">🔒 Пароль уходит на сервер по защищённому соединению и не хранится в браузере.</span>
                    <button className="conn-btn primary" disabled={isBusy || !form.email.trim() || !form.password.trim()} onClick={() => submitLogin(svc)}>
                      {isBusy ? 'Подключение…' : 'Войти и подключить'}
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </div>

      <p className="conn-foot muted">
        Все сервисы подключаются по-настоящему: данные появятся в разделах сразу после подключения.
      </p>

      <style>{`
        .conn-page { display: flex; flex-direction: column; gap: 18px; max-width: 760px; padding-bottom: 24px; }
        .page-header { display: flex; align-items: baseline; gap: 12px; }
        .conn-intro { font-size: 15px; line-height: 1.6; max-width: 620px; margin: -4px 0 2px; }
        .conn-notice {
          background: rgba(129,140,248,0.12); border: 1px solid var(--accent);
          color: var(--foreground); border-radius: 12px; padding: 12px 16px; font-size: 14px;
        }
        .conn-list { display: flex; flex-direction: column; gap: 14px; }
        .conn-card { padding: 18px 20px; transition: border-color 0.2s, box-shadow 0.2s; }
        .conn-card.on { border-color: rgba(34,197,94,0.4); box-shadow: 0 0 0 1px rgba(34,197,94,0.15); }
        .conn-row { display: flex; align-items: center; gap: 16px; }
        .conn-icon { width: 48px; height: 48px; border-radius: 14px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .conn-info { flex: 1; min-width: 0; }
        .conn-name { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 700; color: var(--foreground); }
        .conn-badge { font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 20px; background: var(--bg-secondary); color: var(--muted-foreground); }
        .conn-badge.on { background: rgba(34,197,94,0.16); color: var(--green); }
        .conn-soon { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--yellow); background: rgba(245,158,11,0.14); padding: 2px 7px; border-radius: 20px; }
        .conn-desc { font-size: 13.5px; line-height: 1.5; margin-top: 3px; }
        .conn-account { font-size: 13px; color: var(--green); margin-top: 5px; font-weight: 500; }
        .conn-action { flex-shrink: 0; }
        .conn-btn { padding: 10px 18px; border-radius: 11px; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: all 0.15s; }
        .conn-btn.primary { background: var(--accent); color: var(--accent-foreground); }
        .conn-btn.primary:hover:not(:disabled) { opacity: 0.9; }
        .conn-btn.primary:disabled { opacity: 0.5; cursor: default; }
        .conn-btn.ghost { background: transparent; border-color: var(--border); color: var(--muted-foreground); }
        .conn-btn.ghost:hover { color: var(--foreground); border-color: var(--accent); }
        .conn-form { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 12px; overflow: hidden; }
        .conn-field { display: flex; flex-direction: column; gap: 6px; }
        .conn-field label { font-size: 13px; color: var(--muted-foreground); font-weight: 500; }
        .conn-field input { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; font-family: inherit; font-size: 15px; color: var(--foreground); outline: none; transition: border-color 0.15s; }
        .conn-field input:focus { border-color: var(--accent); }
        .conn-field input::placeholder { color: var(--muted-foreground); }
        .conn-form-foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
        .conn-note { font-size: 12.5px; line-height: 1.4; flex: 1; min-width: 200px; }
        .conn-foot { font-size: 13px; margin-top: 4px; }
        @media (max-width: 560px) { .conn-row { flex-wrap: wrap; } .conn-action { width: 100%; } .conn-btn { width: 100%; } }
      `}</style>
    </div>
  )
}
