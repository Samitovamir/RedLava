/*
  Верхняя сводка «Питания»: калории — крупная полусфера-гейдж, рядом (если включён
  FODMAP) — светофор-циферблат с уровнем; ниже — Б/Ж/У лёгкими полосками. Компактно,
  в стиле гейджей раздела «Здоровье». Только CSS-переменные.
*/

const FOD = {
  low: { c: 'var(--status-ok)', w: 'Низкий', frac: 0.16 },
  mod: { c: 'var(--status-warn)', w: 'Умеренный', frac: 0.5 },
  high: { c: 'var(--status-crit)', w: 'Высокий', frac: 0.84 },
}

// Полусфера-гейдж заполнения (калории)
function SemiGauge({ pct, centerText, unit, color, size = 148, label }) {
  const stroke = 10, r = (size - stroke) / 2, cx = size / 2, cy = size / 2, h = size / 2 + stroke / 2 + 4
  const f = Math.max(0, Math.min(1, pct / 100))
  const pt = (fr) => { const a = Math.PI - fr * Math.PI; return [cx + r * Math.cos(a), cy - r * Math.sin(a)] }
  const [sx, sy] = pt(0), [ex, ey] = pt(1), [fx, fy] = pt(f)
  return (
    <div className="ns-g">
      <div className="ns-wrap" style={{ width: size, height: h }}>
        <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`}>
          <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} fill="none" stroke="var(--bg-tile)" strokeWidth={stroke} strokeLinecap="round" />
          <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${fx} ${fy}`} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
        </svg>
        <div className="ns-center" style={{ top: size * 0.24 }}>
          <span className="ns-val" style={{ fontSize: Math.round(size * 0.2) }}>{centerText}</span>
          {unit && <span className="ns-unit">{unit}</span>}
        </div>
      </div>
      {label && <span className="ns-lbl">{label}</span>}
    </div>
  )
}

// Светофор-циферблат FODMAP (3 зоны + стрелка). band=null → нейтральное состояние («—», без стрелки).
function FodmapDial({ band, size = 120 }) {
  const stroke = 10, r = (size - stroke) / 2, cx = size / 2, cy = size / 2, h = size / 2 + stroke / 2 + 4
  const pt = (fr) => { const a = Math.PI - fr * Math.PI; return [cx + r * Math.cos(a), cy - r * Math.sin(a)] }
  const seg = (f0, f1) => { const [x0, y0] = pt(f0), [x1, y1] = pt(f1); return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}` }
  const zones = [['low', 'var(--status-ok)', 0, 1 / 3], ['mod', 'var(--status-warn)', 1 / 3, 2 / 3], ['high', 'var(--status-crit)', 2 / 3, 1]]
  const gap = 0.028
  const meta = band ? FOD[band] : null
  const needle = meta ? (() => { const R = r * 0.58, na = Math.PI - meta.frac * Math.PI; return [cx + R * Math.cos(na), cy - R * Math.sin(na)] })() : null
  return (
    <div className="ns-g">
      <div className="ns-wrap" style={{ width: size, height: h }}>
        <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`}>
          {zones.map(([id, col, f0, f1]) => {
            const a = f0 > 0 ? f0 + gap : f0 + 0.01, b = f1 < 1 ? f1 - gap : f1 - 0.01
            const op = !band ? 0.4 : (id === band ? 1 : 0.22)
            return <path key={id} d={seg(a, b)} fill="none" stroke={col} strokeWidth={stroke} strokeLinecap="round" opacity={op} />
          })}
          {needle && <>
            <line x1={cx} y1={cy} x2={needle[0]} y2={needle[1]} stroke="var(--text-primary)" strokeWidth={2.4} strokeLinecap="round" />
            <circle cx={cx} cy={cy} r={3.4} fill="var(--text-primary)" />
          </>}
        </svg>
        <div className="ns-word" style={{ color: meta ? meta.c : 'var(--text-muted)' }}>{meta ? meta.w : '—'}</div>
      </div>
      <span className="ns-lbl">FODMAP</span>
    </div>
  )
}

