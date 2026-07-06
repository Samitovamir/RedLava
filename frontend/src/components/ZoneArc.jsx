/*
  Универсальный полукруглый гейдж «зоны + маркер» (геометрия StressArc).
  Полукруг, цветные зоны по шкале, белая точка-маркер на значении, центр = число + слово.
  props: value, max, zones=[{from,to,color}] (в единицах шкалы), center, sub, subColor, size
  Только CSS-переменные.
*/
export default function ZoneArc({ value = null, max = 100, zones = [], center, sub, subColor, centerColor, size = 156 }) {
  const stroke = 8, gap = 0.045
  const r = (size - stroke) / 2 - 2, cx = size / 2, cy = size / 2
  const h = Math.round(size * 0.66)
  // Слово в центре (не число) — того же размера, что маленькие подписи-слова в других гейджах
  const wordSize = Math.max(11, Math.round(size * 0.082))
  const isWord = typeof center === 'string' && center.length > 3
  const numSize = isWord ? wordSize : Math.round(size * 0.22)
  const has = value != null
  const norm = v => Math.max(0, Math.min(1, v / max))
  const frac = has ? norm(value) : 0
  const pt = (fr) => { const a = Math.PI - fr * Math.PI; return [cx + r * Math.cos(a), cy - r * Math.sin(a)] }
  const arc = (f0, f1) => { const [x0, y0] = pt(f0), [x1, y1] = pt(f1); return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}` }
  const [mx, my] = pt(frac)

  return (
    <div className="za">
      <div className="za-wrap" style={{ width: size, height: h }}>
        <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`}>
          {zones.map((z, i) => {
            const a = i > 0 ? norm(z.from) + gap : norm(z.from)
            const b = i < zones.length - 1 ? norm(z.to) - gap : norm(z.to)
            return b > a ? <path key={i} d={arc(a, b)} fill="none" stroke={z.color} strokeWidth={stroke} strokeLinecap="round" /> : null
          })}
          {has && (
            <>
              <circle cx={mx} cy={my} r={stroke / 2 + 4} fill="var(--bg-card-top, var(--bg-surface))" />
              <circle cx={mx} cy={my} r={stroke / 2 + 0.5} fill="var(--text-primary)" />
            </>
          )}
        </svg>
        <div className="za-center" style={{ top: size * 0.28 }}>
          <span className="za-val" style={{ fontSize: numSize, color: centerColor || undefined, fontWeight: isWord ? 700 : undefined, textTransform: isWord ? 'lowercase' : undefined }}>{has ? (center ?? value) : '—'}</span>
          {sub && <span className="za-word" style={{ color: subColor || 'var(--accent)', fontSize: wordSize }}>{sub}</span>}
        </div>
      </div>

      <style>{`
        .za { display: flex; flex-direction: column; align-items: center; }
        .za-wrap { position: relative; }
        .za-center { position: absolute; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; }
        .za-val { font-weight: 800; color: var(--text-primary); line-height: 1; font-variant-numeric: tabular-nums; }
        .za-word { font-weight: 700; margin-top: 4px; text-transform: lowercase; }
      `}</style>
    </div>
  )
}
