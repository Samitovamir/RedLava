import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { clearToken, setToken, isGuest, getUsername } from '../api/authFetch'
import { wipePersonalData } from '../utils/accountData.js'
import { useT, useLang } from '../context/LanguageContext.jsx'
import { pushSync } from '../utils/sync.js'
import { Button, Field, Icon, SectionHeader, StatusPill } from '../ui'

/*
  The "Connections" page.
   - Google Calendar — a LIVE connection (OAuth through the server).
   - Whoop / Garmin — demo mode for now (we'll switch them on in the next steps).
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

// English variants of the service names/descriptions (the Russian ones are in SERVICES above).
const SERVICES_EN = {
  google: { name: 'Google Calendar', desc: 'Events, meetings and reminders — will appear in the “Schedule” section.' },
  whoop:  { name: 'Whoop',           desc: 'Recovery, sleep, HRV and resting heart rate — “Health” section.' },
  garmin: { name: 'Garmin',          desc: 'Workouts, heart rate, steps and activity — “Sports” section.' },
  yandex: { name: 'Yandex.Disk (lab results)', desc: 'Folder with blood test results — the AI recognizes the metrics and builds history in the “Health” section.' }
}

export default function Connections() {
  const t = useT({
    ru: {
      heading: 'Подключения', sub: 'Ваши сервисы',
      intro: 'Подключите ваши сервисы — и дашборд будет показывать настоящие данные: расписание, тренировки и здоровье. Подключить можно прямо здесь.',
      connected: 'Подключено', notConnected: 'Не подключено', demo: 'демо',
      connectedFallback: 'Подключено',
      btnDisconnect: 'Отключить', btnConnect: 'Подключить', btnConnecting: 'Подключение…',
      btnCollapse: 'Свернуть',
      yandexLabel: 'Ссылка на публичную папку Яндекс.Диска',
      yandexNote: 'Папка читается только на чтение. Кладите туда файлы анализов (можно в подпапки по датам) — ИИ сам распознает показатели.',
      btnConnectFolder: 'Подключить папку',
      garminEmailLabel: 'Email Garmin Connect', garminEmailPh: 'ваш@email.com',
      pwLabel: 'Пароль', pwPh: '••••••••',
      garminNote: 'Пароль уходит на сервер по защищённому соединению и не хранится в браузере.',
      btnLoginConnect: 'Войти и подключить',
      foot: 'Все сервисы подключаются по-настоящему: данные появятся в разделах сразу после подключения.',
      guestName: 'Гостевой вход',
      guestDesc: 'Сейчас вы в гостевом режиме — показаны демо-данные. Войдите в основной аккаунт, чтобы видеть настоящие данные.',
      memberBadge: 'Ваш аккаунт',
      memberDesc: 'Здесь видны только ваши подключения и данные — они не пересекаются с другими аккаунтами.',
      btnLoginMain: 'Войти в основной аккаунт', btnSwitch: 'Сменить аккаунт',
      resetBtn: 'Сбросить мои данные',
      resetConfirm: 'Отключить все ваши сервисы и стереть ваши данные? Отменить это будет нельзя.',
      resetGo: 'Да, сбросить', resetBusy: 'Сбрасываю…', resetCancel: 'Отмена',
      resetNoServer: 'Нет связи с сервером.',
      logoutAllBtn: 'Выйти на других устройствах', logoutAllBusy: 'Отзываю…',
      logoutAllHint: 'Отзывает вход в ваш аккаунт на всех остальных телефонах и браузерах. Это устройство остаётся внутри, других участников не касается. Нужно, если потерялся телефон. Если пароль мог кому-то попасться на глаза, лучше смените его: это тоже выведет остальные устройства.',
      pwBtn: 'Сменить пароль',
      pwHint: 'Понадобится текущий пароль. После смены все остальные устройства выйдут из аккаунта.',
      pwCurrent: 'Текущий пароль', pwNew: 'Новый пароль', pwRepeat: 'Новый пароль ещё раз',
      pwNewHint: (n) => `Не короче ${n} символов`,
      pwSave: 'Сохранить пароль', pwSaving: 'Сохраняю…',
      pwDone: 'Пароль изменён. Остальные устройства вышли из аккаунта.',
      pwErr: {
        wrong_password: () => 'Текущий пароль не подходит.',
        weak_password: (n) => `Пароль должен быть не короче ${n} символов.`,
        password_too_long: () => 'Пароль слишком длинный.',
        same_password: () => 'Новый пароль совпадает с текущим.',
        mismatch: () => 'Пароли не совпадают.',
        too_many_attempts: (min) => `Слишком много попыток. Попробуйте через ${min || 15} мин.`,
        failed: () => 'Не удалось сменить пароль. Попробуйте ещё раз.',
      },
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
      heading: 'Connections', sub: 'Your services',
      intro: 'Connect your services and the dashboard will show real data: schedule, workouts and health. You can connect right here.',
      connected: 'Connected', notConnected: 'Not connected', demo: 'demo',
      connectedFallback: 'Connected',
      btnDisconnect: 'Disconnect', btnConnect: 'Connect', btnConnecting: 'Connecting…',
      btnCollapse: 'Collapse',
      yandexLabel: 'Link to a public Yandex.Disk folder',
      yandexNote: 'The folder is read-only. Put your lab result files there (subfolders by date are fine) — the AI will recognize the metrics itself.',
      btnConnectFolder: 'Connect folder',
      garminEmailLabel: 'Garmin Connect email', garminEmailPh: 'you@email.com',
      pwLabel: 'Password', pwPh: '••••••••',
      garminNote: 'The password is sent to the server over a secure connection and is not stored in the browser.',
      btnLoginConnect: 'Sign in and connect',
      foot: 'All services connect for real: data appears in the sections right after connecting.',
      guestName: 'Guest access',
      guestDesc: 'You are currently in guest mode — demo data is shown. Sign in to the primary account to see real data.',
      memberBadge: 'Your account',
      memberDesc: 'Only your own connections and data show up here — nothing crosses over with other accounts.',
      btnLoginMain: 'Sign in to primary account', btnSwitch: 'Switch account',
      resetBtn: 'Reset my data',
      resetConfirm: 'Disconnect all your services and erase your data? This cannot be undone.',
      resetGo: 'Yes, reset', resetBusy: 'Resetting…', resetCancel: 'Cancel',
      resetNoServer: 'No connection to the server.',
      logoutAllBtn: 'Sign out other devices', logoutAllBusy: 'Revoking…',
      logoutAllHint: 'Revokes sign-in to your account on every other phone and browser. This device stays signed in, and other members are unaffected. Useful if a phone was lost. If the password may have been seen, change it instead: that signs out other devices too.',
      pwBtn: 'Change password',
      pwHint: 'You’ll need the current one. Once it’s changed, every other device is signed out.',
      pwCurrent: 'Current password', pwNew: 'New password', pwRepeat: 'New password again',
      pwNewHint: (n) => `At least ${n} characters`,
      pwSave: 'Save password', pwSaving: 'Saving…',
      pwDone: 'Password changed. Your other devices have been signed out.',
      pwErr: {
        wrong_password: () => 'The current password is wrong.',
        weak_password: (n) => `Password must be at least ${n} characters.`,
        password_too_long: () => 'That password is too long.',
        same_password: () => 'That’s the password you already have.',
        mismatch: () => 'The passwords don’t match.',
        too_many_attempts: (min) => `Too many attempts. Try again in ${min || 15} min.`,
        failed: () => 'Couldn’t change the password. Please try again.',
      },
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
  // Localized service name/description (the EN variant, or the Russian one from SERVICES).
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
  const [resetErr, setResetErr] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [logoutAllBusy, setLogoutAllBusy] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', repeat: '' })
  const [pwErr, setPwErr] = useState(null)   // { field: 'current' | 'next' | 'repeat' | null, text }
  const [pwBusy, setPwBusy] = useState(false)
  const [pwDone, setPwDone] = useState(false)
  const [pwMin, setPwMin] = useState(8)       // the server's minimum arrives with its first refusal

  // Revokes this account's sessions on OTHER devices. The current one stays signed in: along
  // with the confirmation the server sends a fresh token carrying the new session epoch, and
  // we store it. Otherwise someone clearing the sessions of a stolen phone would throw out
  // the very laptop they're doing it from as well.
  async function logoutAll() {
    if (logoutAllBusy) return
    setLogoutAllBusy(true)
    try {
      const r = await fetch('/api/auth/logout-all', { method: 'POST' })
      const d = await r.json().catch(() => null)
      if (d?.token) setToken(d.token)
    } catch { /* ignore */ }
    window.location.reload()
  }

  function togglePassword() {
    setPwOpen(o => !o)
    setPw({ current: '', next: '', repeat: '' })
    setPwErr(null)
    setPwDone(false)
  }

  // Changing the password. The server also signs out every other device and sends this one a
  // fresh token, which we keep, so the person stays in without a reload. Errors land on the
  // field they are about; the server answers with codes, and the text is in the UI language.
  async function submitPassword(e) {
    e.preventDefault()
    if (pwBusy) return
    if (pw.next !== pw.repeat) { setPwErr({ field: 'repeat', text: t.pwErr.mismatch() }); return }
    setPwBusy(true)
    setPwErr(null)
    try {
      const r = await fetch('/api/auth/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next })
      })
      const d = await r.json().catch(() => null)
      if (r.ok && d?.token) {
        setToken(d.token)
        setPw({ current: '', next: '', repeat: '' })
        setPwOpen(false)
        setPwDone(true)
      } else {
        const code = d?.error
        if (d?.minPasswordLength) setPwMin(d.minPasswordLength)
        const field = code === 'wrong_password' ? 'current'
          : ['weak_password', 'password_too_long', 'same_password'].includes(code) ? 'next' : null
        const say = t.pwErr[code] || t.pwErr.failed
        setPwErr({ field, text: say(code === 'too_many_attempts' ? d?.retryInMinutes : d?.minPasswordLength || pwMin) })
      }
    } catch { setPwErr({ field: null, text: t.resetNoServer }) }
    setPwBusy(false)
  }

  // Resetting YOUR OWN data: disconnect all of your integrations and erase your sync blob.
  // The PIN here was left over from the single-user version, where this button disposed of the
  // only data in the system. Now everyone disposes only of the account's own slot (the
  // disconnect endpoints work by owner id), so a secret guarding your own data is redundant —
  // an explicit confirmation is enough to keep it from being pressed by accident.
  async function submitReset(e) {
    e.preventDefault()
    setResetErr('')
    setResetBusy(true)

    await Promise.all([
      fetch('/api/calendar/disconnect', { method: 'POST' }).catch(() => {}),
      fetch('/api/whoop/disconnect', { method: 'POST' }).catch(() => {}),
      fetch('/api/garmin/disconnect', { method: 'POST' }).catch(() => {}),
      fetch('/api/labs/disconnect', { method: 'POST' }).catch(() => {}),
      fetch('/api/sync/state', { method: 'DELETE' }).catch(() => {})
    ])
    // With the same exclusion list as switching accounts: the sign-in, the device and its
    // settings are not personal data and must not be lost on a reset.
    wipePersonalData()
    window.location.reload()
  }

  const guest = isGuest()
  // The actions below are personal: each person manages their own sessions and their own data.
  // A guest can't use them: the demo has neither an account nor any data of its own.
  const userName = getUsername()

  // Switch account: clear the token and role, reload — AuthGate will show the sign-in screen.
  // Before switching, push anything unsaved TO THE SERVER while we still hold our own token:
  // when another person signs in, this account's local data is wiped (accountData.js), and
  // whatever hadn't made it out yet would be lost.
  async function switchAccount() {
    await pushSync().catch(() => {})
    clearToken()
    window.location.reload()
  }

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(conns)) } catch { /* ignore */ }
  }, [conns])

  // Returning from Google OAuth + the current status of the live services
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
        if (d.url) { window.location.href = d.url; return } // off to the Google sign-in screen
        setNotice(t.noticeStartFail); setBusy(null)
      } catch { setNotice(t.noticeNoServer); setBusy(null) }
      return
    }
    // demo mode (Whoop/Garmin for now)
    setBusy(svc.id)
    setTimeout(() => {
      setConns(c => ({ ...c, [svc.id]: { connected: true, account: `${svcName(svc)}` } }))
      setBusy(null)
    }, 900)
  }

  function startLoginForm(svc) { setOpenForm(svc.id); setForm({ email: '', password: '' }) }

  function startUrlForm(svc) {
    setOpenForm(svc.id)
    // Prefill ONLY this account's own saved link. The field used to default to a hard-coded
    // link to the owner's folder of blood tests: the backend honestly returned url: null to
    // anyone else, and the frontend filled that in with the owner's leftover link — leaving a
    // member one tap on "Connect folder" away from parsing someone else's tests as their own.
    setUrlForm('')
    fetch(svc.endpoints.status).then(r => r.json()).then(d => setUrlForm(d.url || '')).catch(() => setUrlForm(''))
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
      // wipe the data downloaded from the service so it doesn't linger after disconnecting
      try {
        if (svc.id === 'google') localStorage.removeItem('albert-events')
        if (svc.id === 'whoop') localStorage.removeItem('albert-whoop-live')
        if (svc.id === 'garmin') localStorage.removeItem('albert-garmin-live')
        if (svc.id === 'yandex') { localStorage.removeItem('albert-labs'); localStorage.removeItem('albert-labs-synced') }
      } catch { /* ignore */ }
      setConns(c => ({ ...c, [svc.id]: { connected: false, configured: c[svc.id]?.configured } }))
      // reload so the data disappears everywhere (schedule, health, sports, AI)
      setTimeout(() => window.location.reload(), 250)
      return
    }
    setConns(c => { const n = { ...c }; delete n[svc.id]; return n })
    setOpenForm(null)
  }

  return (
    <div className="conn-page">
      <SectionHeader title={t.heading} subtitle={t.sub} />

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
              <div className="conn-top">
                <span className="conn-icon" style={{ background: `${svc.color}22`, color: svc.color }}>
                  {svc.icon}
                </span>
                <div className="conn-status">
                  {!svc.live && <span className="conn-soon">{t.demo}</span>}
                  {connected
                    ? <StatusPill status="ok">{t.connected}</StatusPill>
                    : <StatusPill status="unknown">{t.notConnected}</StatusPill>}
                </div>
              </div>

              <div className="conn-name">{svcName(svc)}</div>
              <div className="conn-desc muted">{svcDesc(svc)}</div>
              {connected && <div className="conn-account">{c.email || c.account || t.connectedFallback}</div>}

              <div className="conn-action">
                {connected ? (
                  <Button variant="subtle" onClick={() => disconnect(svc)}>{t.btnDisconnect}</Button>
                ) : svc.kind === 'oauth' ? (
                  <Button variant="primary" disabled={isBusy} onClick={() => connect(svc)}>
                    {isBusy ? t.btnConnecting : t.btnConnect}
                  </Button>
                ) : (
                  <Button
                    variant={formOpen ? 'subtle' : 'primary'} disabled={isBusy}
                    onClick={() => formOpen ? setOpenForm(null) : (svc.kind === 'url' ? startUrlForm(svc) : startLoginForm(svc))}
                  >
                    {formOpen ? t.btnCollapse : t.btnConnect}
                  </Button>
                )}
              </div>

              {svc.kind === 'url' && formOpen && !connected && (
                <motion.div className="conn-form" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                  <Field
                    label={t.yandexLabel} type="text" placeholder="https://disk.yandex.ru/d/..."
                    value={urlForm} onChange={e => setUrlForm(e.target.value)}
                  />
                  <div className="conn-form-foot">
                    <span className="conn-note muted">{t.yandexNote}</span>
                    <Button variant="primary" disabled={isBusy || !urlForm.trim()} onClick={() => submitUrl(svc)}>
                      {isBusy ? t.btnConnecting : t.btnConnectFolder}
                    </Button>
                  </div>
                </motion.div>
              )}

              {svc.kind === 'login' && formOpen && !connected && (
                <motion.div className="conn-form" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                  <Field
                    label={t.garminEmailLabel} type="email" placeholder={t.garminEmailPh}
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  />
                  <Field
                    label={t.pwLabel} type="password" placeholder={t.pwPh}
                    value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  />
                  <div className="conn-form-foot">
                    <span className="conn-note muted">{t.garminNote}</span>
                    <Button variant="primary" disabled={isBusy || !form.email.trim() || !form.password.trim()} onClick={() => submitLogin(svc)}>
                      {isBusy ? t.btnConnecting : t.btnLoginConnect}
                    </Button>
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
          <span className="conn-icon" style={{ background: 'color-mix(in srgb, var(--accent) 13%, transparent)', color: 'var(--accent)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </span>
          <div className="conn-info">
            <div className="conn-name">
              {guest ? t.guestName : (userName || t.memberBadge)}
              {guest
                ? <span className="conn-soon">{t.demo}</span>
                : <StatusPill status="ok">{t.memberBadge}</StatusPill>}
            </div>
            <div className="conn-desc muted">
              {guest ? t.guestDesc : t.memberDesc}
            </div>
          </div>
          <div className="conn-account-action">
            <Button variant={guest ? 'primary' : 'subtle'} onClick={switchAccount}>
              {guest ? t.btnLoginMain : t.btnSwitch}
            </Button>
          </div>
        </div>
      </motion.div>

      {!guest && (
        <div className="conn-security">
          <div className="conn-security-item">
            <Button variant="ghost" size="sm" className="conn-pw-toggle" onClick={togglePassword} aria-expanded={pwOpen}>
              {t.pwBtn}
            </Button>
            <span className="conn-security-hint muted">{t.pwHint}</span>
            {pwDone && (
              <span className="conn-pw-done" role="status">
                <Icon name="check" size={16} color="var(--status-ok)" />{t.pwDone}
              </span>
            )}
            {pwOpen && (
              <motion.form
                className="conn-pw-form" onSubmit={submitPassword}
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
              >
                {/* Lets a password manager tell which account the new password belongs to */}
                <input type="text" name="username" autoComplete="username" value={userName || ''} readOnly hidden />
                <Field
                  label={t.pwCurrent} type="password" name="current-password" autoComplete="current-password" autoFocus
                  value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))}
                  error={pwErr?.field === 'current' ? pwErr.text : null}
                />
                <Field
                  label={t.pwNew} type="password" name="new-password" autoComplete="new-password"
                  value={pw.next} onChange={e => setPw(p => ({ ...p, next: e.target.value }))}
                  hint={t.pwNewHint(pwMin)} error={pwErr?.field === 'next' ? pwErr.text : null}
                />
                <Field
                  label={t.pwRepeat} type="password" name="repeat-password" autoComplete="new-password"
                  value={pw.repeat} onChange={e => setPw(p => ({ ...p, repeat: e.target.value }))}
                  error={pwErr?.field === 'repeat' ? pwErr.text : null}
                />
                {pwErr && !pwErr.field && <span className="conn-pw-err" role="alert">{pwErr.text}</span>}
                <div className="conn-pw-actions">
                  <Button type="submit" variant="primary" size="sm" disabled={pwBusy || !pw.current || !pw.next || !pw.repeat}>
                    {pwBusy ? t.pwSaving : t.pwSave}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={togglePassword}>{t.resetCancel}</Button>
                </div>
              </motion.form>
            )}
          </div>
          <div className="conn-security-item">
            <Button variant="ghost" size="sm" onClick={logoutAll} disabled={logoutAllBusy}>
              {logoutAllBusy ? t.logoutAllBusy : t.logoutAllBtn}
            </Button>
            <span className="conn-security-hint muted">{t.logoutAllHint}</span>
          </div>
        </div>
      )}

      {!guest && <div className="conn-reset">
        {!resetOpen ? (
          <Button variant="ghost" size="sm" onClick={() => { setResetOpen(true); setResetErr('') }}>
            {t.resetBtn}
          </Button>
        ) : (
          <form className="conn-reset-form" onSubmit={submitReset}>
            <span className="conn-reset-warn">{t.resetConfirm}</span>
            <Button type="submit" variant="danger" size="sm" disabled={resetBusy}>
              {resetBusy ? t.resetBusy : t.resetGo}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setResetOpen(false); setResetErr('') }}>
              {t.resetCancel}
            </Button>
            {resetErr && <span className="conn-reset-err">{resetErr}</span>}
          </form>
        )}
      </div>}

      <style>{`
        .conn-page { display: flex; flex-direction: column; gap: 18px; max-width: 760px; margin-inline: auto; width: 100%; padding-bottom: 24px; }
        .conn-intro { font-size: 15px; line-height: 1.6; max-width: 620px; margin: -4px 0 2px; }
        .conn-notice {
          background: color-mix(in srgb, var(--accent) 12%, transparent); border: 1px solid var(--accent);
          color: var(--foreground); border-radius: 12px; padding: 12px 16px; font-size: 14px;
        }
        .conn-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
        .conn-card { display: flex; flex-direction: column; gap: 10px; padding: 18px 20px; transition: border-color 0.2s, box-shadow 0.2s; }
        .conn-card.on { border-color: color-mix(in srgb, var(--status-ok) 40%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--status-ok) 15%, transparent); }
        .conn-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .conn-status { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .conn-icon { width: 48px; height: 48px; border-radius: 14px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .conn-name { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 700; color: var(--foreground); }
        .conn-soon { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--status-warn); background: color-mix(in srgb, var(--status-warn) 14%, transparent); padding: 2px 7px; border-radius: 20px; }
        .conn-desc { font-size: 13.5px; line-height: 1.5; }
        .conn-account { font-size: 13px; color: var(--text-secondary); font-weight: 500; }
        .conn-action { margin-top: auto; padding-top: 6px; }
        .conn-action .ds-btn { width: 100%; }
        .conn-form { padding-top: 14px; border-top: 1px solid var(--border-soft); display: flex; flex-direction: column; gap: 12px; overflow: hidden; }
        .conn-form-foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
        .conn-note { font-size: 12.5px; line-height: 1.4; flex: 1; min-width: 200px; }
        .conn-foot { font-size: 13px; margin-top: 4px; }
        .conn-account-card { padding: 18px 20px; }
        .conn-row { display: flex; align-items: center; gap: 16px; }
        .conn-info { flex: 1; min-width: 0; }
        .conn-account-action { flex-shrink: 0; }
        .conn-security { margin-top: 8px; padding-top: 18px; border-top: 1px solid var(--border-soft); display: flex; flex-direction: column; gap: 20px; }
        .conn-security-item { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
        .conn-security-hint { font-size: 12.5px; line-height: 1.5; max-width: 480px; color: var(--text-muted); }
        /* A ghost button's label sits flush with the hint under it; the padding shows on hover */
        .conn-security-item > .ds-btn--ghost, .conn-reset > .ds-btn--ghost { margin-left: -14px; }
        .conn-pw-done { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--text-body); }
        .conn-pw-form { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 400px; margin-top: 8px; }
        .conn-pw-err { font-size: 13px; color: var(--status-crit); }
        .conn-pw-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 2px; }
        .conn-reset { margin-top: 8px; padding-top: 18px; border-top: 1px solid var(--border-soft); }
        .conn-reset-form { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .conn-reset-err { font-size: 13px; color: var(--status-crit); }
        .conn-reset-warn { font-size: 13.5px; line-height: 1.45; color: var(--text-body); }
        @media (max-width: 640px) {
          .conn-list { grid-template-columns: 1fr; }
          .conn-row { flex-wrap: wrap; }
          .conn-account-action { width: 100%; }
          .conn-account-action .ds-btn { width: 100%; }
          .conn-page .ds-btn { min-height: 44px; }
        }
      `}</style>
    </div>
  )
}
