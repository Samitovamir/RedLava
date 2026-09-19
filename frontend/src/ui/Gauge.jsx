import { motion } from 'framer-motion'
import { DUR, EASE } from '../motion.js'

/*
  The one dial used across the app: a 270° arc, open at the bottom (the shape Garmin uses).

  Every gauge on every screen is drawn here, so a metric looks the same wherever it appears:
  stress on Home, Sport and Health is one picture, not three. The app used to have nine
  hand-rolled dials in three shapes (half circle, 270° arc, full ring), each with its own line
  width, track color and number size.

  Two ways to fill the arc:
   • fill  — a neutral track and one color up to the value (steps, sleep, calories)
   • zones — colored bands along the scale and a marker on the value (stress, readiness, VO₂max)
  `inner` adds a second measure on a smaller arc inside the first (recovery with strain).

  Text rules: the number is always text-primary; the one-word verdict under it may wear a
  status color (it is the assessment); everything else is muted.

  props:
    value, min=0, max=100
    color              fill color (fill mode)
    zones              [{ from, to, color }] in scale units (zones mode)
    inner              { value, max, color } — a second fill arc inside
    center             the big figure (defaults to value; '—' with no value; false hides it)
    unit               a small suffix after the figure ('%')
    word, wordColor    one word under the figure — the verdict
    sub                a muted line under the figure (a node: context, not a verdict)
    label              the caption under the dial (a string, or a node for a richer caption)
    ariaLabel          what a screen reader hears; built from the parts when label is a string
    size               outer width in px
*/

const START = 135          // degrees; 0° points right, angles grow clockwise in SVG
const SWEEP = 270
const rad = d => (d * Math.PI) / 180

export default function Gauge({
  value = null, min = 0, max = 100, color = 'var(--accent)', zones = null, inner = null,
  center, unit, word, wordColor, sub, label, ariaLabel, size = 148,
}) {
  const stroke = Math.max(8, Math.round(size * 0.066))
  const r = size / 2 - stroke / 2 - 1
  const cx = size / 2, cy = size / 2
  // Tall enough for the arc's two ends (at ±45° below center) and their round caps
  const h = Math.ceil(cy + r * Math.SQRT1_2 + stroke / 2 + 1)
  const has = value != null && !Number.isNaN(value)
  const norm = v => Math.max(0, Math.min(1, (v - min) / (max - min || 1)))
  const frac = has ? norm(value) : 0

  const pt = (f, radius) => {
    const a = rad(START + f * SWEEP)
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)]
  }
  const arc = (f0, f1, radius = r) => {
    const [x0, y0] = pt(f0, radius), [x1, y1] = pt(f1, radius)
    const large = (f1 - f0) * SWEEP > 180 ? 1 : 0
    return `M ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`
  }
  // Zones are separated by a fixed visible gap: the round caps reach stroke/2 past each end,
  // so the geometric gap is the stroke plus 4px, whatever the size.
  const gapFrac = ((stroke + 4) / r) / rad(SWEEP)
  const track = 'color-mix(in srgb, var(--text-faint) 26%, transparent)'
  const surface = 'var(--bg-card-top, var(--bg-surface))'
  const grow = { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: DUR.slower * 2, ease: EASE } }

  const ri = r - stroke - 4
  const innerFrac = inner && inner.value != null ? Math.max(0, Math.min(1, inner.value / (inner.max || 1))) : 0

  const figure = center === false ? null : (has ? (center ?? value) : '—')
  const numSize = Math.round(size * 0.2)
  const smallSize = Math.max(11, Math.round(size * 0.08))
  const [mx, my] = pt(frac, r)
  const aria = ariaLabel ?? [typeof label === 'string' && label, figure != null && `${figure}${unit || ''}`, word].filter(Boolean).join(', ')

  return (
    <div className="gauge" role="img" aria-label={aria}>
      <div className="gauge-dial" style={{ width: size, height: h }}>
        <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} aria-hidden="true">
          {zones ? (
            zones.map((z, i) => {
              const a = norm(z.from) + (i > 0 ? gapFrac / 2 : 0)
              const b = norm(z.to) - (i < zones.length - 1 ? gapFrac / 2 : 0)
              return b > a ? <path key={i} d={arc(a, b)} fill="none" stroke={z.color} strokeWidth={stroke} strokeLinecap="round" /> : null
            })
          ) : (
            <>
              <path d={arc(0, 1)} fill="none" stroke={track} strokeWidth={stroke} strokeLinecap="round" />
              {has && frac > 0 && (
                <motion.path d={arc(0, frac)} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" {...grow} />
              )}
            </>
          )}
          {inner && (
            <>
              <path d={arc(0, 1, ri)} fill="none" stroke={track} strokeWidth={stroke} strokeLinecap="round" />
              {innerFrac > 0 && (
                <motion.path d={arc(0, innerFrac, ri)} fill="none" stroke={inner.color || 'var(--accent)'} strokeWidth={stroke} strokeLinecap="round" {...grow} />
              )}
            </>
          )}
          {zones && has && (
            <>
              <circle cx={mx} cy={my} r={stroke / 2 + 3} fill={surface} />
              <circle cx={mx} cy={my} r={stroke / 2} fill="var(--text-primary)" />
            </>
          )}
        </svg>
        <div className="gauge-center" style={{ top: cy }}>
          {figure != null && (
            <span className="gauge-num" style={{ fontSize: numSize }}>
              {figure}{has && unit && <span className="gauge-unit">{unit}</span>}
            </span>
          )}
          {word && (
            <span className={`gauge-word ${figure == null ? 'solo' : ''}`}
              style={{ fontSize: figure == null ? Math.round(size * 0.11) : smallSize, color: wordColor || 'var(--text-secondary)' }}>
              {word}
            </span>
          )}
          {sub && <span className="gauge-sub" style={{ fontSize: smallSize }}>{sub}</span>}
        </div>
      </div>
      {label && <span className="gauge-label">{label}</span>}

      <style>{`
        .gauge { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
        .gauge-dial { position: relative; flex-shrink: 0; }
        .gauge-center {
          position: absolute; left: 0; right: 0; transform: translateY(-50%);
          display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center;
        }
        .gauge-num { font-weight: 800; color: var(--text-primary); line-height: 1; letter-spacing: -0.02em; white-space: nowrap; }
        .gauge-unit { font-size: 0.55em; font-weight: 700; margin-left: 1px; }
        .gauge-word { font-weight: 700; line-height: 1.1; text-transform: lowercase; }
        .gauge-word.solo { text-transform: none; }
        .gauge-sub { font-weight: 500; color: var(--text-muted); line-height: 1.2; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .gauge-label { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); text-align: center; line-height: 1.3; }
      `}</style>
    </div>
  )
}
