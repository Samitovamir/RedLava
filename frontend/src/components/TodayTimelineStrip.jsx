import { useNavigate } from 'react-router-dom'
import { useEvents, dateKey } from '../context/EventsContext.jsx'
import { useT, useLang } from '../context/LanguageContext.jsx'
import { mskNow } from '../utils/time.js'

/*
  Лента дня — горизонтальная полоса сегодняшних событий (раскладка «Кокпит»).
  Компактный взгляд «что впереди», не заменяет полный таймлайн на /schedule:
  клик по событию ведёт туда и фокусирует календарь на нём.
*/
export default function TodayTimelineStrip() {
  const navigate = useNavigate()
  const { lang } = useLang()
  const { events, setFocusSignal } = useEvents()
  const t = useT({
    ru: { title: 'Лента дня', empty: 'Сегодня событий нет', now: 'сейчас', all: 'весь день →' },
    en: { title: 'Day strip', empty: 'No events today', now: 'now', all: 'full day →' },
  })

  const todayKey = dateKey(mskNow())
  const now = mskNow()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const toMin = (s) => { const [h, m] = (s || '0:0').split(':').map(Number); return h * 60 + m }
  const pick = (o, f) => (lang === 'en' && o[f + 'En']) ? o[f + 'En'] : o[f]

  const todays = events
    .filter(e => e.date === todayKey)
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''))

  const goTo = (ev) => {
    setFocusSignal({ date: ev.date, time: ev.start, n: Date.now() })
    navigate('/schedule')
  }

  return (
    <div className="card tl-strip">
      <div className="tl-head">
        <span className="tl-title">{t.title}</span>
        <button className="tl-all" onClick={() => navigate('/schedule')}>{t.all}</button>
      </div>
      {todays.length === 0 ? (
        <div className="tl-empty">{t.empty}</div>
      ) : (
        <div className="tl-row">
          {todays.map((ev, i) => {
            const past = toMin(ev.end || ev.start) < nowMin
            const current = !past && toMin(ev.start) <= nowMin
            return (
              <button
                key={ev.id || i}
                className={`tl-item ${past ? 'past' : ''} ${current ? 'now' : ''}`}
                onClick={() => goTo(ev)}
                title={pick(ev, 'title')}
              >
                <span className="tl-time">{ev.start}</span>
                <span className="tl-name">{pick(ev, 'title')}</span>
                {current && <span className="tl-now-dot" aria-label={t.now} />}
              </button>
            )
          })}
        </div>
      )}

      <style>{`
        .tl-strip { display: flex; flex-direction: column; gap: 10px; padding: 14px 18px; }
        .tl-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
        .tl-title { font-size: 13px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; }
        .tl-all {
          background: none; border: none; padding: 0; cursor: pointer;
          font-family: inherit; font-size: 12.5px; color: var(--muted);
          transition: color var(--dur-fast) var(--ease);
        }
        .tl-all:hover { color: var(--accent); }
        .tl-empty { font-size: 13.5px; color: var(--text-muted); padding: 2px 0 4px; }
        .tl-row {
          display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px;
          scrollbar-width: thin;
        }
        .tl-item {
          position: relative;
          display: inline-flex; align-items: center; gap: 8px;
          flex: 0 0 auto; max-width: 240px;
          padding: 9px 14px;
          background: var(--bg-tile); border: 1px solid var(--border-med);
          border-radius: 999px;
          font-family: inherit; cursor: pointer;
          transition: border-color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
        }
        .tl-item:hover { border-color: var(--accent); transform: translateY(-1px); }
        .tl-item.past { opacity: 0.55; }
        .tl-item.now { border-color: var(--accent-today); box-shadow: 0 0 0 1px var(--accent-today) inset; }
        .tl-time { font-size: 12.5px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
        .tl-name { font-size: 13px; color: var(--text-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tl-now-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-today); flex-shrink: 0; }
      `}</style>
    </div>
  )
}
