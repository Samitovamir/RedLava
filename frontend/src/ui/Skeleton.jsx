// Загрузочный плейсхолдер. variant: text|rect|circle|ring|chart.
// Темо-зависимый shimmer (--bg-tile → --bg-surface).
export default function Skeleton({ variant = 'text', lines = 1, w, h, className = '', style }) {
  const radius = variant === 'circle' || variant === 'ring' ? '50%' : 'var(--radius-sm)'
  const dims = {
    text: { height: 12, width: w || '100%' },
    rect: { height: h || 80, width: w || '100%' },
    circle: { height: h || 40, width: w || 40 },
    ring: { height: h || 96, width: w || 96 },
    chart: { height: h || 140, width: w || '100%' },
  }[variant] || { height: 12, width: '100%' }
  const count = variant === 'text' ? lines : 1
  return (
    <div className={['ds-skel-wrap', className].filter(Boolean).join(' ')} style={style}>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="ds-skel"
          style={{
            ...dims,
            borderRadius: radius,
            width: variant === 'text' && i === count - 1 && count > 1 ? '70%' : dims.width,
          }}
        />
      ))}
      <style>{`
        .ds-skel-wrap{ display:flex; flex-direction:column; gap:8px; }
        .ds-skel{ display:block; background:linear-gradient(90deg, var(--bg-tile) 25%, var(--bg-surface) 37%, var(--bg-tile) 63%); background-size:400% 100%; animation:ds-shimmer 1.4s ease infinite; }
        @keyframes ds-shimmer{ 0%{ background-position:100% 0 } 100%{ background-position:-100% 0 } }
      `}</style>
    </div>
  )
}
