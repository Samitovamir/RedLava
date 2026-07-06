/*
  Гейдж «план/факт» тренировки. Полукруг 0→100% (слева направо): заливка многоцветная —
  красный (0–40) → оранжевый (40–70) → зелёный (70–100). Отметка «цель» на 100% (правый
  край). Перевыполнение (>100%) продолжается ВНИЗ за правый край и горит фиолетовым.
  Центр: процент. Снизу — цель тренировки (км/мин). Только CSS-переменные.
  props: pct (0..N), goalText ('9 км' / '50 мин'), size
*/
const A0 = Math.PI                 // 0% — слева
const EXTRA_MAX = 40               // сколько % сверх 100 визуализируем
const EXTRA_DEG = 38               // на сколько градусов «уходит вниз» перевыполнение
const rad = d => d * Math.PI / 180

const ZONES = [
  { from: 0, to: 40, c: 'var(--status-crit)' },
  { from: 40, to: 70, c: 'var(--status-warn)' },
  { from: 70, to: 100, c: 'var(--status-ok)' },
]
const zoneColor = p => p > 100 ? 'var(--status-extra)' : p <= 40 ? 'var(--status-crit)' : p <= 70 ? 'var(--status-warn)' : 'var(--status-ok)'

export default function PlanFactGauge({ pct = 0, goalText, size = 156 }) {
  const stroke = 8               // как в остальных полусферах
  const GAP = 4.5                // пробел между зонами (в % шкалы), как gap 0.045 в других
  const r = (size - stroke) / 2 - 2, cx = size / 2, cy = size / 2
  const h = Math.round(size * 0.82)
  const numSize = Math.round(size * 0.20)
  const wordSize = Math.max(11, Math.round(size * 0.075))
  const clamped = Math.max(0, Math.min(100 + EXTRA_MAX, pct))

  const angleFor = p => p <= 100 ? A0 - (p / 100) * Math.PI : -((Math.min(p, 100 + EXTRA_MAX) - 100) / EXTRA_MAX) * rad(EXTRA_DEG)
  const pt = p => { const a = angleFor(p); return [cx + r * Math.cos(a), cy - r * Math.sin(a)] }
  const arc = (p0, p1) => { const [x0, y0] = pt(p0), [x1, y1] = pt(p1); const large = Math.abs(angleFor(p0) - angleFor(p1)) > Math.PI ? 1 : 0; return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}` }
  const [mx, my] = pt(clamped)     // маркер прогресса (при 0% — слева, у цели — справа)

  const word = pct <= 0 ? 'впереди' : pct > 100 ? 'перевып.' : pct >= 100 ? 'выполнено' : 'выполнено'

  return (
    <div className="pf">
      <div className="pf-wrap" style={{ width: size, height: h }}>
        <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`}>
          {/* зоны показаны ВСЕГДА (как в StressArc/ZoneArc): красный · оранжевый · зелёный,
              пробелы с обеих сторон, без серой подложки. Маркер просто ездит по ним. */}
          {ZONES.map((z, i) => {
            const from = z.from + (i > 0 ? GAP : 0)
            const to = z.to - (i < ZONES.length - 1 ? GAP : 0)
            return <path key={i} d={arc(from, to)} fill="none" stroke={z.c} strokeWidth={stroke} strokeLinecap="round" />
          })}
          {/* перевыполнение — отдельная фиолетовая зона вниз, только при >100% */}
          {clamped > 100 && <path d={arc(100 + GAP, clamped)} fill="none" stroke="var(--status-extra)" strokeWidth={stroke} strokeLinecap="round" />}
          {/* маркер текущего прогресса */}
          <circle cx={mx} cy={my} r={stroke / 2 + 3.5} fill="var(--bg-card-top, var(--bg-surface))" />
          <circle cx={mx} cy={my} r={stroke / 2} fill="var(--text-primary)" />
        </svg>
        <div className="pf-center" style={{ top: size * 0.27 }}>
          <span className="pf-val" style={{ fontSize: numSize, color: zoneColor(pct) }}>{Math.round(pct)}<span className="pf-pct">%</span></span>
          <span className="pf-word" style={{ fontSize: wordSize }}>{word}</span>
        </div>
        {goalText && <span className="pf-goal" style={{ top: size * 0.56 }}>цель · {goalText}</span>}
      </div>

      <style>{`
        .pf { display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .pf-wrap { position: relative; }
        .pf-center { position: absolute; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; }
        .pf-val { font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
        .pf-pct { font-size: 0.5em; font-weight: 700; margin-left: 1px; }
        .pf-word { font-weight: 700; margin-top: 3px; color: var(--text-muted); text-transform: lowercase; }
        .pf-goal { position: absolute; left: 0; right: 0; text-align: center; font-size: 11px; color: var(--text-muted); }
      `}</style>
    </div>
  )
}
