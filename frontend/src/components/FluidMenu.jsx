import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

const NAV_ITEMS = [
  {
    path: '/',
    label: 'Главная',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    )
  },
  {
    path: '/schedule',
    label: 'Расписание',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    )
  },
  {
    path: '/sport',
    label: 'Спорт',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6.5 6.5 11 11"/>
        <path d="m21 21-1-1"/>
        <path d="m3 3 1 1"/>
        <path d="m18 22 4-4"/>
        <path d="m2 6 4-4"/>
        <path d="m3 10 7-7"/>
        <path d="m14 21 7-7"/>
      </svg>
    )
  },
  {
    path: '/health',
    label: 'Здоровье',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
        <path d="M3.5 12h4l1.5-3 2.5 6 2-4 1 1h4.5"/>
      </svg>
    )
  },
  {
    path: '/history',
    label: 'История',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    )
  }
]

export default function FluidMenu() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav className="fluid-menu">
      <div className="fluid-logo" title="Дашборд владельца">А</div>
      <div className="fluid-menu-inner">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <motion.button
              key={item.path}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
              title={item.label}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <motion.div
                className="nav-icon"
                animate={{
                  color: isActive ? 'var(--accent)' : 'var(--muted)'
                }}
                transition={{ duration: 0.2 }}
              >
                {item.icon}
              </motion.div>
              {isActive && (
                <motion.div
                  className="active-indicator"
                  layoutId="activeIndicator"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
            </motion.button>
          )
        })}
      </div>

      <style>{`
        .fluid-menu {
          position: fixed;
          left: 0;
          top: 0;
          width: var(--sidebar-width);
          height: 100vh;
          background: var(--bg-card);
          border-right: 1px solid var(--border);
          z-index: 100;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px 0;
          gap: 28px;
        }
        .fluid-logo {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: linear-gradient(145deg, var(--accent), #6366f1);
          color: var(--accent-foreground);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 19px;
          box-shadow: 0 4px 14px rgba(129,140,248,0.35);
          flex-shrink: 0;
        }
        .fluid-menu-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          margin: auto 0;
        }
        .nav-item {
          position: relative;
          width: 44px;
          height: 44px;
          border-radius: 12px;
          border: none;
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }
        .nav-item:hover {
          background: var(--bg-secondary);
        }
        .nav-item.active {
          background: rgba(129, 140, 248, 0.12);
        }
        .nav-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .active-indicator {
          position: absolute;
          left: -14px;          /* к левому краю сайдбара */
          top: 10px;            /* (44 - 24) / 2 — по центру иконки, без transform (конфликт с layoutId) */
          width: 3px;
          height: 24px;
          background: var(--accent);
          border-radius: 0 2px 2px 0;
        }
      `}</style>
    </nav>
  )
}
