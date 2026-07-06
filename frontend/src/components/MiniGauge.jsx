/*
  Полукруглый мини-гейдж заливки (в геометрии StressArc: та же высота/толщина/масштаб
  числа) — но одна дуга-заливка до value цветом `color`, без зон. Для доменов, где шкала
  не «хуже/лучше», а просто уровень (загрузка дня, калории и т.п.).
  Центр: крупное число + слово. Шкала 0..max. Только CSS-переменные.
  props: value(null→«—»), max, color, center(строка в центре), sub(слово под числом), size
*/
export default function MiniGauge({ value = null, max = 100, color = 'var(--accent)', center, sub, size = 156 }) {
  const stroke = 8
  const r = (size - stroke) / 2 - 2, cx = size / 2, cy = size / 2
  const h = Math.round(size * 0.66)
  const numSize = Math.round(size * 0.22)
  const wordSize = Math.max(11, Math.round(size * 0.082))
  const has = value != null
  const frac = has ? Math.max(0, Math.min(1, value / max)) : 0
  const pt = (fr) => { const a = Math.PI - fr * Math.PI; return [cx + r * Math.cos(a), cy - r * Math.sin(a)] }
  const [sx, sy] = pt(0), [ex, ey] = pt(1), [fx, fy] = pt(frac)

  return (
    <div className="mg">
      <div className="mg-wrap" style={{ width: size, height: h }}>
        <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`}>
          <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} fill="none" stroke="color-mix(in srgb, var(--text-faint) 30%, transparent)" strokeWidth={stroke} strokeLinecap="round" />
          {has && frac > 0 && <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${fx} ${fy}`} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />}
        </svg>
        <div className="mg-center" style={{ top: size * 0.28 }}>
          <span className="mg-val" style={{ fontSize: numSize }}>{has ? (center ?? value) : '—'}</span>
          {sub && <span className="mg-sub" style={{ color, fontSize: wordSize }}>{sub}</span>}
        </div>
      </div>

      <style>{`
        .mg { display: flex; flex-direction: column; align-items: center; }
        .mg-wrap { position: relative; }
        .mg-center { position: absolute; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; }
        .mg-val { font-weight: 800; color: var(--text-primary); line-height: 1; font-variant-numeric: tabular-nums; }
        .mg-sub { font-weight: 700; margin-top: 4px; text-transform: lowercase; }
      `}</style>
    </div>
  )
}
