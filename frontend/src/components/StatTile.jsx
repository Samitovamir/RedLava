/*
  Плитка-показатель для дашборда «Один экран»: крупное число + подпись,
  как прибор на панели. Клик ведёт в раздел-источник.
*/
export default function StatTile({ label, value, unit, sub, onClick }) {
  return (
    <button className="card stat-tile" onClick={onClick} type="button">
      <span className="st-label">{label}</span>
      <span className="st-value">
        {value ?? '—'}
        {unit && value != null && <span className="st-unit"> {unit}</span>}
      </span>
      {sub && <span className="st-sub">{sub}</span>}

      <style>{`
        .stat-tile {
          display: flex; flex-direction: column; justify-content: center; gap: 3px;
          padding: 12px 16px; min-width: 0;
          font-family: inherit; text-align: left; cursor: pointer;
          transition: border-color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
        }
        .stat-tile:hover { transform: translateY(-2px); border-color: var(--accent); }
        .st-label {
          font-size: 11.5px; font-weight: 700; color: var(--text-secondary);
          text-transform: uppercase; letter-spacing: 0.06em;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .st-value {
          font-size: 26px; font-weight: 800; color: var(--text-primary);
          letter-spacing: -0.01em; line-height: 1.1;
          font-variant-numeric: tabular-nums;
        }
        .st-unit { font-size: 13px; font-weight: 600; color: var(--text-muted); }
        .st-sub { font-size: 11.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      `}</style>
    </button>
  )
}
