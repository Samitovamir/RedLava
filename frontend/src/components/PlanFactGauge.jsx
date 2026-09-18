/*
  A "plan vs actual" gauge for a workout. A half circle from 0 to 100% (left to right): the fill
  is multicolored — red (0–40) → orange (40–70) → green (70–100). The "goal" mark sits at 100%
  (the right edge). Anything over 100% carries on DOWN past that edge and glows purple.
  Center: the percentage. Below it, the workout's goal (km/min). CSS variables only.
  props: pct (0..N), goalText ('9 km' / '50 min'), size
*/
import { useT } from '../context/LanguageContext.jsx'

const STR = {
  en: { ahead: 'ahead', over: 'over', done: 'done', goal: 'goal' },
  ru: { ahead: 'впереди', over: 'перевып.', done: 'выполнено', goal: 'цель' },
}

const A0 = Math.PI                 // 0% — on the left
const EXTRA_MAX = 40               // how many % above 100 we still visualize
const EXTRA_DEG = 38               // how many degrees the overshoot "drops below" by
const rad = d => d * Math.PI / 180

const ZONES = [
  { from: 0, to: 40, c: 'var(--status-crit)' },
  { from: 40, to: 70, c: 'var(--status-warn)' },
  { from: 70, to: 100, c: 'var(--status-ok)' },
]
const zoneColor = p => p > 100 ? 'var(--status-extra)' : p <= 40 ? 'var(--status-crit)' : p <= 70 ? 'var(--status-warn)' : 'var(--status-ok)'

export default function PlanFactGauge({ pct = 0, goalText, size = 156 }) {
  const s = useT(STR)
  const stroke = 8               // same as the other half-circles
  const GAP = 6                  // gap between zones (in % of the scale), like gap 0.06 elsewhere
  const r = (size - stroke) / 2 - 2, cx = size / 2, cy = size / 2
  const h = Math.round(size * 0.82)
  const numSize = Math.round(size * 0.20)
  const wordSize = Math.max(11, Math.round(size * 0.075))
  const clamped = Math.max(0, Math.min(100 + EXTRA_MAX, pct))

  const angleFor = p => p <= 100 ? A0 - (p / 100) * Math.PI : -((Math.min(p, 100 + EXTRA_MAX) - 100) / EXTRA_MAX) * rad(EXTRA_DEG)
  const pt = p => { const a = angleFor(p); return [cx + r * Math.cos(a), cy - r * Math.sin(a)] }
  const arc = (p0, p1) => { const [x0, y0] = pt(p0), [x1, y1] = pt(p1); const large = Math.abs(angleFor(p0) - angleFor(p1)) > Math.PI ? 1 : 0; return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}` }
  const [mx, my] = pt(clamped)     // progress marker (at 0% on the left, at the goal on the right)

  const word = pct <= 0 ? s.ahead : pct > 100 ? s.over : s.done

  return (
    <div className="pf">
      <div className="pf-wrap" style={{ width: size, height: h }}>
        <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`}>
          {/* the zones are ALWAYS drawn (as in StressArc/ZoneArc): red · orange · green,
              with gaps on both sides and no gray backing. The marker just rides along them. */}
          {ZONES.map((z, i) => {
            const from = z.from + (i > 0 ? GAP : 0)
            const to = z.to - (i < ZONES.length - 1 ? GAP : 0)
            return <path key={i} d={arc(from, to)} fill="none" stroke={z.c} strokeWidth={stroke} strokeLinecap="round" />
          })}
          {/* the overshoot is its own purple zone heading down, only above 100% */}
          {clamped > 100 && <path d={arc(100 + GAP, clamped)} fill="none" stroke="var(--status-extra)" strokeWidth={stroke} strokeLinecap="round" />}
          {/* marker for the current progress */}
          <circle cx={mx} cy={my} r={stroke / 2 + 3.5} fill="var(--bg-card-top, var(--bg-surface))" />
          <circle cx={mx} cy={my} r={stroke / 2} fill="var(--text-primary)" />
        </svg>
        <div className="pf-center" style={{ top: size * 0.27 }}>
          <span className="pf-val" style={{ fontSize: numSize, color: zoneColor(pct) }}>{Math.round(pct)}<span className="pf-pct">%</span></span>
          <span className="pf-word" style={{ fontSize: wordSize }}>{word}</span>
        </div>
        {goalText && <span className="pf-goal" style={{ top: size * 0.56 }}>{s.goal} · {goalText}</span>}
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
