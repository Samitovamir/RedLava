import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { clearToken, isGuest } from '../api/authFetch'
import { useT, useLang } from '../context/LanguageContext.jsx'

/*
  Страница «Подключения».
   - Google Календарь — ЖИВОЕ подключение (OAuth через сервер).
   - Whoop / Garmin — пока демо-режим (включим следующими шагами).
*/

const STORE = 'albert-connections'
const YANDEX_DEFAULT = 'https://disk.yandex.ru/d/EXAMPLE'

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
  },
  {
    id: 'yandex',
    name: 'Яндекс.Диск (анализы)',
    desc: 'Папка с анализами крови — ИИ распознаёт показатели и копит историю в разделе «Здоровье».',
    kind: 'url',
    live: true,
    endpoints: { connect: '/api/labs/connect', disconnect: '/api/labs/disconnect', status: '/api/labs/status' },
    color: '#A85A4A',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      </svg>
    )
  }
]

// Английские варианты названий/описаний сервисов (русские — в SERVICES выше).
const SERVICES_EN = {
  google: { name: 'Google Calendar', desc: 'Events, meetings and reminders — will appear in the “Schedule” section.' },
  whoop:  { name: 'Whoop',           desc: 'Recovery, sleep, HRV and resting heart rate — “Health” section.' },
  garmin: { name: 'Garmin',          desc: 'Workouts, heart rate, steps and activity — “Sports” section.' },
  yandex: { name: 'Yandex.Disk (lab results)', desc: 'Folder with blood test results — the AI recognizes the metrics and builds history in the “Health” section.' }
}

