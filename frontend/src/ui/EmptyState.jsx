import Icon from './Icon.jsx'

// Пустое состояние: иконка + заголовок + текст + действие (Button).
export default function EmptyState({ icon, title, text, action, className = '' }) {
  return (
    <div className={['ds-empty', className].filter(Boolean).join(' ')}>
      {icon && (
        <div className="ds-empty__icon">
          <Icon name={typeof icon === 'string' ? icon : undefined} icon={typeof icon !== 'string' ? icon : undefined} size={24} color="var(--text-muted)" />
        </div>
      )}
      {title && <div className="ds-empty__title">{title}</div>}
      {text && <p className="ds-empty__text">{text}</p>}
      {action}
      <style>{`
        .ds-empty{ display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; padding:32px 20px; }
        .ds-empty__icon{ width:48px; height:48px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--bg-tile); border:1px solid var(--border-med); margin-bottom:4px; }
        .ds-empty__title{ font-size:15px; font-weight:600; color:var(--text-body); }
        .ds-empty__text{ font-size:13.5px; color:var(--text-muted); line-height:1.5; max-width:340px; margin:0; }
      `}</style>
    </div>
  )
}
