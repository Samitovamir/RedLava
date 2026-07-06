/*
  Здоровье: восстановление (Whoop recovery 0–100) + нагрузка (strain 0–21) в ОДНОМ полукруге.
  Три варианта совмещения (выбор владельца):
   • variant 1 — две концентрические дуги (внешняя восст., внутренняя нагрузка)
   • variant 2 — две половины (левая нагрузка, правая восстановление)
   • variant 3 — баланс: один маркер на шкале «перегруз ↔ запас»
  Только CSS-переменные, тёмная тема.
  props: variant(1|2|3), recovery, strain, strainMax=21, size
*/
const recColor = v => v == null ? 'var(--accent)' : v >= 67 ? 'var(--status-ok)' : v >= 34 ? 'var(--status-warn)' : 'var(--status-crit)'
const FAINT = 'color-mix(in srgb, var(--text-faint) 28%, transparent)'

export default function HealthGauge({ variant = 1, recovery = null, strain = null, strainMax = 21, size = 156 }) {
  const stroke = 8
  const cx = size / 2, cy = size / 2
  const rOuter = (size - stroke) / 2 - 2
  const h = Math.round(size * 0.66)
  const numSize = Math.round(size * 0.2)
  const subSize = Math.max(10, Math.round(size * 0.072))
  const recFrac = recovery != null ? Math.max(0, Math.min(1, recovery / 100)) : 0
  const strFrac = strain != null ? Math.max(0, Math.min(1, strain / strainMax)) : 0
  const loadPct = strain != null ? Math.round(strFrac * 100) : null

  const pt = (frac, radius) => { const a = Math.PI - frac * Math.PI; return [cx + radius * Math.cos(a), cy - radius * Math.sin(a)] }
  const arc = (f0, f1, radius) => { const [x0, y0] = pt(f0, radius), [x1, y1] = pt(f1, radius); return `M ${x0} ${y0} A ${radius} ${radius} 0 0 1 ${x1} ${y1}` }

  let body, center
  if (variant === 1) {
    // Две концентрические дуги
    const rInner = rOuter - (stroke + 7)
    body = (
      <>
        <path d={arc(0, 1, rOuter)} fill="none" stroke={FAINT} strokeWidth={stroke} strokeLinecap="round" />
        {recovery != null && recFrac > 0 && <path d={arc(0, recFrac, rOuter)} fill="none" stroke={recColor(recovery)} strokeWidth={stroke} strokeLinecap="round" />}
        <path d={arc(0, 1, rInner)} fill="none" stroke={FAINT} strokeWidth={stroke} strokeLinecap="round" />
        {strain != null && strFrac > 0 && <path d={arc(0, strFrac, rInner)} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round" />}
      </>
    )
    center = (
      <div className="hg-center hg-center-stack" style={{ top: size * 0.42, fontSize: subSize }}>
        <span className="hg-line"><b style={{ color: recColor(recovery) }}>{recovery ?? '—'}%</b> восст.</span>
        <span className="hg-line"><b style={{ color: 'var(--accent)' }}>{strain ?? '—'}</b> нагр.</span>
      </div>
    )
  } else if (variant === 2) {
    // Две половины: левая — нагрузка, правая — восстановление
    body = (
      <>
        <path d={arc(0, 0.5, rOuter)} fill="none" stroke={FAINT} strokeWidth={stroke} strokeLinecap="round" />
        <path d={arc(0.5, 1, rOuter)} fill="none" stroke={FAINT} strokeWidth={stroke} strokeLinecap="round" />
        {strain != null && strFrac > 0 && <path d={arc(0.5 - strFrac * 0.5, 0.5, rOuter)} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round" />}
        {recovery != null && recFrac > 0 && <path d={arc(0.5, 0.5 + recFrac * 0.5, rOuter)} fill="none" stroke={recColor(recovery)} strokeWidth={stroke} strokeLinecap="round" />}
      </>
    )
    center = (
      <div className="hg-center hg-center-split" style={{ top: size * 0.34 }}>
        <span className="hg-half">
          <span className="hg-half-v" style={{ color: 'var(--accent)', fontSize: subSize * 1.5 }}>{strain ?? '—'}</span>
          <span className="hg-half-l" style={{ fontSize: subSize }}>нагр</span>
        </span>
        <span className="hg-half">
          <span className="hg-half-v" style={{ color: recColor(recovery), fontSize: subSize * 1.5 }}>{recovery ?? '—'}<span className="hg-u">%</span></span>
          <span className="hg-half-l" style={{ fontSize: subSize }}>восст</span>
        </span>
      </div>
    )
  } else {
    // Баланс: маркер на шкале перегруз ↔ запас
    const balDiff = (recovery != null && loadPct != null) ? recovery - loadPct : 0
    const pos = Math.max(0, Math.min(1, (balDiff + 100) / 200))
    const verdict = balDiff >= 15 ? 'запас' : balDiff <= -15 ? 'перегруз' : 'баланс'
    const vColor = balDiff >= 15 ? 'var(--status-ok)' : balDiff <= -15 ? 'var(--status-crit)' : 'var(--status-warn)'
    const [mx, my] = pt(pos, rOuter)
    const zones = [{ f0: 0, f1: 0.4, c: 'var(--status-crit)' }, { f0: 0.4, f1: 0.6, c: 'var(--status-warn)' }, { f0: 0.6, f1: 1, c: 'var(--status-ok)' }]
    body = (
      <>
        {zones.map((z, i) => {
          const gap = 0.03
          const a = i > 0 ? z.f0 + gap : z.f0, bb = i < zones.length - 1 ? z.f1 - gap : z.f1
          return <path key={i} d={arc(a, bb, rOuter)} fill="none" stroke={z.c} strokeWidth={stroke} strokeLinecap="round" />
        })}
        <circle cx={mx} cy={my} r={stroke / 2 + 4} fill="var(--bg-card-top, var(--bg-surface))" />
        <circle cx={mx} cy={my} r={stroke / 2 + 0.5} fill="var(--text-primary)" />
      </>
    )
    center = (
      <div className="hg-center" style={{ top: size * 0.32 }}>
        <span className="hg-word" style={{ color: vColor, fontSize: Math.round(size * 0.13) }}>{verdict}</span>
        <span className="hg-sub" style={{ fontSize: subSize }}>восст {recovery ?? '—'} · нагр {strain ?? '—'}</span>
      </div>
    )
  }

  return (
    <div className="hg">
      <div className="hg-wrap" style={{ width: size, height: h }}>
        <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`}>{body}</svg>
        {center}
      </div>
      <style>{`
        .hg { display: flex; flex-direction: column; align-items: center; }
        .hg-wrap { position: relative; }
        .hg-center { position: absolute; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; }
        .hg-val { font-weight: 800; color: var(--text-primary); line-height: 1; font-variant-numeric: tabular-nums; }
        .hg-u { font-size: 0.5em; font-weight: 700; }
        .hg-sub { font-weight: 600; color: var(--text-muted); margin-top: 4px; white-space: nowrap; }
        .hg-word { font-weight: 800; line-height: 1; }
        .hg-center-split { flex-direction: row; gap: 16px; justify-content: center; }
        .hg-half { display: flex; flex-direction: column; align-items: center; gap: 1px; }
        .hg-half-v { font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1; }
        .hg-half-l { color: var(--text-muted); font-weight: 600; }
        .hg-center-stack { gap: 2px; line-height: 1.15; }
        .hg-line { color: var(--text-muted); font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .hg-line b { font-weight: 800; }
      `}</style>
    </div>
  )
}
