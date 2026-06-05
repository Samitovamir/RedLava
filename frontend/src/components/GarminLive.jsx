import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

/*
  Реальные данные Garmin (шаги, пульс покоя, последние тренировки).
  Берёт из localStorage 'albert-garmin-live' и обновляет с сервера.
*/
function readLive() {
  try { const s = localStorage.getItem('albert-garmin-live'); return s ? JSON.parse(s) : null } catch { return null }
}

function fmtDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  return `${Number(day)} ${months[Number(m) - 1]}`
}

export default function GarminLive() {
  const [g, setG] = useState(readLive)

  useEffect(() => {
    fetch('/api/garmin/data').then(r => r.json()).then(d => {
      if (d.connected && d.garmin) {
        setG(d.garmin)
        try { localStorage.setItem('albert-garmin-live', JSON.stringify(d.garmin)) } catch { /* ignore */ }
      }
    }).catch(() => {})
  }, [])

  const last = g?.lastWorkout
  const workouts = g?.workouts || []

  const cards = [
    { label: 'Шаги сегодня', value: g?.steps != null ? g.steps.toLocaleString('ru-RU') : '—', color: 'var(--orange)' },
    { label: 'Пульс покоя', value: g?.restingHr != null ? `${g.restingHr}` : '—', sub: 'уд/мин', color: 'var(--green)' },
    { label: 'Последняя тренировка', value: last ? last.label : '—', sub: last ? `${last.distanceKm ? last.distanceKm + ' км · ' : ''}${last.durationMin ? last.durationMin + ' мин' : ''}` : 'нет данных', color: 'var(--accent)' }
  ]

  return (
    <div className="gl-page">
      <div className="page-header">
        <h2>Спорт</h2>
        <span className="muted">Garmin Connect</span>
      </div>

      <div className="gl-cards">
        {cards.map((c, i) => (
          <motion.div key={c.label} className="card gl-card"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.06 }}>
            <span className="gl-card-label">{c.label}</span>
            <span className="gl-card-value" style={{ color: c.color }}>{c.value}</span>
            {c.sub && <span className="gl-card-sub muted">{c.sub}</span>}
          </motion.div>
        ))}
      </div>

      <div className="card gl-list-card">
        <div className="card-title">Последние тренировки</div>
        {workouts.length === 0 ? (
          <div className="gl-empty muted">Нет недавних тренировок в Garmin.</div>
        ) : (
          <div className="gl-list">
            {workouts.map((w, i) => (
              <div key={i} className="gl-row">
                <div className="gl-row-main">
                  <span className="gl-row-title">{w.title}</span>
                  <span className="gl-row-sub muted">{fmtDate(w.date)} · {w.label}</span>
                </div>
                <div className="gl-row-stats">
                  {w.distanceKm != null && <span>{w.distanceKm} км</span>}
                  {w.durationMin != null && <span>{w.durationMin} мин</span>}
                  {w.avgHr != null && <span>❤ {w.avgHr}</span>}
                  {w.calories != null && <span>{w.calories} ккал</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .gl-page { display: flex; flex-direction: column; gap: 22px; max-width: 1400px; padding-bottom: 20px; }
        .page-header { display: flex; align-items: baseline; gap: 12px; }
        .page-header h2 { font-size: 24px; font-weight: 700; color: var(--foreground); }
        .gl-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .gl-card { display: flex; flex-direction: column; gap: 6px; padding: 18px 20px; }
        .gl-card-label { font-size: 13px; color: var(--muted-foreground); font-weight: 500; }
        .gl-card-value { font-size: 28px; font-weight: 700; }
        .gl-card-sub { font-size: 12px; }
        .gl-list-card { display: flex; flex-direction: column; gap: 14px; }
        .gl-empty { font-size: 14px; padding: 8px 0; }
        .gl-list { display: flex; flex-direction: column; }
        .gl-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--border); }
        .gl-row:last-child { border-bottom: none; }
        .gl-row-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .gl-row-title { font-size: 15px; font-weight: 600; color: var(--foreground); }
        .gl-row-sub { font-size: 12.5px; }
        .gl-row-stats { display: flex; gap: 14px; font-size: 13px; color: var(--muted-foreground); flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
        @media (max-width: 760px) { .gl-cards { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  )
}
