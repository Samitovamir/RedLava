import Icon from './Icon.jsx'

// Единая шапка раздела: заголовок + подзаголовок + действия (справа) + табы (ниже).
export default function SectionHeader({ title, subtitle, actions, tabs, icon, className = '' }) {
  return (
    <div className={['ds-section-header', className].filter(Boolean).join(' ')}>
      <div className="ds-sh__row">
        <div className="ds-sh__titles">
          <h1 className="ds-sh__title">
            {icon && <Icon name={typeof icon === 'string' ? icon : undefined} icon={typeof icon !== 'string' ? icon : undefined} size={22} />}
            {title}
          </h1>
          {subtitle && <span className="ds-sh__sub">{subtitle}</span>}
        </div>
        {actions && <div className="ds-sh__actions">{actions}</div>}
      </div>
      {tabs && <div className="ds-sh__tabs">{tabs}</div>}
      <style>{`
        .ds-section-header{ display:flex; flex-direction:column; gap:14px; margin-bottom:8px; }
        .ds-sh__row{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
        .ds-sh__titles{ display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; }
        .ds-sh__title{ display:inline-flex; align-items:center; gap:8px; font-size:24px; font-weight:700; color:var(--foreground); }
        .ds-sh__sub{ font-size:14px; color:var(--text-muted); }
        .ds-sh__actions{ display:flex; align-items:center; gap:8px; }
        .ds-sh__tabs{ display:flex; gap:8px; }
      `}</style>
    </div>
  )
}
