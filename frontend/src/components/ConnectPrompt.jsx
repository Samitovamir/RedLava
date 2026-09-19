import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plug } from 'lucide-react'
import { Button, Icon } from '../ui'
import { isGuest } from '../api/authFetch.js'
import { useT } from '../context/LanguageContext.jsx'

/*
  A hint for newcomers on Home: while NOT A SINGLE integration is connected the dashboard has
  nothing to show — and there was no way to reach the connections from Home (the Sport, Health
  and Nutrition blocks were deliberately taken off Home, and the connections live in Settings).

  It appears only when the set of integrations is completely empty and disappears on its own
  the moment anything is connected. For an owner who has everything connected, Home is unchanged.
*/

const SNOOZE_KEY = 'albert-connect-prompt-off'
const SNOOZE_DAYS = 7

const STATUS_URLS = [
  '/api/garmin/status',
  '/api/whoop/status',
  '/api/calendar/status',
  '/api/labs/status',
]

const snoozed = () => {
  try {
    const until = +localStorage.getItem(SNOOZE_KEY) || 0
    return until > Date.now()
  } catch { return false }
}

export default function ConnectPrompt() {
  const navigate = useNavigate()
  // 'checking' — render nothing: flashing the hint at someone who is already connected is
  // worse than showing it half a second later.
  const [state, setState] = useState('checking')
  const t = useT({
    ru: {
      title: 'Подключите свои устройства',
      text: 'Пока не подключено ничего, и показывать нечего. Garmin, WHOOP, Google Календарь и папка с анализами подключаются за пару минут — дальше дашборд считает всё сам.',
      connect: 'Подключить',
      later: 'Позже',
    },
    en: {
      title: 'Connect your devices',
      text: 'Nothing is connected yet, so there is nothing to show. Garmin, WHOOP, Google Calendar and your lab folder take a couple of minutes to set up — after that the dashboard does the rest.',
      connect: 'Connect',
      later: 'Later',
    },
  })

  useEffect(() => {
    // A guest has nothing to connect: they are looking at demo data, and the backend does not let them connect.
    if (isGuest() || snoozed()) { setState('hide'); return }
    let alive = true
    Promise.all(STATUS_URLS.map(u =>
      fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null)
    )).then(list => {
      if (!alive) return
      // The server did not answer (the local backend is not running, the network dropped) —
      // stay quiet, otherwise the hint pops up for someone who has everything connected.
      if (list.every(d => d === null)) { setState('hide'); return }
      setState(list.some(d => d?.connected) ? 'hide' : 'show')
    })
    return () => { alive = false }
  }, [])

  function later() {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400000)) } catch { /* ignore */ }
    setState('hide')
  }

  if (state !== 'show') return null

  return (
    <div className="card connect-prompt">
      <div className="cp-icon"><Icon icon={Plug} size={20} /></div>
      <div className="cp-body">
        <div className="cp-title">{t.title}</div>
        <p className="cp-text">{t.text}</p>
      </div>
      <div className="cp-actions">
        <Button variant="primary" onClick={() => navigate('/settings')}>{t.connect}</Button>
        <button className="cp-later" onClick={later}>{t.later}</button>
      </div>

      <style>{`
        .connect-prompt {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 16px;
        }
        .cp-icon {
          display: flex; align-items: center; justify-content: center;
          width: 40px; height: 40px; border-radius: 12px;
          background: var(--bg-tile); border: 1px solid var(--border-soft);
          color: var(--accent); flex: none;
        }
        .cp-title { font-size: 15.5px; font-weight: 700; color: var(--text-primary); }
        .cp-text { font-size: 13.5px; line-height: 1.5; color: var(--text-secondary); margin: 4px 0 0; }
        .cp-actions { display: flex; align-items: center; gap: 10px; flex: none; }
        .cp-later {
          background: none; border: none; padding: 8px 4px;
          font-family: inherit; font-size: 13.5px; color: var(--text-muted);
          cursor: pointer; transition: color .15s;
        }
        .cp-later:hover { color: var(--text-body); }

        @media (max-width: 640px) {
          /* the text wraps onto several lines — keep the icon level with the title, not centred */
          .connect-prompt { grid-template-columns: auto 1fr; row-gap: 14px; align-items: start; }
          .cp-actions { grid-column: 1 / -1; }
          .cp-actions .ds-btn { flex: 1; justify-content: center; }
        }
      `}</style>
    </div>
  )
}
