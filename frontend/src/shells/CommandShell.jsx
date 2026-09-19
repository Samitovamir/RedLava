import { useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Home from '../pages/Home.jsx'
import Schedule from '../pages/Schedule.jsx'
import Health from '../pages/Health.jsx'
import Nutrition from '../pages/Nutrition.jsx'
import MailPage from '../pages/Mail.jsx'
import History from '../pages/History.jsx'
import Settings from '../pages/Settings.jsx'
import StatusStrip from '../components/StatusStrip.jsx'
import TodayTimelineStrip from '../components/TodayTimelineStrip.jsx'
import RecentActions from '../components/RecentActions.jsx'
import AIWorkZone from '../components/AIWorkZone.jsx'
import { useT, useLang } from '../context/LanguageContext.jsx'
import { mskNow } from '../utils/time.js'
import { MAIL_ENABLED, HISTORY_ENABLED } from '../config/features.js'

/*
  The "Command center" shell — a workbench: NOTHING "transitions".
  The status strip and the tabs on top; a permanent "Today" pane on the left,
  a permanent "Assistant" on the right; the center switches tabs instantly
  (no page animations — like panes in a terminal).
*/

const TABS = [
  { path: '/', ru: 'Обзор', en: 'Overview' },
  { path: '/schedule', ru: 'Расписание', en: 'Schedule' },
  { path: '/sport', ru: 'Спорт', en: 'Sport' },
  { path: '/health', ru: 'Здоровье', en: 'Health' },
  { path: '/nutrition', ru: 'Питание', en: 'Nutrition' },
  ...(MAIL_ENABLED ? [{ path: '/mail', ru: 'Письма', en: 'Mail' }] : []),
  ...(HISTORY_ENABLED ? [{ path: '/history', ru: 'История', en: 'History' }] : []),
  { path: '/settings', ru: 'Настройки', en: 'Settings' },
]

const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

export default function CommandShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { lang } = useLang()
  const t = useT({
    ru: { today: 'Сегодня', assistant: 'Помощник' },
    en: { today: 'Today', assistant: 'Assistant' },
  })
  const d = mskNow()
  const dateStr = lang === 'en' ? `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}` : `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`
  const isActive = (p) => (p === '/' ? location.pathname === '/' : location.pathname.startsWith(p))

  // A wheel bridge: the side panes barely scroll, so the cursor over them went "dead".
  // Scrolling over "Today"/"Assistant" moves the center pane — the site can be scrolled from
  // anywhere on the screen. BUT if something under the cursor has a live scroll of its own
  // (the AI chat, the log, the pane itself), the bridge stays quiet ALWAYS, even when that one
  // has hit its end: scroll the chat to the bottom and the site doesn't jump (like overscroll-contain).
  const bodyRef = useRef(null)
  const centerRef = useRef(null)
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const scrollable = (el) => {
      if (el.scrollHeight <= el.clientHeight + 1) return false
      const oy = getComputedStyle(el).overflowY
      return oy === 'auto' || oy === 'scroll'
    }
    const onWheel = (e) => {
      const center = centerRef.current
      if (!center) return
      const pane = e.target.closest?.('.cmd-left, .cmd-right')
      if (!pane) return
      // Is there a scrollable element between the cursor and the pane? Then it owns this zone.
      let n = e.target
      while (n && n.nodeType === 1) {
        if (scrollable(n)) return
        if (n === pane) break
        n = n.parentElement
      }
      center.scrollTop += e.deltaY
    }
    body.addEventListener('wheel', onWheel, { passive: true })
    return () => body.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div className="command-shell">
      <StatusStrip />

      <nav className="cmd-tabs" role="navigation">
        {TABS.map((tb) => (
          <button
            key={tb.path}
            className={`cmd-tab ${isActive(tb.path) ? 'active' : ''}`}
            onClick={() => navigate(tb.path)}
          >
            {lang === 'en' ? tb.en : tb.ru}
          </button>
        ))}
      </nav>

      <div className="cmd-body" ref={bodyRef}>
        <aside className="cmd-pane cmd-left">
          <div className="cmd-pane-label">{t.today} · {dateStr}</div>
          <TodayTimelineStrip />
          <RecentActions limit={6} />
        </aside>

        <main className="cmd-pane cmd-center" ref={centerRef}>
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/sport" element={<Health view="activity" />} />
            <Route path="/health" element={<Health view="metrics" />} />
            <Route path="/nutrition" element={<Nutrition />} />
            <Route path="/mail" element={MAIL_ENABLED ? <MailPage /> : <Navigate to="/" replace />} />
            <Route path="/history" element={HISTORY_ENABLED ? <History /> : <Navigate to="/" replace />} />
            <Route path="/connections" element={<Navigate to="/settings" replace />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <aside className="cmd-pane cmd-right">
          <div className="cmd-pane-label">{t.assistant}</div>
          <AIWorkZone />
        </aside>
      </div>

      <style>{`
        .command-shell { flex: 1; min-width: 0; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
        .command-shell .status-strip { left: 0; }

        .cmd-tabs {
          display: flex; gap: 4px; flex-shrink: 0;
          margin-top: var(--status-strip-h, 42px);
          padding: 8px 16px;
          border-bottom: 1px solid var(--border);
          background: var(--bg-app);
          overflow-x: auto; scrollbar-width: none;
        }
        .cmd-tabs::-webkit-scrollbar { display: none; }
        .cmd-tab {
          padding: 7px 14px; border: 1px solid transparent; border-radius: 9px;
          background: none; font-family: inherit; font-size: 13px; font-weight: 600;
          color: var(--text-muted); cursor: pointer; white-space: nowrap; flex-shrink: 0;
          transition: color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
        }
        .cmd-tab:hover { color: var(--text-body); background: var(--bg-tile); }
        .cmd-tab.active {
          color: var(--text-primary);
          background: var(--bg-tile);
          border-color: var(--border-med);
          box-shadow: inset 0 -2px 0 var(--accent);
        }

        .cmd-body {
          flex: 1; min-height: 0;
          display: grid;
          grid-template-columns: 256px minmax(0, 1fr) 340px;
          gap: 0;
        }
        .cmd-pane { overflow-y: auto; min-height: 0; padding: 16px; }
        /* Centre content never spills out of the panel: charts and tables shrink */
        .cmd-center { overflow-x: hidden; }
        .cmd-center svg, .cmd-center canvas, .cmd-center img { max-width: 100%; }
        .cmd-center > * { max-width: 100%; }
        .cmd-left { border-right: 1px solid var(--border); display: flex; flex-direction: column; gap: 14px; }
        .cmd-right { border-left: 1px solid var(--border); display: flex; flex-direction: column; gap: 14px; }
        .cmd-center { padding: 20px 24px 64px; }
        .cmd-pane-label {
          font-size: 12px; font-weight: 700; color: var(--text-secondary);
          text-transform: uppercase; letter-spacing: 0.07em;
        }

        /* Schedule in the centre: one column — the timeline across the full panel width,
           the day summary whole beneath it (beside it there was no room and it slid under the assistant).
           An onWheel bridge lets the centre scroll while the cursor is over the side panels. */
        .cmd-center .schedule-layout {
          grid-template-columns: 1fr;
          height: auto; min-height: 0;
        }
        .cmd-center .schedule-col:first-child { height: calc(100vh - 280px); min-height: 480px; }
        .cmd-center .schedule-col:last-child { height: auto; }

        /* The assistant in a narrow panel: the header wraps, tabs get their own row,
           the input stays inside the card */
        .cmd-right .ai-work-zone { min-width: 0; overflow: hidden; }
        .cmd-right .awz-head { flex-wrap: wrap; gap: 10px; }
        .cmd-right .awz-switch { width: 100%; display: flex; }
        .cmd-right .awz-switch .awz-tab { flex: 1; }
        .cmd-right textarea, .cmd-right .vi-field {
          width: 100%; min-width: 0; max-width: 100%;
          box-sizing: border-box; resize: none;
        }
        /* In the narrow panel the placeholder "The recognised text will appear here…"
           wraps onto 4 lines — the field is taller and the type smaller so it fits whole */
        .cmd-right .vi-field { min-height: 136px; font-size: 15px; }

        /* Cascade only on the centre's first entrance */
        @media (prefers-reduced-motion: no-preference) {
          .cmd-center > * > * { animation: block-rise 0.32s var(--ease) backwards; }
          .cmd-center > * > :nth-child(2) { animation-delay: 0.04s; }
          .cmd-center > * > :nth-child(3) { animation-delay: 0.08s; }
          .cmd-center > * > :nth-child(n+4) { animation-delay: 0.12s; }
        }

        @media (max-width: 1100px) {
          .command-shell { height: auto; overflow: visible; }
          .cmd-body { grid-template-columns: 1fr; }
          .cmd-pane { overflow-y: visible; }
          .cmd-left { border-right: none; border-bottom: 1px solid var(--border); }
          .cmd-right { border-left: none; border-top: 1px solid var(--border); }
        }
        @media (max-width: 640px) {
          /* fade on the right edge — a hint that the tab row scrolls sideways */
          .cmd-tabs { margin-top: 0; -webkit-mask-image: linear-gradient(90deg, #000 86%, transparent); mask-image: linear-gradient(90deg, #000 86%, transparent); scroll-snap-type: x proximity; }
          .cmd-tab { min-height: 40px; scroll-snap-align: start; }
        }
      `}</style>
    </div>
  )
}
