import { motion } from 'framer-motion'

/*
  Гейдж в стиле Garmin: дуга 270° (открыта снизу). Два режима:
   • zones — цветные зоны по шкале + белый маркер на значении (как VO₂max/пульс у Garmin);
   • иначе — серая дорожка + заливка одним цветом до значения (как Шаги/Body Battery).
  Центр: крупное число + подпись; снизу — название. Только CSS-переменные.
  props: value, min=0, max=100, zones=[{from,to,color}], marker, color, centerText, sublabel, label, size
*/
const A0 = 135, SWEEP = 270
const rad = d => (d * Math.PI) / 180

export default function ArcGauge({ value, min = 0, max = 100, zones = null, marker = false, color = 'var(--accent)', centerText, sublabel, label, size = 150 }) {
  const stroke = 11, r = (size - stroke) / 2 - 2, cx = size / 2, cy = size / 2
  const h = size * 0.9
  const norm = v => Math.max(0, Math.min(1, (v - min) / (max - min)))
  const frac = norm(value)
  const pt = (f, radius = r) => { const a = rad(A0 + f * SWEEP); return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)] }
  const arc = (f0, f1, radius = r) => {
    const [x0, y0] = pt(f0, radius), [x1, y1] = pt(f1, radius)
    const large = (f1 - f0) * SWEEP > 180 ? 1 : 0
    return `M ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`
  }
  const [mx, my] = pt(frac)

  return (
    <div className="ag">
      <div className="ag-wrap" style={{ width: size, height: h }}>
        <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`}>
          {/* серая дорожка на всю дугу */}
          <path d={arc(0, 1)} fill="none" stroke="color-mix(in srgb, var(--text-faint) 30%, transparent)" strokeWidth={stroke} strokeLinecap="round" />
          {zones ? (
            // цветные зоны
            zones.map((z, i) => {
              const f0 = norm(z.from), f1 = norm(z.to)
              const gap = 0.02
              const a = i > 0 ? f0 + gap : f0
              const b = i < zones.length - 1 ? f1 - gap : f1
              return b > a ? <path key={i} d={arc(a, b)} fill="none" stroke={z.color} strokeWidth={stroke} strokeLinecap="round" /> : null
            })
          ) : (
            // заливка одним цветом до значения
            <motion.path d={arc(0, Math.max(0.001, frac))} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: 'easeOut' }} />
          )}
          {/* маркер значения (для зон) */}
          {marker && (
            <>
              <circle cx={mx} cy={my} r={stroke / 2 + 3.5} fill="var(--bg-card-top, var(--bg-surface))" />
              <circle cx={mx} cy={my} r={stroke / 2} fill="var(--text-primary)" />
            </>
          )}
        </svg>
        <div className="ag-center" style={{ top: '46%' }}>
          <span className="ag-val">{centerText ?? value}</span>
          {sublabel && <span className="ag-sub">{sublabel}</span>}
        </div>
      </div>
      {label && <span className="ag-lbl">{label}</span>}

      <style>{`
        .ag { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .ag-wrap { position: relative; }
        .ag-center { position: absolute; left: 0; right: 0; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; }
        .ag-val { font-size: 28px; font-weight: 800; color: var(--foreground); line-height: 1; font-variant-numeric: tabular-nums; }
        .ag-sub { font-size: 11.5px; font-weight: 600; color: var(--muted-foreground); margin-top: 3px; text-align: center; }
        .ag-lbl { font-size: 12.5px; font-weight: 600; color: var(--muted-foreground); }
      `}</style>
    </div>
  )
}
