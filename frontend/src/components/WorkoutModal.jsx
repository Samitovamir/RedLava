import { useState, useEffect } from 'react'
import { Heart } from 'lucide-react'
import { Modal } from '../ui'
import { categoryColor } from '../utils/categoryColor.js'

/*
  Подробное окно тренировки (как в Garmin): сводка, карта маршрута,
  графики пульса/высоты/мощности/каденса и сплиты по километрам.
  Данные: /api/garmin/activity/:id (сплиты + тайм-серии + GPS-трек).
  Работает для любой тренировки из ленты — нужен workout.id.
*/

function fmtDate(d) {
  if (!d) return ''
  const [, m, day] = d.split('-')
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  return `${Number(day)} ${months[Number(m) - 1]}`
}

// Цвет типа тренировки — из палитры категорий темы (--cat-sport-*),
// чтобы совпадал с лентой тренировок и переключался вместе с темой.
function typeColor(type = '') {
  if (/run/.test(type)) return categoryColor('sport-run')
  if (/cycl|bik/.test(type)) return categoryColor('sport-bike')
  if (/swim/.test(type)) return categoryColor('sport-swim')
  if (/gym|strength|сил/.test(type)) return categoryColor('sport-gym')
  if (/walk|hik/.test(type)) return categoryColor('sport-walk')
  return 'var(--accent)'
}

// Сводные метрики верхней сетки
function summaryMetrics(w) {
  const out = []
  if (w.distanceKm != null) out.push({ k: 'Дистанция', v: w.distanceKm, u: 'км' })
  if (w.durationMin != null) out.push({ k: 'Время', v: w.durationMin, u: 'мин' })
  if (w.pace) out.push({ k: 'Темп', v: w.pace, u: '/км' })
  else if (w.speedKmh != null) out.push({ k: 'Скорость', v: w.speedKmh, u: 'км/ч' })
  if (w.avgHr != null) out.push({ k: 'Ср. пульс', v: w.avgHr, u: 'уд/мин' })
  if (w.maxHr != null) out.push({ k: 'Макс. пульс', v: w.maxHr, u: 'уд/мин' })
  if (w.calories != null) out.push({ k: 'Калории', v: w.calories, u: 'ккал' })
  if (w.elevationGain != null) out.push({ k: 'Набор высоты', v: w.elevationGain, u: 'м' })
  if (w.cadence != null) out.push({ k: 'Каденс', v: w.cadence, u: 'шаг/мин' })
  if (w.avgPower != null) out.push({ k: 'Мощность', v: w.avgPower, u: 'Вт' })
  if (w.vo2Max != null) out.push({ k: 'VO₂max', v: w.vo2Max, u: 'мл/кг/мин', c: 'var(--accent)' })
  if (w.trainingEffect != null) out.push({ k: 'Эффект', v: w.trainingEffect, u: w.trainingLabel || '', c: 'var(--accent)' })
  return out
}