export default function NutriSummary({ eatenK, target, remK, over, pct, eatenP, eatenF, eatenC, fodmapOn, fodmapBand, fodmapReason, t, onOpenBreakdown }) {
  const macros = [
    { l: t.protein, e: eatenP, g: target.protein, c: 'var(--c-steel)' },
    { l: t.fat, e: eatenF, g: target.fat, c: 'var(--c-amber)' },
    { l: t.carb, e: eatenC, g: target.carb, c: 'var(--c-sage)' },
  ]
  const showDial = fodmapOn   // светофор всегда виден при включённой диете (без данных — нейтральный «—»)
  return (
    <div className="card ns-summary">
      <div className={`ns-heroes ${onOpenBreakdown ? 'ns-click' : ''}`}
        onClick={onOpenBreakdown} role={onOpenBreakdown ? 'button' : undefined}>
        <SemiGauge pct={pct} centerText={eatenK} unit={`/ ${target.kcal} ${t.kcal}`}
          color={over ? 'var(--status-warn)' : 'var(--accent)'} size={showDial ? 132 : 150} label={t.kcal} />
        {showDial && <FodmapDial band={fodmapBand} size={116} />}
      </div>
      <div className={`ns-left ${over ? 'over' : ''}`}>
        {over ? `${t.over} ${eatenK - target.kcal}` : `${t.left} ${remK}`} {t.kcal}
      </div>
      {showDial && fodmapReason && (
        <div className="ns-fodreason">
          <span className="ns-dot" style={{ background: (FOD[fodmapBand] || FOD.low).c }} />
          <span style={{ color: (FOD[fodmapBand] || FOD.low).c, fontWeight: 700 }}>{(FOD[fodmapBand] || FOD.low).w} FODMAP</span>
          <span className="muted"> — {fodmapReason}</span>
        </div>
      )}
      <div className="ns-bars">
        {macros.map((m, i) => {
          const p = m.g > 0 ? Math.min(100, Math.round(m.e / m.g * 100)) : 0
          return (
            <div className="ns-bar" key={i}>
              <span className="ns-bar-l">{m.l}</span>
              <span className="ns-bar-track"><span className="ns-bar-fill" style={{ width: `${p}%`, background: m.c }} /></span>
              <span className="ns-bar-v">{Math.round(m.e)}<i>/{m.g} {t.g}</i></span>
            </div>
          )
        })}
      </div>

      {onOpenBreakdown && eatenK > 0 && (
        <button className="ns-details" onClick={onOpenBreakdown} type="button">
          Что съедено сегодня{fodmapOn ? ' · FODMAP по блюдам' : ''} →
        </button>
      )}

      <style>{`
        .ns-summary { display: flex; flex-direction: column; gap: 12px; }
        .ns-heroes { display: flex; align-items: flex-end; justify-content: space-around; gap: 12px; margin-top: 4px; border-radius: 12px; }
        .ns-heroes.ns-click { cursor: pointer; }
        .ns-details { align-self: center; background: none; border: none; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 600; color: var(--accent); padding: 4px 8px; }
        .ns-details:hover { text-decoration: underline; }
        .ns-g { display: flex; flex-direction: column; align-items: center; gap: 3px; }
        .ns-lbl { font-size: 11.5px; color: var(--text-secondary); font-weight: 500; text-transform: uppercase; letter-spacing: .04em; }
        .ns-wrap { position: relative; }
        .ns-center { position: absolute; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; }
        .ns-val { font-weight: 800; color: var(--text-primary); line-height: 1; letter-spacing: -.02em; }
        .ns-unit { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
        .ns-word { font-size: 15px; font-weight: 800; line-height: 1; margin-top: -2px; }
        .ns-left { text-align: center; font-size: 13px; font-weight: 600; color: var(--text-secondary); }
        .ns-left.over { color: var(--status-warn); }
        .ns-fodreason { display: flex; align-items: center; gap: 7px; justify-content: center; font-size: 12.5px; flex-wrap: wrap; }
        .ns-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
        .ns-bars { display: flex; flex-direction: column; gap: 11px; margin-top: 4px; }
        .ns-bar { display: grid; grid-template-columns: 62px 1fr auto; align-items: center; gap: 11px; }
        .ns-bar-l { font-size: 12.5px; color: var(--text-secondary); }
        .ns-bar-track { height: 8px; border-radius: 999px; background: var(--bg-tile); overflow: hidden; }
        .ns-bar-fill { display: block; height: 100%; border-radius: 999px; }
        .ns-bar-v { font-size: 12.5px; font-weight: 700; color: var(--text-primary); min-width: 56px; text-align: right; font-variant-numeric: tabular-nums; }
        .ns-bar-v i { font-style: normal; color: var(--text-muted); font-weight: 500; font-size: 11px; }
      `}</style>
    </div>
  )
}
