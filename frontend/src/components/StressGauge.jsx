/*
  Спидометр стресса (полукруг-заливка, без стрелки) — в стиле гейджей калорий/FODMAP.
  Шкала 0–100 (Garmin), ниже — лучше. Дуга заливается цветом текущего уровня;
  число и словесная оценка — по центру под дугой. value=null → нейтральное «—».
  Только CSS-переменные.
*/

function level(v) {
  if (v <= 25) return { w: 'Покой', c: 'var(--status-ok)' }
  if (v <= 50) return { w: 'Низкий', c: 'var(--status-warn)' }
  if (v <= 75) return { w: 'Средний', c: 'var(--status-warn)' }
  return { w: 'Высокий', c: 'var(--status-crit)' }
}

export default function StressGauge({ value = null, size = 148, label = 'Стресс' }) {
  const stroke = 11, r = (size - stroke) / 2, cx = size / 2, cy = size / 2, h = size / 2 + stroke / 2 + 6
  const has = value != null
  const frac = has ? Math.max(0, Math.min(1, value / 100)) : 0
  const meta = has ? level(value) : null
  const pt = (fr) => { const a = Math.PI - fr * Math.PI; return [cx + r * Math.cos(a), cy - r * Math.sin(a)] }
  const [sx, sy] = pt(0), [ex, ey] = pt(1), [fx, fy] = pt(frac)

  return (
    <div className="sg">
      <div className="sg-wrap" style={{ width: size, height: h }}>
        <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`}>
          {/* фон-дуга (видима на любой теме) */}
          <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} fill="none" stroke="color-mix(in srgb, var(--text-faint) 32%, transparent)" strokeWidth={stroke} strokeLinecap="round" />
          {/* заполнение до текущего уровня */}
          {has && <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${fx} ${fy}`} fill="none" stroke={meta.c} strokeWidth={stroke} strokeLinecap="round" />}
        </svg>
        <div className="sg-center" style={{ top: size * 0.34 }}>
          <span className="sg-val">{has ? value : '—'}</span>
          {has && <span className="sg-word" style={{ color: meta.c }}>{meta.w}</span>}
        </div>
      </div>
      {label && <span className="sg-lbl">{label}</span>}

      <style>{`
        .sg { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .sg-wrap { position: relative; }
        .sg-center { position: absolute; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; }
        .sg-val { font-size: 28px; font-weight: 800; color: var(--text-primary); line-height: 1; font-variant-numeric: tabular-nums; }
        .sg-word { font-size: 12px; font-weight: 700; margin-top: 3px; }
        .sg-lbl { font-size: 12px; font-weight: 600; color: var(--muted-foreground); }
      `}</style>
    </div>
  )
}
