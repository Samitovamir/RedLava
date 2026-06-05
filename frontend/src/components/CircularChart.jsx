import { motion } from 'framer-motion'

/*
  Круговая диаграмма (пончик) с процентом.
  props: value (0–100), label, sublabel, color, size, centerText
*/
export default function CircularChart({ value, label, sublabel, color = 'var(--primary)', size = 130, centerText }) {
  const stroke = 11
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(100, Math.max(0, value)) / 100)

  return (
    <div className="cc" style={{ width: size }}>
      <div className="cc-ring" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="var(--bg-secondary)" strokeWidth={stroke}
          />
          <motion.circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: 'easeOut' }}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="cc-center">
          <span className="cc-value">{centerText ?? `${value}%`}</span>
          {sublabel && <span className="cc-sub">{sublabel}</span>}
        </div>
      </div>
      {label && <span className="cc-label">{label}</span>}

      <style>{`
        .cc { display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .cc-ring { position: relative; }
        .cc-center {
          position: absolute; inset: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
        }
        .cc-value { font-size: 22px; font-weight: 700; color: var(--foreground); line-height: 1; }
        .cc-sub { font-size: 11px; color: var(--muted-foreground); margin-top: 3px; }
        .cc-label { font-size: 13px; font-weight: 500; color: var(--muted-foreground); text-align: center; }
      `}</style>
    </div>
  )
}
