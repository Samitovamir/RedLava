import { Maximize2 } from 'lucide-react'

/*
  Плитка-виджет хаба («Кокпит»): маленькое окно раздела на главном экране.
  Клик разворачивает раздел поверх хаба (через onOpen → navigate).
*/
export default function HubTile({ icon: Icon, title, sub, onOpen }) {
  return (
    <button className="card hub-tile" onClick={onOpen} type="button">
      <span className="ht-ic"><Icon size={18} strokeWidth={1.7} /></span>
      <span className="ht-text">
        <span className="ht-title">{title}</span>
        {sub && <span className="ht-sub">{sub}</span>}
      </span>
      <span className="ht-max" aria-hidden="true"><Maximize2 size={14} strokeWidth={1.8} /></span>

      <style>{`
        .hub-tile {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 16px; cursor: pointer; text-align: left;
          font-family: inherit; width: 100%;
          transition: border-color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease), box-shadow var(--dur-base) var(--ease);
        }
        .hub-tile:hover { transform: translateY(-2px); border-color: var(--accent); box-shadow: var(--shadow-lift, var(--shadow-card)); }
        .hub-tile:hover .ht-max { opacity: 1; color: var(--accent); }
        .ht-ic {
          flex-shrink: 0; width: 38px; height: 38px; border-radius: 11px;
          display: flex; align-items: center; justify-content: center;
          background: var(--bg-tile); border: 1px solid var(--border-med);
          color: var(--muted);
        }
        .ht-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
        .ht-title { font-size: 14.5px; font-weight: 700; color: var(--text-primary); }
        .ht-sub { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ht-max { flex-shrink: 0; color: var(--text-faint); opacity: 0.6; transition: opacity var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease); }
      `}</style>
    </button>
  )
}
