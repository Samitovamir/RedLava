/*
  Today's HP bar: a short horizontal strip (as wide as its container, usually the gauge
  column). A timeline from the start to the end of the day, filled up to "now", with event
  dots (past ones in the accent, upcoming ones muted) and a white "now" tick.
  props: todays=[{start,title,m (minutes)}], nowMin. CSS variables only.
*/
export default function DayProgress({ todays = [], nowMin = 0 }) {
  const times = todays.map(e => e.m).filter(x => x != null)
  const start = Math.min(360, ...(times.length ? times : [360]))   // the day window is 6:00–23:00, widened to fit the events
  const end = Math.max(1380, ...(times.length ? times : [1380]))
  const span = Math.max(1, end - start)
  const pos = m => Math.max(0, Math.min(1, (m - start) / span)) * 100
  const fill = pos(nowMin)

  return (
    <div className="dp">
      <div className="dp-track">
        <div className="dp-fill" style={{ width: `${fill}%` }} />
        {todays.map((e, i) => e.m != null && (
          <span key={i} className={`dp-dot ${e.m <= nowMin ? 'done' : ''}`} style={{ left: `${pos(e.m)}%` }} title={`${e.start} ${e.title || ''}`} />
        ))}
        <span className="dp-now" style={{ left: `${fill}%` }} />
      </div>

      <style>{`
        .dp { width: 100%; }
        .dp-track {
          position: relative; width: 100%; height: 6px; border-radius: 999px;
          background: color-mix(in srgb, var(--text-faint) 22%, transparent);
        }
        .dp-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; background: var(--accent); opacity: 0.5; }
        .dp-dot {
          position: absolute; top: 50%; width: 8px; height: 8px; border-radius: 50%;
          transform: translate(-50%, -50%);
          background: color-mix(in srgb, var(--text-faint) 55%, transparent);
          border: 2px solid var(--bg-card-top, var(--bg-surface));
        }
        .dp-dot.done { background: var(--accent); }
        .dp-now {
          position: absolute; top: -3px; width: 2px; height: 12px; border-radius: 2px;
          transform: translateX(-50%); background: var(--text-primary);
        }
      `}</style>
    </div>
  )
}