// ── График (линия/область) с подписями значений ─────────────────────
function avgOf(arr) {
  const v = arr.filter(x => x != null && !Number.isNaN(x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

function LineChart({ xs, ys, color, area = true, unit = '', label, height = 120, yFormat = v => Math.round(v) }) {
  const W = 600, H = height, pad = 6
  const valid = ys.filter(v => v != null && !Number.isNaN(v))
  if (!valid.length) return null
  let yMin = Math.min(...valid), yMax = Math.max(...valid)
  if (yMin === yMax) { yMin -= 1; yMax += 1 }
  const avg = avgOf(ys)
  // X по дистанции, если она есть, иначе по индексу
  const xValid = (xs || []).filter(v => v != null)
  const useDist = xValid.length && (Math.max(...xValid) - Math.min(...xValid)) > 0
  const xMin = useDist ? Math.min(...xValid) : 0
  const xMax = useDist ? Math.max(...xValid) : ys.length - 1
  const px = (i) => {
    const xv = useDist ? xs[i] : i
    return ((xv - xMin) / ((xMax - xMin) || 1)) * W
  }
  const py = (y) => pad + (1 - (y - yMin) / ((yMax - yMin) || 1)) * (H - 2 * pad)

  let dLine = '', pen = false, first = null, last = null
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i]
    if (y == null || Number.isNaN(y)) { pen = false; continue }
    const X = px(i), Y = py(y)
    if (first == null) first = X
    last = X
    dLine += `${pen ? 'L' : 'M'}${X.toFixed(1)} ${Y.toFixed(1)} `
    pen = true
  }
  const dArea = dLine && first != null ? `M${first.toFixed(1)} ${H} ` + dLine.replace(/^M/, 'L') + `L${last.toFixed(1)} ${H} Z` : ''
  const gid = `g-${label}-${color}`.replace(/[^a-z0-9]/gi, '')
  const avgPct = avg != null ? (py(avg) / H) * 100 : null
  const totalKm = useDist ? xMax / 1000 : null

  return (
    <div className="wm-chart">
      <div className="wm-chart-head">
        <span className="wm-chart-label" style={{ color }}>{label}</span>
        <span className="wm-chart-range muted">
          {avg != null && <>ср. <b style={{ color: 'var(--foreground)' }}>{yFormat(avg)}</b> · </>}
          {yFormat(yMin)}–{yFormat(yMax)} {unit}
        </span>
      </div>
      <div className="wm-plot" style={{ height }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="wm-svg">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {area && dArea && <path d={dArea} fill={`url(#${gid})`} />}
          <path d={dLine} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {avgPct != null && (
          <div className="wm-avgline" style={{ top: `${avgPct}%` }}>
            <span className="wm-avgline-tag">ср. {yFormat(avg)}</span>
          </div>
        )}
        <span className="wm-y wm-y-max muted">{yFormat(yMax)}</span>
        <span className="wm-y wm-y-min muted">{yFormat(yMin)}</span>
      </div>
      {totalKm != null && (
        <div className="wm-xaxis muted"><span>0 км</span><span>{totalKm.toFixed(1)} км</span></div>
      )}
    </div>
  )
}

// ── Сплиты/отрезки (бары) ───────────────────────────────────────────
const fmtDur = sec => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`

function SplitsChart({ splits, color }) {
  if (!splits.length) return null
  const speeds = splits.map(s => s.speedKmh || 0)
  const durs = splits.map(s => s.durationSec || 0)
  const useSpeed = speeds.some(v => v > 0)        // бег/вело — бар по скорости (длиннее = быстрее)
  const maxSpeed = Math.max(...speeds, 1)
  const maxDur = Math.max(...durs, 1)
  return (
    <div className="wm-splits">
      {splits.map((s, i) => {
        const w = useSpeed && s.speedKmh
          ? Math.max(14, (s.speedKmh / maxSpeed) * 100)
          : s.durationSec ? Math.max(14, (s.durationSec / maxDur) * 100) : 14
        const main = s.pace ? `${s.pace} /км` : s.speedKmh ? `${s.speedKmh} км/ч` : s.durationSec ? fmtDur(s.durationSec) : '—'
        return (
          <div key={i} className="wm-split-row">
            <span className="wm-split-km">{s.index}</span>
            <div className="wm-split-bar-wrap">
              <div className="wm-split-bar" style={{ width: `${w}%`, background: color }} />
              <span className="wm-split-pace">{main}</span>
            </div>
            {s.avgHr != null && <span className="wm-split-hr"><Heart size={11} strokeWidth={2} /> {s.avgHr}</span>}
            {s.elevationGain != null && <span className="wm-split-el muted">{s.elevationGain > 0 ? '+' : ''}{s.elevationGain} м</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── Карта маршрута из GPS ───────────────────────────────────────────
function RouteMap({ route, color }) {
  if (!route?.length) return null
  const lats = route.map(p => p[0]), lons = route.map(p => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const W = 600, H = 240, pad = 16
  const spanLat = (maxLat - minLat) || 1e-6, spanLon = (maxLon - minLon) || 1e-6
  // Сохраняем пропорции (широта сжимается по cos)
  const aspect = spanLon / spanLat * Math.cos((minLat + maxLat) / 2 * Math.PI / 180)
  const innerW = W - 2 * pad, innerH = H - 2 * pad
  let drawW = innerW, drawH = innerW / aspect
  if (drawH > innerH) { drawH = innerH; drawW = innerH * aspect }
  const offX = pad + (innerW - drawW) / 2, offY = pad + (innerH - drawH) / 2
  const x = lon => offX + ((lon - minLon) / spanLon) * drawW
  const y = lat => offY + (1 - (lat - minLat) / spanLat) * drawH
  const d = route.map((p, i) => `${i ? 'L' : 'M'}${x(p[1]).toFixed(1)} ${y(p[0]).toFixed(1)}`).join(' ')
  const start = route[0], end = route[route.length - 1]
  return (
    <div className="card wm-map">
      <div className="card-title">Маршрут</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="wm-map-svg">
        <path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(start[1])} cy={y(start[0])} r="5" fill="var(--green)" stroke="var(--bg-card)" strokeWidth="2" />
        <circle cx={x(end[1])} cy={y(end[0])} r="5" fill="var(--red)" stroke="var(--bg-card)" strokeWidth="2" />
      </svg>
    </div>
  )
}

export default function WorkoutModal({ workout, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const accent = typeColor(workout?.type)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!workout?.id) { setLoading(false); return }
    let alive = true
    setLoading(true)
    fetch(`/api/garmin/activity/${workout.id}`)
      .then(r => r.json())
      .then(d => { if (alive) { setData(d); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [workout?.id])

  if (!workout) return null
  const series = data?.series
  const splits = data?.splits || []
  const route = data?.route
  const kmAxis = series?.distanceM
  const paceColor = accent

  return (
    <Modal open onClose={onClose} size="lg" align="top" className="wm-panel">

          <button className="wm-close" onClick={onClose} aria-label="Закрыть">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>

          <div className="wm-header">
            <div className="wm-badge" style={{ color: accent, background: `color-mix(in srgb, ${accent} 16%, transparent)` }}>{workout.label}</div>
            <h2 className="wm-title">{workout.title}</h2>
            <span className="wm-date muted">{fmtDate(workout.date)}</span>
          </div>

          <div className="wm-summary">
            {summaryMetrics(workout).map(m => (
              <div key={m.k} className="wm-metric">
                <span className="wm-metric-value" style={m.c ? { color: m.c } : undefined}>{m.v}</span>
                <span className="wm-metric-unit muted">{m.u}</span>
                <span className="wm-metric-label muted">{m.k}</span>
              </div>
            ))}
          </div>

          {loading && <div className="wm-loading muted">Загружаю подробности тренировки…</div>}

          {!loading && (
            <>
              {route && <RouteMap route={route} color={accent} />}

              {(series?.hr || series?.elevation || series?.power || series?.cadence) && (
                <div className="card wm-charts">
                  <div className="card-title">Динамика по дистанции</div>
                  {series.hr && <LineChart xs={kmAxis} ys={series.hr} color="var(--red)" unit="уд/мин" label="Пульс" />}
                  {series.elevation && <LineChart xs={kmAxis} ys={series.elevation} color="var(--green)" unit="м" label="Высота" />}
                  {series.power && <LineChart xs={kmAxis} ys={series.power} color="var(--orange)" unit="Вт" label="Мощность" />}
                  {series.cadence && <LineChart xs={kmAxis} ys={series.cadence} color="var(--accent)" unit="шаг/мин" label="Каденс" />}
                </div>
              )}

              {splits.length > 0 && splits.some(s => s.pace || s.speedKmh || s.durationSec) && (
                <div className="card wm-splits-card">
                  <div className="card-title">{splits.some(s => s.distanceKm) ? 'Километры' : 'Отрезки'}</div>
                  <SplitsChart splits={splits} color={paceColor} />
                </div>
              )}

              {!route && !series && splits.length === 0 && (
                <div className="wm-loading muted">Для этой тренировки нет детальных графиков в Garmin.</div>
              )}
            </>
          )}

          <style>{`
            .wm-panel { display: flex; flex-direction: column; gap: 18px; }
            .wm-close {
              position: absolute; top: 18px; right: 18px;
              width: 34px; height: 34px; border-radius: 10px;
              background: var(--bg-secondary); border: 1px solid var(--border);
              color: var(--muted); cursor: pointer; display: flex; align-items: center; justify-content: center;
              transition: all 0.15s;
            }
            .wm-close:hover { color: var(--foreground); border-color: var(--border-hover); }
            .wm-header { display: flex; flex-direction: column; gap: 8px; padding-right: 40px; }
            .wm-badge { align-self: flex-start; font-size: 12.5px; font-weight: 700; padding: 4px 12px; border-radius: 16px; }
            .wm-title { font-size: 23px; font-weight: 700; color: var(--foreground); letter-spacing: -0.01em; }
            .wm-date { font-size: 13px; }

            .wm-summary {
              display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 12px;
            }
            .wm-metric { display: flex; flex-direction: column; gap: 1px; background: var(--bg-secondary); border-radius: 12px; padding: 11px 13px; }
            .wm-metric-value { font-size: 19px; font-weight: 700; color: var(--foreground); line-height: 1.1; }
            .wm-metric-unit { font-size: 11.5px; font-weight: 500; }
            .wm-metric-label { font-size: 11px; margin-top: 4px; }

            .wm-loading { font-size: 14px; padding: 10px 0; }

            .wm-map { display: flex; flex-direction: column; gap: 12px; }
            .wm-map-svg { width: 100%; height: 240px; display: block; }

            .wm-charts { display: flex; flex-direction: column; gap: 22px; }
            .wm-chart { display: flex; flex-direction: column; gap: 6px; }
            .wm-chart-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
            .wm-chart-label { font-size: 13px; font-weight: 700; }
            .wm-chart-range { font-size: 12px; }
            .wm-chart-range b { font-weight: 700; }
            .wm-plot { position: relative; width: 100%; }
            .wm-svg { width: 100%; height: 100%; display: block; }
            .wm-avgline {
              position: absolute; left: 0; right: 0; height: 0;
              border-top: 1px dashed color-mix(in srgb, var(--muted) 55%, transparent);
              pointer-events: none;
            }
            .wm-avgline-tag {
              position: absolute; right: 0; top: -8px; font-size: 10px; color: var(--muted);
              background: var(--bg-card); padding: 0 4px; border-radius: 4px;
            }
            .wm-y { position: absolute; left: 0; font-size: 10.5px; background: var(--bg-card); padding: 0 3px; border-radius: 3px; }
            .wm-y-max { top: -2px; }
            .wm-y-min { bottom: -2px; }
            .wm-xaxis { display: flex; justify-content: space-between; font-size: 11px; margin-top: 2px; }

            .wm-splits-card { display: flex; flex-direction: column; gap: 12px; }
            .wm-splits { display: flex; flex-direction: column; gap: 7px; }
            .wm-split-row { display: flex; align-items: center; gap: 12px; }
            .wm-split-km { width: 22px; font-size: 13px; font-weight: 700; color: var(--muted); text-align: right; flex-shrink: 0; }
            .wm-split-bar-wrap { flex: 1; position: relative; height: 26px; display: flex; align-items: center; background: var(--bg-secondary); border-radius: 7px; overflow: hidden; }
            .wm-split-bar { height: 100%; border-radius: 7px; opacity: 0.42; transition: width 0.4s; min-width: 8px; }
            .wm-split-pace { position: absolute; left: 12px; font-size: 13px; font-weight: 600; color: var(--foreground); }
            .wm-split-hr { font-size: 12.5px; color: var(--text-primary); flex-shrink: 0; width: 52px; }
            .wm-split-el { font-size: 12.5px; flex-shrink: 0; width: 44px; text-align: right; }

            @media (max-width: 560px) {
              .wm-panel { padding: 22px 18px 26px; border-radius: 16px; }
              .wm-title { font-size: 20px; }
            }
          `}</style>
    </Modal>
  )
}
