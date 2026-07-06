/*
  HP-бар сегодняшнего дня: короткая горизонтальная полоса (ширина = контейнер, обычно
  колонка гейджа). Таймлайн от начала до конца дня, заливка до «сейчас», точки-события
  (пройденные — акцент, будущие — приглушены), белая риска «сейчас».
  props: todays=[{start,title,m(мин)}], nowMin. Только CSS-переменные.
*/
export default function DayProgress({ todays = [], nowMin = 0 }) {
  const times = todays.map(e => e.m).filter(x => x != null)
  const start = Math.min(360, ...(times.length ? times : [360]))   // окно дня 6:00–23:00, расширяется под события
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