export default function Connections() {
  const t = useT({
    ru: {
      heading: 'Подключения', sub: 'Сервисы владельца',
      intro: 'Подключите ваши сервисы — и дашборд будет показывать настоящие данные: расписание, тренировки и здоровье. Подключить можно прямо здесь.',
      connected: 'Подключено', notConnected: 'Не подключено', demo: 'демо',
      connectedFallback: 'Подключено',
      btnDisconnect: 'Отключить', btnConnect: 'Подключить', btnConnecting: 'Подключение…',
      btnCollapse: 'Свернуть',
      yandexLabel: 'Ссылка на публичную папку Яндекс.Диска',
      yandexNote: '🔒 Папка читается только на чтение. Кладите туда файлы анализов (можно в подпапки по датам) — ИИ сам распознает показатели.',
      btnConnectFolder: 'Подключить папку',
      garminEmailLabel: 'Email Garmin Connect', garminEmailPh: 'ваш@email.com',
      pwLabel: 'Пароль', pwPh: '••••••••',
      garminNote: '🔒 Пароль уходит на сервер по защищённому соединению и не хранится в браузере.',
      btnLoginConnect: 'Войти и подключить',
      foot: 'Все сервисы подключаются по-настоящему: данные появятся в разделах сразу после подключения.',
      guestName: 'Гостевой вход', mainName: 'Аккаунт владельца', mainBadge: 'Основной',
      guestDesc: 'Сейчас вы в гостевом режиме — показаны демо-данные. Войдите в основной аккаунт, чтобы видеть настоящие данные владельца.',
      mainDesc: 'Вы вошли в основной аккаунт с реальными данными. Можно выйти и войти под другим аккаунтом.',
      btnLoginMain: 'Войти в основной аккаунт', btnSwitch: 'Сменить аккаунт',
      resetBtn: 'Сбросить все данные', resetPwLabel: 'Пароль для сброса:', resetPwPh: 'Пароль',
      resetGo: 'Сбросить всё', resetBusy: 'Сбрасываю…', resetCancel: 'Отмена', resetWrong: 'Неверный пароль',
      noticeConnectedSuffix: 'подключён ✓',
      noticeErrPrefix: 'Не удалось подключить', noticeErrSuffix: 'Попробуйте ещё раз.',
      noticeNotConfigured: 'ещё не настроен на сервере (нужны ключи доступа).',
      noticeStartFail: 'Не удалось начать подключение.',
      noticeNoServer: 'Нет связи с сервером.',
      noticeYandexOk: 'Яндекс.Диск подключён ✓ Анализы начнут распознаваться в разделе «Здоровье».',
      noticeYandexFail: 'Не удалось подключить Яндекс.Диск.',
      noticeConnectFailPrefix: 'Не удалось подключить',
      folderConnected: 'Папка подключена',
      googleName: 'Google Календарь', whoopName: 'Whoop'
    },
    en: {
      heading: 'Connections', sub: 'Owner’s services',
      intro: 'Connect your services and the dashboard will show real data: schedule, workouts and health. You can connect right here.',
      connected: 'Connected', notConnected: 'Not connected', demo: 'demo',
      connectedFallback: 'Connected',
      btnDisconnect: 'Disconnect', btnConnect: 'Connect', btnConnecting: 'Connecting…',
      btnCollapse: 'Collapse',
      yandexLabel: 'Link to a public Yandex.Disk folder',
      yandexNote: '🔒 The folder is read-only. Put your lab result files there (subfolders by date are fine) — the AI will recognize the metrics itself.',
      btnConnectFolder: 'Connect folder',
      garminEmailLabel: 'Garmin Connect email', garminEmailPh: 'you@email.com',
      pwLabel: 'Password', pwPh: '••••••••',
      garminNote: '🔒 The password is sent to the server over a secure connection and is not stored in the browser.',
      btnLoginConnect: 'Sign in and connect',
      foot: 'All services connect for real: data appears in the sections right after connecting.',
      guestName: 'Guest access', mainName: 'Owner’s account', mainBadge: 'Primary',
      guestDesc: 'You are currently in guest mode — demo data is shown. Sign in to the primary account to see the owner’s real data.',
      mainDesc: 'You are signed in to the primary account with real data. You can sign out and sign in with another account.',
      btnLoginMain: 'Sign in to primary account', btnSwitch: 'Switch account',
      resetBtn: 'Reset all data', resetPwLabel: 'Reset password:', resetPwPh: 'Password',
      resetGo: 'Reset everything', resetBusy: 'Resetting…', resetCancel: 'Cancel', resetWrong: 'Wrong password',
      noticeConnectedSuffix: 'connected ✓',
      noticeErrPrefix: 'Couldn’t connect', noticeErrSuffix: 'Please try again.',
      noticeNotConfigured: 'isn’t set up on the server yet (access keys required).',
      noticeStartFail: 'Couldn’t start the connection.',
      noticeNoServer: 'No connection to the server.',
      noticeYandexOk: 'Yandex.Disk connected ✓ Lab results will start being recognized in the “Health” section.',
      noticeYandexFail: 'Couldn’t connect Yandex.Disk.',
      noticeConnectFailPrefix: 'Couldn’t connect',
      folderConnected: 'Folder connected',
      googleName: 'Google Calendar', whoopName: 'Whoop'
    }
  })
  const { lang } = useLang()
  // Локализованное имя/описание сервиса (EN-вариант или русский из SERVICES).
  const svcName = (svc) => (lang === 'en' && SERVICES_EN[svc.id]) ? SERVICES_EN[svc.id].name : svc.name
  const svcDesc = (svc) => (lang === 'en' && SERVICES_EN[svc.id]) ? SERVICES_EN[svc.id].desc : svc.desc
  const [conns, setConns] = useState(() => {
    try { const s = localStorage.getItem(STORE); if (s) return JSON.parse(s) } catch { /* ignore */ }
    return {}
  })
  const [busy, setBusy] = useState(null)
  const [openForm, setOpenForm] = useState(null)
  const [form, setForm] = useState({ email: '', password: '' })
  const [urlForm, setUrlForm] = useState('')
  const [notice, setNotice] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [resetPw, setResetPw] = useState('')
  const [resetErr, setResetErr] = useState('')
  const [resetBusy, setResetBusy] = useState(false)

  // Полный сброс данных (пароль 9986): отвязывает сервисы и стирает локальные данные
  async function submitReset(e) {
    e.preventDefault()
    if (resetPw.trim() !== '9986') { setResetErr(t.resetWrong); return }
    setResetBusy(true)
    await Promise.all([
      fetch('/api/calendar/disconnect', { method: 'POST' }).catch(() => {}),
      fetch('/api/whoop/disconnect', { method: 'POST' }).catch(() => {}),
      fetch('/api/garmin/disconnect', { method: 'POST' }).catch(() => {})
    ])
    try {
      Object.keys(localStorage).forEach(k => {
        if (k === 'albert-auth') return // вход не трогаем
        if (k.startsWith('albert-') || k.startsWith('ai-sum')) localStorage.removeItem(k)
      })
    } catch { /* ignore */ }
    window.location.reload()
  }

  const guest = isGuest()

  // Сменить аккаунт: чистим токен и роль, перезагружаем — AuthGate покажет экран входа
  function switchAccount() {
    clearToken()
    window.location.reload()
  }

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(conns)) } catch { /* ignore */ }
  }, [conns])

  // Возврат из Google OAuth + актуальный статус живых сервисов
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const names = { google: t.googleName, whoop: t.whoopName }
    let changed = false
    for (const key of Object.keys(names)) {
      const v = p.get(key)
      if (v === 'ok') { setNotice(`${names[key]} ${t.noticeConnectedSuffix}`); changed = true }
      else if (v === 'err') { setNotice(`${t.noticeErrPrefix} ${names[key]}. ${t.noticeErrSuffix}`); changed = true }
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
        if (r.status === 503) { setNotice(`${svcName(svc)} ${t.noticeNotConfigured}`); setBusy(null); return }
        const d = await r.json()
        if (d.url) { window.location.href = d.url; return } // уходим на экран входа Google
        setNotice(t.noticeStartFail); setBusy(null)
      } catch { setNotice(t.noticeNoServer); setBusy(null) }
      return
    }
    // демо-режим (Whoop/Garmin пока)
    setBusy(svc.id)
    setTimeout(() => {
      setConns(c => ({ ...c, [svc.id]: { connected: true, account: `${svcName(svc)}` } }))
      setBusy(null)
    }, 900)
  }

  function startLoginForm(svc) { setOpenForm(svc.id); setForm({ email: '', password: '' }) }

  function startUrlForm(svc) {
    setOpenForm(svc.id)
    // подставим уже сохранённую ссылку, если есть
    fetch(svc.endpoints.status).then(r => r.json()).then(d => setUrlForm(d.url || YANDEX_DEFAULT)).catch(() => setUrlForm(YANDEX_DEFAULT))
  }

  async function submitUrl(svc) {
    const url = urlForm.trim()
    if (!url) return
    setBusy(svc.id)
    try {
      const r = await fetch(svc.endpoints.connect, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
      const d = await r.json()
      if (d.ok) {
        setConns(c => ({ ...c, [svc.id]: { connected: true, account: t.folderConnected } }))
        setNotice(t.noticeYandexOk)
        setOpenForm(null)
      } else {
        setNotice(d.message || t.noticeYandexFail)
      }
    } catch { setNotice(t.noticeNoServer) }
    setBusy(null)
  }

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
          setNotice(`${svcName(svc)} ${t.noticeConnectedSuffix}`)
          setForm({ email: '', password: '' }); setOpenForm(null)
        } else {
          setNotice(d.message || `${t.noticeConnectFailPrefix} ${svcName(svc)}.`)
        }
      } catch { setNotice(t.noticeNoServer) }
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
        if (svc.id === 'yandex') { localStorage.removeItem('albert-labs'); localStorage.removeItem('albert-labs-synced') }
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
        <h2>{t.heading}</h2>
        <span className="muted">{t.sub}</span>
      </div>

      <p className="conn-intro muted">
        {t.intro}
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
                    {svcName(svc)}
                    {connected
                      ? <span className="conn-badge on">{t.connected}</span>
                      : <span className="conn-badge">{t.notConnected}</span>}
                    {!svc.live && <span className="conn-soon">{t.demo}</span>}
                  </div>
                  <div className="conn-desc muted">{svcDesc(svc)}</div>
                  {connected && <div className="conn-account">{c.email || c.account || t.connectedFallback}</div>}
                </div>
                <div className="conn-action">
                  {connected ? (
                    <button className="conn-btn ghost" onClick={() => disconnect(svc)}>{t.btnDisconnect}</button>
                  ) : svc.kind === 'oauth' ? (
                    <button className="conn-btn primary" disabled={isBusy} onClick={() => connect(svc)}>
                      {isBusy ? t.btnConnecting : t.btnConnect}
                    </button>
                  ) : (
                    <button className="conn-btn primary" disabled={isBusy} onClick={() => formOpen ? setOpenForm(null) : (svc.kind === 'url' ? startUrlForm(svc) : startLoginForm(svc))}>
                      {formOpen ? t.btnCollapse : t.btnConnect}
                    </button>
                  )}
                </div>
              </div>

              {svc.kind === 'url' && formOpen && !connected && (
                <motion.div className="conn-form" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                  <div className="conn-field">
                    <label>{t.yandexLabel}</label>
                    <input type="text" placeholder="https://disk.yandex.ru/d/..." value={urlForm}
                      onChange={e => setUrlForm(e.target.value)} />
                  </div>
                  <div className="conn-form-foot">
                    <span className="conn-note muted">{t.yandexNote}</span>
                    <button className="conn-btn primary" disabled={isBusy || !urlForm.trim()} onClick={() => submitUrl(svc)}>
                      {isBusy ? t.btnConnecting : t.btnConnectFolder}
                    </button>
                  </div>
                </motion.div>
              )}

              {svc.kind === 'login' && formOpen && !connected && (
                <motion.div className="conn-form" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                  <div className="conn-field">
                    <label>{t.garminEmailLabel}</label>
                    <input type="email" placeholder={t.garminEmailPh} value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div className="conn-field">
                    <label>{t.pwLabel}</label>
                    <input type="password" placeholder={t.pwPh} value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                  </div>
                  <div className="conn-form-foot">
                    <span className="conn-note muted">{t.garminNote}</span>
                    <button className="conn-btn primary" disabled={isBusy || !form.email.trim() || !form.password.trim()} onClick={() => submitLogin(svc)}>
                      {isBusy ? t.btnConnecting : t.btnLoginConnect}
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </div>

      <p className="conn-foot muted">
        {t.foot}
      </p>

      <motion.div
        className="card conn-account-card"
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <div className="conn-row">
          <span className="conn-icon" style={{ background: 'rgba(176, 123, 82,0.13)', color: 'var(--accent)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </span>
          <div className="conn-info">
            <div className="conn-name">
              {guest ? t.guestName : t.mainName}
              {guest
                ? <span className="conn-soon">{t.demo}</span>
                : <span className="conn-badge on">{t.mainBadge}</span>}
            </div>
            <div className="conn-desc muted">
              {guest ? t.guestDesc : t.mainDesc}
            </div>
          </div>
          <div className="conn-action">
            <button className={`conn-btn ${guest ? 'primary' : 'ghost'}`} onClick={switchAccount}>
              {guest ? t.btnLoginMain : t.btnSwitch}
            </button>
          </div>
        </div>
      </motion.div>

      <div className="conn-reset">
        {!resetOpen ? (
          <button className="conn-reset-btn" onClick={() => { setResetOpen(true); setResetErr('') }}>
            {t.resetBtn}
          </button>
        ) : (
          <form className="conn-reset-form" onSubmit={submitReset}>
            <span className="muted">{t.resetPwLabel}</span>
            <input
              className="conn-reset-input" type="password" placeholder={t.resetPwPh}
              value={resetPw} onChange={e => { setResetPw(e.target.value); setResetErr('') }}
              autoFocus inputMode="numeric"
            />
            <button className="conn-reset-go" type="submit" disabled={resetBusy || !resetPw.trim()}>
              {resetBusy ? t.resetBusy : t.resetGo}
            </button>
            <button type="button" className="conn-reset-cancel" onClick={() => { setResetOpen(false); setResetPw(''); setResetErr('') }}>
              {t.resetCancel}
            </button>
            {resetErr && <span className="conn-reset-err">{resetErr}</span>}
          </form>
        )}
      </div>

      <style>{`
        .conn-page { display: flex; flex-direction: column; gap: 18px; max-width: 760px; padding-bottom: 24px; }
        .page-header { display: flex; align-items: baseline; gap: 12px; }
        .conn-intro { font-size: 15px; line-height: 1.6; max-width: 620px; margin: -4px 0 2px; }
        .conn-notice {
          background: rgba(176, 123, 82,0.12); border: 1px solid var(--accent);
          color: var(--foreground); border-radius: 12px; padding: 12px 16px; font-size: 14px;
        }
        .conn-list { display: flex; flex-direction: column; gap: 14px; }
        .conn-card { padding: 18px 20px; transition: border-color 0.2s, box-shadow 0.2s; }
        .conn-card.on { border-color: rgba(126, 155, 110,0.4); box-shadow: 0 0 0 1px rgba(126, 155, 110,0.15); }
        .conn-row { display: flex; align-items: center; gap: 16px; }
        .conn-icon { width: 48px; height: 48px; border-radius: 14px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .conn-info { flex: 1; min-width: 0; }
        .conn-name { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 700; color: var(--foreground); }
        .conn-badge { font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 20px; background: var(--bg-secondary); color: var(--muted-foreground); }
        .conn-badge.on { background: rgba(126, 155, 110,0.16); color: var(--green); }
        .conn-soon { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--yellow); background: rgba(201, 138, 94,0.14); padding: 2px 7px; border-radius: 20px; }
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
        .conn-account-card { padding: 18px 20px; }
        .conn-reset { margin-top: 8px; padding-top: 18px; border-top: 1px solid var(--border); }
        .conn-reset-btn {
          background: transparent; border: 1px solid var(--border); color: var(--muted-foreground);
          border-radius: 11px; padding: 9px 16px; font-family: inherit; font-size: 13.5px; font-weight: 600;
          cursor: pointer; transition: all 0.15s;
        }
        .conn-reset-btn:hover { color: var(--red); border-color: var(--red); }
        .conn-reset-form { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .conn-reset-input {
          background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 10px;
          padding: 9px 14px; font-family: inherit; font-size: 14px; color: var(--foreground); outline: none; width: 140px;
        }
        .conn-reset-input:focus { border-color: var(--red); }
        .conn-reset-go {
          background: var(--red); color: #fff; border: none; border-radius: 10px;
          padding: 9px 16px; font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: opacity 0.15s;
        }
        .conn-reset-go:hover:not(:disabled) { opacity: 0.9; }
        .conn-reset-go:disabled { opacity: 0.5; cursor: default; }
        .conn-reset-cancel {
          background: transparent; border: 1px solid var(--border); color: var(--muted-foreground);
          border-radius: 10px; padding: 9px 16px; font-family: inherit; font-size: 13.5px; cursor: pointer;
        }
        .conn-reset-err { font-size: 13px; color: var(--red); }
        @media (max-width: 560px) { .conn-row { flex-wrap: wrap; } .conn-action { width: 100%; } .conn-btn { width: 100%; } }
      `}</style>
    </div>
  )
}
