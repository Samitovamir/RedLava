import { motion } from 'framer-motion'
import { DUR, EASE } from '../motion.js'

/*
  Horizontal "how much" bars, drawn one way everywhere: recovery against strain, training-load
  focus, macros, intensity minutes.

  All rows share one grid, so the tracks start and end at the same x and have one length even
  when the values on the right differ in width ("78%" next to "12.4 of 21"). Before, each row
  sized its own columns and the bars came out different lengths.

  rows: [{ label?, pct (0–100), color, text? }] — text may be a node (a muted "/ 150 g" tail).
*/
export default function Meters({ rows }) {
  const labelled = rows.some(r => r.label)
  const valued = rows.some(r => r.text != null)
  const cols = [labelled && 'max-content', 'minmax(0, 1fr)', valued && 'max-content'].filter(Boolean).join(' ')

  return (
    <div className="meters" style={{ gridTemplateColumns: cols }}>
      {rows.map((r, i) => (
        <div className="meter" key={r.key ?? i}>
          {labelled && <span className="meter-label">{r.label}</span>}
          <span className="meter-track">
            <motion.span className="meter-fill" style={{ background: r.color || 'var(--accent)' }}
              initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, r.pct || 0))}%` }}
              transition={{ duration: DUR.slower * 2, ease: EASE, delay: i * 0.05 }} />
          </span>
          {valued && <span className="meter-value">{r.text}</span>}
        </div>
      ))}

      <style>{`
        .meters { display: grid; column-gap: 14px; row-gap: 12px; align-items: center; min-width: 0; }
        .meter { display: contents; }
        .meter-label { font-size: 13px; font-weight: 600; color: var(--text-secondary); white-space: nowrap; }
        .meter-track { position: relative; display: block; height: 8px; border-radius: 999px; overflow: hidden;
          background: color-mix(in srgb, var(--text-faint) 22%, transparent); }
        .meter-fill { display: block; height: 100%; border-radius: 999px; }
        .meter-value { font-size: 13.5px; font-weight: 700; color: var(--text-primary); text-align: right;
          font-variant-numeric: tabular-nums; white-space: nowrap; }
        .meter-value i { font-style: normal; font-weight: 500; font-size: 0.85em; color: var(--text-muted); }
      `}</style>
    </div>
  )
}
