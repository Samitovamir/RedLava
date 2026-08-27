/*
  Полукруглый гейдж стресса с цветными зонами и маркером (выбор пользователя).
  Полукруг (180°, открыт снизу), 3 зоны (покой/средний/высокий = ok/warn/crit),
  тонкая дуга, крупные пробелы между зонами, белая точка-маркер на текущем значении.
  Центр: число + слово уровня. Шкала 0–100 (ниже — лучше). Только CSS-переменные.
  props: value(null→«—»), size
*/
import { useT } from '../context/LanguageContext.jsx'

const STR = {
  en: { rest: 'rest', low: 'low', medium: 'medium', high: 'high' },
  ru: { rest: 'покой', low: 'низкий', medium: 'средний', high: 'высокий' },
}

const ZONES = [
  { from: 0, to: 33, color: 'var(--status-ok)' },
  { from: 33, to: 66, color: 'var(--status-warn)' },
  { from: 66, to: 100, color: 'var(--status-crit)' },
]

function level(v, s) {
  if (v <= 25) return { w: s.rest, c: 'var(--status-ok)' }
  if (v <= 50) return { w: s.low, c: 'var(--status-warn)' }
  if (v <= 75) return { w: s.medium, c: 'var(--status-warn)' }
  return { w: s.high, c: 'var(--status-crit)' }
}

export default function StressArc({ value = null, size = 156 }) {
  const s = useT(STR)
  const stroke = 8               // «уже» заливка
  const gap = 0.06               // крупный пробел между зонами
  const r = (size - stroke) / 2 - 2, cx = size / 2, cy = size / 2
  const h = Math.round(size * 0.66)   // место под число+слово внутри полукруга
  const numSize = Math.round(size * 0.22)
  const wordSize = Math.max(11, Math.round(size * 0.082))
  const has = value != null
  const frac = has ? Math.max(0, Math.min(1, value / 100)) : 0
  const meta = has ? level(value, s) : null
  const pt = (fr) => { const a = Math.PI - fr * Math.PI; return [cx + r * Math.cos(a), cy - r * Math.sin(a)] }
  const arc = (f0, f1) => { const [x0, y0] = pt(f0), [x1, y1] = pt(f1); return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}` }
  const [mx, my] = pt(frac)

  return (
    <div className="sa">
      <div className="sa-wrap" style={{ width: size, height: h }}>
        <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`}>
          {ZONES.map((z, i) => {
            const a = i > 0 ? z.from / 100 + gap : z.from / 100
            const b = i < ZONES.length - 1 ? z.to / 100 - gap : z.to / 100
            return b > a ? <path key={i} d={arc(a, b)} fill="none" stroke={z.color} strokeWidth={stroke} strokeLinecap="round" /> : null
          })}
          {has && (
            <>
              <circle cx={mx} cy={my} r={stroke / 2 + 4} fill="var(--bg-card-top, var(--bg-surface))" />
              <circle cx={mx} cy={my} r={stroke / 2 + 0.5} fill="var(--text-primary)" />
            </>
          )}
        </svg>
        <div className="sa-center" style={{ top: size * 0.28 }}>
          <span className="sa-val" style={{ fontSize: numSize }}>{has ? value : '—'}</span>
          {has && <span className="sa-word" style={{ color: meta.c, fontSize: wordSize }}>{meta.w}</span>}
        </div>
      </div>

      <style>{`
        .sa { display: flex; flex-direction: column; align-items: center; }
        .sa-wrap { position: relative; }
        .sa-center { position: absolute; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; }
        .sa-val { font-weight: 800; color: var(--text-primary); line-height: 1; font-variant-numeric: tabular-nums; }
        .sa-word { font-weight: 700; margin-top: 4px; text-transform: lowercase; }
      `}</style>
    </div>
  )
}
