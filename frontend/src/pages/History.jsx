import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useHistory } from '../context/HistoryContext.jsx'
import AssistantMemory from '../components/AssistantMemory.jsx'
import {
  ACTION_TYPES, STATUS_INFO, ACTOR_INFO, dayLabel, timeOf, dateOf
} from '../utils/history.js'

// Иконка по типу действия
function ActionIcon({ name }) {
  const p = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (name) {
    case 'mail':     return <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>
    case 'calendar': return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
    case 'search':   return <svg {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    case 'check':    return <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>
    case 'bell':     return <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
    case 'activity': return <svg {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
    default:         return null
  }
}

export default function History() {
  const { entries } = useHistory()
  const [filter, setFilter] = useState('all')
  const [actorFilter, setActorFilter] = useState('all')

  const filtered = useMemo(
    () => entries
      .filter(a => filter === 'all' || a.type === filter)
      .filter(a => actorFilter === 'all' || a.actor === actorFilter)
      .sort((a, b) => b.datetime.localeCompare(a.datetime)),
    [entries, filter, actorFilter]
  )

  // Группировка по дате
  const groups = useMemo(() => {
    const map = new Map()
    filtered.forEach(a => {
      const d = dateOf(a.datetime)
      if (!map.has(d)) map.set(d, [])
      map.get(d).push(a)
    })
    return [...map.entries()]
  }, [filtered])

  // Статистика
  const stats = [
    { key: 'all', label: 'Всего действий', count: entries.length, color: 'var(--primary)' },
    { key: 'email', label: 'Письма', count: entries.filter(a => a.type === 'email').length, color: ACTION_TYPES.email.color },
    { key: 'event', label: 'События', count: entries.filter(a => a.type === 'event').length, color: ACTION_TYPES.event.color },
    { key: 'search', label: 'Поиски', count: entries.filter(a => a.type === 'search').length, color: ACTION_TYPES.search.color }
  ]

  const filterChips = [{ key: 'all', label: 'Все' }, ...Object.entries(ACTION_TYPES).map(([k, v]) => ({ key: k, label: v.label }))]

  return (
    <div className="history-page">
      <div className="page-header">
        <h2>История</h2>
        <span className="muted">Журнал действий ИИ-помощника</span>
      </div>

      {/* Долгая память помощника */}
      <AssistantMemory />

      {/* Статистика */}
      <div className="hist-stats">
        {stats.map(s => (
          <div key={s.key} className="card hist-stat">
            <span className="hist-stat-val" style={{ color: s.color }}>{s.count}</span>
            <span className="hist-stat-lbl">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Фильтры */}
      <div className="hist-filter-row">
        <div className="hist-filters">
          {filterChips.map(c => (
            <button key={c.key}
              className={`hist-chip ${filter === c.key ? 'active' : ''}`}
              onClick={() => setFilter(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="hist-actor-toggle">
          {[{ key: 'all', label: 'Все' }, { key: 'ai', label: 'ИИ' }, { key: 'user', label: 'Сам' }].map(a => (
            <button key={a.key}
              className={`hist-actor-btn ${actorFilter === a.key ? 'active' : ''}`}
              onClick={() => setActorFilter(a.key)}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Таймлайн */}
      <div className="card hist-timeline">
        {groups.length === 0 && (
          <div className="hist-empty muted">Здесь пока пусто — по этому фильтру действий нет.</div>
        )}
        {groups.map(([date, items]) => (
          <div key={date} className="hist-group">
            <div className="hist-day">{dayLabel(date)}</div>
            <div className="hist-items">
              {items.map((a, i) => {
                const t = ACTION_TYPES[a.type]
                const st = STATUS_INFO[a.status]
                return (
                  <motion.div key={a.id} className="hist-item"
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.03 * i }}>
                    <div className="hist-rail">
                      <span className="hist-dot" style={{ background: t.color }}>
                        <ActionIcon name={t.icon} />
                      </span>
                    </div>
                    <div className="hist-body">
                      <div className="hist-item-head">
                        <span className="hist-title">{a.title}</span>
                        <span className="hist-time muted">{timeOf(a.datetime)}</span>
                      </div>
                      <p className="hist-detail muted">{a.detail}</p>
                      <div className="hist-tags">
                        <span className={`hist-actor ${a.actor}`}>{ACTOR_INFO[a.actor]?.label}</span>
                        <span className="hist-type" style={{ color: t.color, borderColor: t.color }}>{t.label}</span>
                        <span className="hist-status" style={{ color: st.color }}>● {st.label}</span>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .history-page { display: flex; flex-direction: column; gap: 24px; max-width: 1000px; padding-bottom: 20px; }
        .page-header { display: flex; align-items: baseline; gap: 12px; }
        .page-header h2 { font-size: 24px; font-weight: 700; }
        .muted { color: var(--muted-foreground); }

        .hist-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
        .hist-stat { display: flex; flex-direction: column; gap: 4px; padding: 18px; }
        .hist-stat-val { font-size: 30px; font-weight: 800; line-height: 1; }
        .hist-stat-lbl { font-size: 13px; color: var(--muted-foreground); }

        .hist-filter-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .hist-filters { display: flex; flex-wrap: wrap; gap: 8px; }
        .hist-actor-toggle { display: flex; gap: 3px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 20px; padding: 3px; }
        .hist-actor-btn {
          font-size: 12px; padding: 5px 12px; border-radius: 16px; border: none;
          background: transparent; color: var(--muted-foreground); cursor: pointer; font-family: inherit; transition: all 0.15s;
        }
        .hist-actor-btn.active { background: var(--primary); color: var(--primary-foreground); }
        .hist-actor { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 20px; }
        .hist-actor.ai { background: rgba(129,140,248,0.16); color: var(--primary); }
        .hist-actor.user { background: var(--bg-secondary); color: var(--muted-foreground); }
        .hist-chip {
          font-size: 13px; padding: 7px 14px; border-radius: 20px;
          border: 1px solid var(--border); background: transparent;
          color: var(--muted-foreground); cursor: pointer; font-family: inherit; transition: all 0.15s;
        }
        .hist-chip:hover { color: var(--foreground); border-color: var(--border-hover); }
        .hist-chip.active { background: var(--primary); color: var(--primary-foreground); border-color: var(--primary); }

        .hist-timeline { display: flex; flex-direction: column; gap: 24px; }
        .hist-empty { text-align: center; padding: 40px 0; font-size: 14px; }
        .hist-group { display: flex; flex-direction: column; gap: 14px; }
        .hist-day {
          font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--muted-foreground);
        }
        .hist-items { display: flex; flex-direction: column; }
        .hist-item { display: flex; gap: 14px; }
        .hist-rail { display: flex; flex-direction: column; align-items: center; }
        .hist-dot {
          width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          color: #fff;
        }
        .hist-item:not(:last-child) .hist-rail::after {
          content: ''; flex: 1; width: 2px; background: var(--border); margin: 4px 0;
        }
        .hist-body { flex: 1; padding-bottom: 20px; display: flex; flex-direction: column; gap: 5px; }
        .hist-item-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
        .hist-title { font-size: 15px; font-weight: 600; color: var(--foreground); }
        .hist-time { font-size: 12px; flex-shrink: 0; }
        .hist-detail { font-size: 13.5px; line-height: 1.5; }
        .hist-tags { display: flex; align-items: center; gap: 12px; margin-top: 3px; }
        .hist-type { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 20px; border: 1px solid; }
        .hist-status { font-size: 12px; font-weight: 500; }

        @media (max-width: 700px) {
          .hist-stats { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  )
}
