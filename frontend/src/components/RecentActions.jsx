import { useNavigate } from 'react-router-dom'
import { useHistory } from '../context/HistoryContext.jsx'
import { useT } from '../context/LanguageContext.jsx'

/*
  Последние действия помощника — компактная карточка для колонки «Помощник»
  (раскладка «Командный центр»). Полный журнал остаётся на /history.
*/
export default function RecentActions({ limit = 4 }) {
  const navigate = useNavigate()
  const { entries } = useHistory()
  const t = useT({
    ru: { title: 'Последние действия', empty: 'Действий пока нет', all: 'весь журнал →' },
    en: { title: 'Recent actions', empty: 'No actions yet', all: 'full log →' },
  })

  const items = [...entries]
    .sort((a, b) => (b.datetime || '').localeCompare(a.datetime || ''))
    .slice(0, limit)
  const timeOf = (dt) => (dt || '').split(' ')[1] || ''

  return (
    <div className="card recent-actions">
      <div className="ra-head">
        <span className="ra-title">{t.title}</span>
        <button className="ra-all" onClick={() => navigate('/history')}>{t.all}</button>
      </div>
      {items.length === 0 ? (
        <div className="ra-empty">{t.empty}</div>
      ) : (
        <div className="ra-list">
          {items.map((a) => (
            <button key={a.id} className="ra-item" onClick={() => navigate('/history')}>
              <span className={`ra-dot ${a.status || 'done'}`} aria-hidden="true" />
              <span className="ra-text">{a.title}</span>
              <span className="ra-time">{timeOf(a.datetime)}</span>
            </button>
          ))}
        </div>
      )}

      <style>{`
        .recent-actions { display: flex; flex-direction: column; gap: 10px; padding: 16px 18px; }
        .ra-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
        .ra-title { font-size: 13px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; }
        .ra-all {
          background: none; border: none; padding: 0; cursor: pointer;
          font-family: inherit; font-size: 12.5px; color: var(--muted);
          transition: color var(--dur-fast) var(--ease);
        }
        .ra-all:hover { color: var(--accent); }
        .ra-empty { font-size: 13.5px; color: var(--text-muted); }
        .ra-list { display: flex; flex-direction: column; }
        .ra-item {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 2px; border: none; background: none; cursor: pointer;
          font-family: inherit; text-align: left;
          border-bottom: 1px solid var(--border);
          transition: background var(--dur-fast) var(--ease);
        }
        .ra-item:last-child { border-bottom: none; }
        .ra-item:hover .ra-text { color: var(--foreground); }
        .ra-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--status-ok); }
        .ra-dot.pending { background: var(--status-warn); }
        .ra-dot.failed { background: var(--status-crit); }
        .ra-text {
          flex: 1; min-width: 0;
          font-size: 13.5px; color: var(--text-body);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          transition: color var(--dur-fast) var(--ease);
        }
        .ra-time { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; flex-shrink: 0; }
      `}</style>
    </div>
  )
}
