import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import WorkoutModal from './WorkoutModal.jsx'
import { useEvents } from '../context/EventsContext.jsx'
import { isGuest } from '../api/authFetch.js'
import { demoPlanned } from '../utils/demo.js'

// Спорт-тип Garmin → по-русски (для плановых тренировок)
const SPORT_RU = {
  running: 'Бег', cycling: 'Велосипед', lap_swimming: 'Плавание', swimming: 'Плавание',
  strength_training: 'Силовая', cardio: 'Кардио', walking: 'Ходьба', other: 'Тренировка'
}
const sportRu = s => SPORT_RU[s] || (s ? s.replace(/_/g, ' ') : 'Тренировка')

const hmToMin = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + (m || 0) }
const minToHm = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`

// Подобрать время тренировки: приоритет 06:30, с учётом длительности и БЕЗ наложения
// на существующие события дня. Если 06:30 занято — ближайшее свободное (сначала утро).
function proposeSlot(dateStr, durMin, events) {
  const dur = durMin || 60
  const busy = (events || []).filter(e => e.date === dateStr && e.start && e.end).map(e => [hmToMin(e.start), hmToMin(e.end)])
  const fits = s => { const e = s + dur; if (e > 22 * 60) return false; return !busy.some(([bs, be]) => s < be && e > bs) }
  const slot = s => ({ start: minToHm(s), end: minToHm(s + dur) })
  const pref = 6 * 60 + 30
  if (fits(pref)) return slot(pref)
  for (let s = pref; s <= 21 * 60 + 30; s += 15) if (fits(s)) return slot(s)   // позже утра/днём
  for (let s = 5 * 60; s < pref; s += 15) if (fits(s)) return slot(s)          // совсем рано
  return slot(pref)
}

/*
  Реальные данные Garmin: шаги, пульс покоя, VO2max, объём за неделю,
  hero-карточка последней тренировки и лента тренировок с полными метриками.
  Источник: localStorage 'albert-garmin-live' + обновление с сервера.
*/
function readLive() {
  try { const s = localStorage.getItem('albert-garmin-live'); return s ? JSON.parse(s) : null } catch { return null }
}

function fmtDate(d) {
  if (!d) return ''
  const [, m, day] = d.split('-')
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  return `${Number(day)} ${months[Number(m) - 1]}`
}

// Русская множественная форма: тренировка / тренировки / тренировок
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

// Цвет-акцент по типу активности
function typeColor(type = '') {
  if (/run/.test(type)) return 'var(--orange)'
  if (/cycl|bik/.test(type)) return 'var(--accent)'
  if (/swim/.test(type)) return 'var(--green)'
  return 'var(--yellow)'
}

const ICON_HEART = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.3 5c2 0 3.4 1.2 4.7 2.7C11.3 6.2 12.7 5 14.7 5 18 5 19.6 8.4 22 11.7 19.5 16.4 12 21 12 21z"/>
  </svg>
)

// Метрики hero-карточки (показываем только заполненные)
function heroMetrics(w) {
  const out = []
  if (w.distanceKm != null) out.push({ k: 'Дистанция', v: w.distanceKm, u: 'км' })
  if (w.durationMin != null) out.push({ k: 'Время', v: w.durationMin, u: 'мин' })
  if (w.pace) out.push({ k: 'Темп', v: w.pace, u: '/км' })
  else if (w.speedKmh != null) out.push({ k: 'Скорость', v: w.speedKmh, u: 'км/ч' })
  if (w.avgHr != null) out.push({ k: 'Ср. пульс', v: w.avgHr, u: 'уд/мин', accent: 'var(--green)' })
  if (w.maxHr != null) out.push({ k: 'Макс. пульс', v: w.maxHr, u: 'уд/мин' })
  if (w.calories != null) out.push({ k: 'Калории', v: w.calories, u: 'ккал' })
  if (w.elevationGain != null) out.push({ k: 'Набор высоты', v: w.elevationGain, u: 'м' })
  if (w.cadence != null) out.push({ k: 'Каденс', v: w.cadence, u: 'шаг/мин' })
  if (w.avgPower != null) out.push({ k: 'Мощность', v: w.avgPower, u: 'Вт' })
  if (w.trainingEffect != null) out.push({ k: 'Эффект', v: w.trainingEffect, u: w.trainingLabel || '', accent: 'var(--accent)' })
  return out
}

export default function GarminLive() {
  const [g, setG] = useState(readLive)
  const [selected, setSelected] = useState(null)   // открытая тренировка (окно деталей)

  // Плановые тренировки (TrainingPeaks/Garmin) и какие уже добавлены в календарь
  const { events, applyAiActions } = useEvents()
  const [planned, setPlanned] = useState([])
  const [plannedDebug, setPlannedDebug] = useState(null)
  const [openSec, setOpenSec] = useState({ planned: true, recent: true })  // свёрнутость секций
  const toggleSec = k => setOpenSec(s => ({ ...s, [k]: !s[k] }))
  const [added, setAdded] = useState(() => {
    try { return JSON.parse(localStorage.getItem('albert-planned-added') || '{}') } catch { return {} }
  })
  function persistAdded(next) { setAdded(next); try { localStorage.setItem('albert-planned-added', JSON.stringify(next)) } catch { /* ignore */ } }

  const eventInput = (w, start, end) => ({
    name: 'create_event',
    input: { type: 'meeting', title: w.title || 'Тренировка', date: w.date, start, end, who: 'Тренировка', priority: 2 }
  })
  // Уже есть такое событие в календаре? (защита от дублей, в т.ч. с другого устройства)
  const existsInCal = (date, start, title) =>
    (events || []).some(e => e.date === date && e.start === start && (e.title || '').trim() === (title || '').trim())

  // Добавить тренировку в календарь: с временем — на него; без — на лучший утренний слот
  function scheduleWorkout(w) {
    if (added[w.id]) return            // уже добавлено — не дублируем
    const dur = w.durationMin || 60
    const { start, end } = w.time
      ? { start: w.time, end: minToHm(hmToMin(w.time) + dur) }
      : proposeSlot(w.date, dur, events)
    if (!existsInCal(w.date, start, w.title)) applyAiActions([eventInput(w, start, end)])
    persistAdded({ ...added, [w.id]: { date: w.date, start, end } })
  }

  useEffect(() => {
    fetch('/api/garmin/data').then(r => r.json()).then(d => {
      if (d.connected && d.garmin) {
        setG(d.garmin)
        try { localStorage.setItem('albert-garmin-live', JSON.stringify(d.garmin)) } catch { /* ignore */ }
      }
    }).catch(() => {})
  }, [])

  // Плановые тренировки: грузим и СРАЗУ добавляем те, у которых уже есть время.
  // Гостю бэкенд планы не отдаёт — показываем демо-планы.
  useEffect(() => {
    if (isGuest()) { setPlanned(demoPlanned()); return }
    fetch('/api/garmin/planned').then(r => r.json()).then(d => {
      const list = d?.planned || []
      setPlanned(list)
      setPlannedDebug(d?.debug || null)
      const timed = list.filter(w => w.time && !added[w.id])
      if (timed.length) {
        applyAiActions(timed.map(w => eventInput(w, w.time, minToHm(hmToMin(w.time) + (w.durationMin || 60)))))
        const next = { ...added }
        timed.forEach(w => { next[w.id] = { date: w.date, start: w.time, end: minToHm(hmToMin(w.time) + (w.durationMin || 60)) } })
        persistAdded(next)
      }
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const last = g?.lastWorkout
  const workouts = g?.workouts || []
  const accent = typeColor(last?.type)

  const stats = [
    { label: 'Шаги сегодня', value: g?.steps != null ? g.steps.toLocaleString('ru-RU') : '—', color: 'var(--orange)' },
    { label: 'Пульс покоя', value: g?.restingHr != null ? `${g.restingHr}` : '—', sub: 'уд/мин', color: 'var(--green)' },
    { label: 'VO₂max', value: g?.vo2Max != null ? `${g.vo2Max}` : '—', sub: 'мл/кг/мин', color: 'var(--accent)' },
    { label: 'За неделю', value: g?.weekKm != null ? `${g.weekKm} км` : '—', sub: g?.weekCount != null ? `${g.weekCount} ${plural(g.weekCount, 'тренировка', 'тренировки', 'тренировок')}` : '', color: 'var(--yellow)' }
  ]

  return (
    <div className="gl-page">
      <div className="page-header">
        <h2>Спорт</h2>
        <span className="muted">Garmin Connect</span>
      </div>

      <div className="gl-stats">
        {stats.map((c, i) => (
          <motion.div key={c.label} className="card gl-stat"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.05 }}>
            <span className="gl-stat-label">{c.label}</span>
            <span className="gl-stat-value" style={{ color: c.color }}>{c.value}</span>
            {c.sub && <span className="gl-stat-sub muted">{c.sub}</span>}
          </motion.div>
        ))}
      </div>

      {last && (
        <motion.div className={`card gl-hero ${last.id ? 'gl-clickable' : ''}`}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
          whileHover={last.id ? { y: -3 } : undefined}
          onClick={last.id ? () => setSelected(last) : undefined}
          style={{ '--hero-accent': accent }}>
          <div className="gl-hero-head">
            <div className="gl-hero-badge" style={{ color: accent, background: `color-mix(in srgb, ${accent} 16%, transparent)` }}>
              {last.label}
            </div>
            <span className="gl-hero-date muted">{fmtDate(last.date)} · последняя тренировка</span>
            {last.id && <span className="gl-hero-cta" style={{ color: accent }}>подробнее →</span>}
          </div>
          <h3 className="gl-hero-title">{last.title}</h3>
          <div className="gl-hero-grid">
            {heroMetrics(last).map(m => (
              <div key={m.k} className="gl-metric">
                <span className="gl-metric-value" style={m.accent ? { color: m.accent } : undefined}>{m.v}</span>
                <span className="gl-metric-unit muted">{m.u}</span>
                <span className="gl-metric-label muted">{m.k}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div className="card gl-list-card"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.14 }}>
        <div className="gl-card-head">
          <div className="card-title" style={{ margin: 0 }}>Приближающиеся тренировки</div>
          <button className="gl-collapse" onClick={() => toggleSec('planned')} aria-label={openSec.planned ? 'Свернуть' : 'Развернуть'}>
            <svg className={`gl-chev ${openSec.planned ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
        {openSec.planned && (planned.length === 0 ? (
          <div className="gl-empty muted">
            Плановых тренировок пока нет. Чтобы планы появлялись здесь, свяжите TrainingPeaks с Garmin: в TrainingPeaks → Settings → Connections включите Garmin и «Automatically send workouts».
          </div>
        ) : (<>
          <div className="gl-planned">
            {planned.map(w => {
              const info = added[w.id]
              const c = typeColor(w.sport)
              return (
                <div key={w.id} className="gl-prow">
                  <span className="gl-row-dot" style={{ background: c }} />
                  <div className="gl-row-main">
                    <span className="gl-row-title">{w.title}</span>
                    <span className="gl-row-sub muted">
                      {fmtDate(w.date)} · {sportRu(w.sport)}
                      {w.durationMin ? ` · ${w.durationMin} мин` : ''}
                      {w.distanceKm ? ` · ${w.distanceKm} км` : ''}
                      {w.time ? ` · в ${w.time}` : ''}
                    </span>
                  </div>
                  {info
                    ? <span className="gl-added">✓ в календаре{info.start ? `, ${info.start}` : ''}</span>
                    : <button className="gl-add-btn" onClick={() => scheduleWorkout(w)}>
                        {w.time ? 'В календарь' : 'В календарь · ~6:30'}
                      </button>}
                </div>
              )
            })}
          </div>
          <div className="gl-planned-note muted">Без своего времени тренировка ставится на утро (≈6:30), с учётом длительности и других дел дня.</div>
          </>))}
        </motion.div>

      <motion.div className="card gl-list-card"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.16 }}>
        <div className="gl-card-head">
          <div className="card-title" style={{ margin: 0 }}>Последние тренировки</div>
          <button className="gl-collapse" onClick={() => toggleSec('recent')} aria-label={openSec.recent ? 'Свернуть' : 'Развернуть'}>
            <svg className={`gl-chev ${openSec.recent ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
        {!openSec.recent ? null : workouts.length === 0 ? (
          <div className="gl-empty muted">Нет недавних тренировок в Garmin.</div>
        ) : (
          <div className="gl-list">
            {workouts.map((w, i) => {
              const c = typeColor(w.type)
              return (
                <div key={i} className={`gl-row ${w.id ? 'gl-clickable' : ''}`}
                  onClick={w.id ? () => setSelected(w) : undefined}>
                  <span className="gl-row-dot" style={{ background: c }} />
                  <div className="gl-row-main">
                    <span className="gl-row-title">{w.title}</span>
                    <span className="gl-row-sub muted">{fmtDate(w.date)} · {w.label}</span>
                  </div>
                  <div className="gl-row-stats">
                    {w.distanceKm != null && <span><b>{w.distanceKm}</b> км</span>}
                    {w.durationMin != null && <span><b>{w.durationMin}</b> мин</span>}
                    {w.pace ? <span><b>{w.pace}</b> /км</span> : w.speedKmh != null && <span><b>{w.speedKmh}</b> км/ч</span>}
                    {w.avgHr != null && <span className="gl-hr"><span className="gl-hr-ico">{ICON_HEART}</span>{w.avgHr}</span>}
                    {w.elevationGain != null && <span><b>{w.elevationGain}</b> м ↑</span>}
                    {w.calories != null && <span><b>{w.calories}</b> ккал</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </motion.div>

      {selected && <WorkoutModal workout={selected} onClose={() => setSelected(null)} />}

      <style>{`
        .gl-page { display: flex; flex-direction: column; gap: 18px; max-width: 1400px; padding-bottom: 20px; }
        .gl-clickable { cursor: pointer; }
        .gl-hero.gl-clickable { transition: border-color 0.2s, box-shadow 0.2s; }
        .gl-hero.gl-clickable:hover { border-color: var(--border-hover); box-shadow: var(--shadow-lift); }
        .gl-hero-cta { margin-left: auto; font-size: 12.5px; font-weight: 600; }
        .gl-row.gl-clickable { transition: background 0.15s; border-radius: 8px; padding-left: 10px; padding-right: 10px; margin: 0 -10px; }
        .gl-row.gl-clickable:hover { background: var(--bg-secondary); }
        .page-header { display: flex; align-items: baseline; gap: 12px; }
        .page-header h2 { font-size: 24px; font-weight: 700; color: var(--foreground); }

        .gl-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
        .gl-stat { display: flex; flex-direction: column; gap: 5px; padding: 16px 18px; }
        .gl-stat-label { font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
        .gl-stat-value { font-size: 26px; font-weight: 700; letter-spacing: -0.01em; }
        .gl-stat-sub { font-size: 12px; }

        .gl-hero { position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 14px; padding: 22px 24px; }
        .gl-hero::before {
          content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%;
          background: var(--hero-accent);
        }
        .gl-hero-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .gl-hero-badge { font-size: 12.5px; font-weight: 700; padding: 4px 12px; border-radius: 16px; }
        .gl-hero-date { font-size: 13px; }
        .gl-hero-title { font-size: 21px; font-weight: 700; color: var(--foreground); letter-spacing: -0.01em; }
        .gl-hero-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
          gap: 14px; margin-top: 4px;
        }
        .gl-metric {
          display: flex; flex-direction: column; gap: 1px;
          background: var(--bg-secondary); border-radius: 12px; padding: 12px 14px;
        }
        .gl-metric-value { font-size: 20px; font-weight: 700; color: var(--foreground); line-height: 1.1; }
        .gl-metric-unit { font-size: 12px; font-weight: 500; }
        .gl-metric-label { font-size: 11.5px; margin-top: 4px; }

        .gl-list-card { display: flex; flex-direction: column; gap: 12px; }
        .gl-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .gl-collapse {
          width: 30px; height: 30px; flex-shrink: 0; border-radius: 8px;
          border: 1px solid var(--border); background: var(--bg-secondary); color: var(--muted);
          cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s;
        }
        .gl-collapse:hover { color: var(--foreground); border-color: var(--border-hover); }
        .gl-chev { transition: transform 0.2s; }
        .gl-chev.open { transform: rotate(180deg); }
        .gl-planned { display: flex; flex-direction: column; }
        .gl-prow { display: flex; align-items: center; gap: 14px; padding: 13px 0; border-bottom: 1px solid var(--border); }
        .gl-prow:last-child { border-bottom: none; }
        .gl-add-btn {
          flex-shrink: 0; padding: 8px 14px; border-radius: 10px; border: 1px solid var(--accent);
          background: transparent; color: var(--accent); font-family: inherit; font-size: 13px; font-weight: 600;
          cursor: pointer; transition: all 0.15s; white-space: nowrap;
        }
        .gl-add-btn:hover { background: color-mix(in srgb, var(--accent) 14%, transparent); }
        .gl-added { flex-shrink: 0; font-size: 13px; font-weight: 600; color: var(--green); white-space: nowrap; }
        .gl-planned-note { font-size: 12px; margin-top: 2px; }
        .gl-debug { font-size: 11px; opacity: 0.6; margin-top: 8px; word-break: break-all; }
        .gl-empty { font-size: 14px; padding: 8px 0; }
        .gl-list { display: flex; flex-direction: column; }
        .gl-row { display: flex; align-items: center; gap: 14px; padding: 13px 0; border-bottom: 1px solid var(--border); }
        .gl-row:last-child { border-bottom: none; }
        .gl-row-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .gl-row-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
        .gl-row-title { font-size: 15px; font-weight: 600; color: var(--foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .gl-row-sub { font-size: 12.5px; }
        .gl-row-stats { display: flex; gap: 16px; font-size: 13px; color: var(--muted); flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
        .gl-row-stats b { color: var(--foreground); font-weight: 600; }
        .gl-hr { display: inline-flex; align-items: center; gap: 4px; }
        .gl-hr-ico { color: var(--green); display: inline-flex; }

        @media (max-width: 900px) { .gl-stats { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 620px) {
          .gl-row { flex-wrap: wrap; }
          .gl-row-stats { width: 100%; justify-content: flex-start; gap: 12px; }
        }
      `}</style>
    </div>
  )
}
