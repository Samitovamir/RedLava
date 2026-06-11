import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, CalendarDays } from 'lucide-react'
import AddEventModal from '../AddEventModal.jsx'
import { Button } from '../../ui'
import { useEvents, dateKey } from '../../context/EventsContext.jsx'
import { eventTypeColor } from '../../utils/events.js'
import { mskNow } from '../../utils/time.js'
import { useT, useLang } from '../../context/LanguageContext.jsx'

/*
  Колонка «Сегодня» на «Одном экране»: живой список событий дня с отметкой
  «сейчас», добавлением события на месте и переходом в полный календарь.
  Самая частая утренняя задача («что сегодня?») — ноль кликов.
*/

const toMin = (s) => { const [h, m] = (s || '0:0').split(':').map(Number); return h * 60 + m }
const isAllDay = (e) => toMin(e.start) === 0 && toMin(e.end) >= 23 * 60 + 59

export default function CkToday() {
  const navigate = useNavigate()
  const { lang } = useLang()
  const { events, upsertEvent, setFocusSignal } = useEvents()
  const [adding, setAdding] = useState(false)
  const listRef = useRef(null)
  const t = useT({
    ru: {
      title: 'Сегодня', empty: 'Событий нет — день свободен', add: 'Событие',
      calendar: 'Календарь', allDay: 'весь день', now: 'сейчас',
      count: (n) => `${n} соб.`,
    },
    en: {
      title: 'Today', empty: 'No events — the day is free', add: 'Event',
      calendar: 'Calendar', allDay: 'all day', now: 'now',
      count: (n) => `${n} ev.`,
    },
  })

  const todayKey = dateKey(mskNow())
  const now = mskNow()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const pick = (o, f) => (lang === 'en' && o[f + 'En']) ? o[f + 'En'] : o[f]

  const todays = events
    .filter(e => e.date === todayKey)
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
  const allDay = todays.filter(isAllDay)
  const timed = todays.filter(e => !isAllDay(e))

  // Автопрокрутка списка к текущему моменту
  useEffect(() => {
    const el = listRef.current?.querySelector('.ckt-item.now') || listRef.current?.querySelector('.ckt-item:not(.past)')
    el?.scrollIntoView({ block: 'nearest' })
  }, [])

  const goTo = (ev) => {
    setFocusSignal({ date: ev.date, time: ev.start, n: Date.now() })
    navigate('/schedule')
  }

  return (
    <div className="card ck-today">
      <div className="ckt-head">
        <span className="ckt-title">{t.title}</span>
        <span className="ckt-count">{timed.length + allDay.length ? t.count(timed.length + allDay.length) : ''}</span>
      </div>

      {allDay.length > 0 && (
        <div className="ckt-allday">
          {allDay.map((ev, i) => (
            <button key={`ad-${i}`} className="ckt-ad-chip" onClick={() => goTo(ev)}>
              <i style={{ background: eventTypeColor(ev.type) }} />
              <span className="ckt-ad-title">{pick(ev, 'title')}</span>
              <span className="ckt-ad-meta">{t.allDay}</span>
            </button>
          ))}
        </div>
      )}

      <div className="ckt-list" ref={listRef}>
        {timed.length === 0 && allDay.length === 0 && <div className="ckt-empty">{t.empty}</div>}
        {timed.map((ev, i) => {
          const past = toMin(ev.end || ev.start) < nowMin
          const current = !past && toMin(ev.start) <= nowMin
          return (
            <button
              key={ev.id || i}
              className={`ckt-item ${past ? 'past' : ''} ${current ? 'now' : ''}`}
              onClick={() => goTo(ev)}
              title={pick(ev, 'title')}
            >
              <span className="ckt-time">{ev.start}</span>
              <i className="ckt-dot" style={{ background: eventTypeColor(ev.type) }} />
              <span className="ckt-name">{pick(ev, 'title')}</span>
              {current && <span className="ckt-now">{t.now}</span>}
            </button>
          )
        })}
      </div>

      <div className="ckt-foot">
        <Button variant="primary" size="sm" iconLeft={Plus} onClick={() => setAdding(true)}>{t.add}</Button>
        <Button variant="ghost" size="sm" iconLeft={CalendarDays} onClick={() => navigate('/schedule')}>{t.calendar}</Button>
      </div>

      {adding && (
        <AddEventModal
          onAdd={(ev) => { upsertEvent(ev); setAdding(false) }}
          onClose={() => setAdding(false)}
          defaultDate={todayKey}
        />
      )}

      <style>{`
        .ck-today { display: flex; flex-direction: column; gap: 10px; padding: 16px 16px 14px; min-height: 0; }
        .ckt-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-shrink: 0; }
        .ckt-title { font-size: 11.5px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; }
        .ckt-count { font-size: 12px; color: var(--text-faint); font-variant-numeric: tabular-nums; }
        .ckt-allday { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
        .ckt-ad-chip {
          display: flex; align-items: center; gap: 8px; min-width: 0;
          background: var(--bg-tile); border: 1px solid var(--border);
          border-radius: 9px; padding: 6px 10px; cursor: pointer; font-family: inherit;
          transition: border-color var(--dur-fast) var(--ease);
        }
        .ckt-ad-chip:hover { border-color: var(--accent); }
        .ckt-ad-chip i { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .ckt-ad-title { font-size: 12.5px; font-weight: 600; color: var(--text-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ckt-ad-meta { font-size: 11px; color: var(--text-faint); margin-left: auto; flex-shrink: 0; }
        .ckt-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
        .ckt-empty { font-size: 13px; color: var(--text-muted); padding: 6px 2px; }
        .ckt-item {
          display: flex; align-items: center; gap: 9px; min-width: 0; flex-shrink: 0;
          padding: 8px 9px; border: 1px solid transparent; border-radius: 10px;
          background: none; cursor: pointer; font-family: inherit; text-align: left;
          transition: background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
        }
        .ckt-item:hover { background: var(--bg-tile); }
        .ckt-item.past { opacity: 0.5; }
        .ckt-item.now { background: var(--bg-tile); border-color: var(--accent-today); }
        .ckt-time { font-size: 12.5px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; flex-shrink: 0; width: 40px; }
        .ckt-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .ckt-name { flex: 1; min-width: 0; font-size: 13px; color: var(--text-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ckt-now { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent-today); flex-shrink: 0; }
        .ckt-foot { display: flex; gap: 8px; flex-shrink: 0; }
      `}</style>
    </div>
  )
}
