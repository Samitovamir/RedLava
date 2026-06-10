import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Home, CalendarDays, HeartPulse, UtensilsCrossed, Mail, History as HistoryIcon,
  Settings, MoreHorizontal,
} from 'lucide-react'
import { useLang } from '../context/LanguageContext.jsx'

/*
  Навигация (CarPlay-рельс):
  - Десктоп: компактный рельс 72px; при наведении плавно раскрывается до 240px
    ПОВЕРХ контента (оверлей, контент не дёргается); клик по логотипу закрепляет
    раскрытое состояние (localStorage), тогда контент уезжает вправо
    (html[data-nav-pinned] → margin-left в index.css).
  - Мобайл (≤640px): рельс скрыт, вместо него нижняя таб-панель: 4 главных
    раздела + «Ещё» (лист с остальными и Настройками).
*/

const ITEMS = [
  { path: '/', ru: 'Главная', en: 'Home', Ico: Home },
  { path: '/schedule', ru: 'Расписание', en: 'Schedule', Ico: CalendarDays },
  { path: '/health', ru: 'Здоровье', en: 'Health', Ico: HeartPulse },
  { path: '/nutrition', ru: 'Питание', en: 'Nutrition', Ico: UtensilsCrossed },
  { path: '/mail', ru: 'Письма', en: 'Mail', Ico: Mail },
  { path: '/history', ru: 'История', en: 'History', Ico: HistoryIcon },
]
const SETTINGS_ITEM = { path: '/settings', ru: 'Настройки', en: 'Settings', Ico: Settings }
const TAB_ITEMS = ITEMS.slice(0, 4)            // в нижней панели
const MORE_ITEMS = [...ITEMS.slice(4), SETTINGS_ITEM] // в листе «Ещё»

const PIN_KEY = 'albert-nav-pinned'

export default function FluidMenu() {
  const location = useLocation()
  const navigate = useNavigate()
  const { lang } = useLang()
  const [pinned, setPinnedState] = useState(() => {
    try { return localStorage.getItem(PIN_KEY) === '1' } catch { return false }
  })
  const setPinned = () => setPinnedState(v => !v)
  const [hovered, setHovered] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const tIn = useRef(null)
  const tOut = useRef(null)
  const expanded = pinned || hovered

  useEffect(() => {
    try { localStorage.setItem(PIN_KEY, pinned ? '1' : '0') } catch { /* ignore */ }
    // контент уезжает вправо только при закреплённом рельсе
    if (pinned) document.documentElement.setAttribute('data-nav-pinned', '')
    else document.documentElement.removeAttribute('data-nav-pinned')
  }, [pinned])

  // Рельс живёт только в «Классике»: при смене оболочки снимаем сдвиг контента
  useEffect(() => () => document.documentElement.removeAttribute('data-nav-pinned'), [])

  // задержки раскрытия/закрытия — чтобы рельс не мерцал при проносе курсора
  const enter = () => { clearTimeout(tOut.current); tIn.current = setTimeout(() => setHovered(true), 50) }
  const leave = () => { clearTimeout(tIn.current); tOut.current = setTimeout(() => setHovered(false), 120) }
  useEffect(() => () => { clearTimeout(tIn.current); clearTimeout(tOut.current) }, [])

  const label = (it) => (lang === 'en' ? it.en : it.ru)
  const isActive = (p) => (p === '/' ? location.pathname === '/' : location.pathname.startsWith(p))
  const go = (p) => { navigate(p); setMoreOpen(false) }

  const railItem = (it, idx) => {
    const active = isActive(it.path)
    return (
      <button
        key={it.path}
        className={`nav-item ${active ? 'active' : ''}`}
        onClick={() => go(it.path)}
        title={expanded ? undefined : label(it)}
      >
        {active && (
          <motion.span
            className="nav-active-bar"
            layoutId="navActiveBar"
            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
          />
        )}
        <span className="nav-ico"><it.Ico size={21} strokeWidth={1.7} /></span>
        <AnimatePresence>
          {expanded && (
            <motion.span
              className="nav-label"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{ duration: 0.16, delay: hovered && !pinned ? idx * 0.025 : 0 }}
            >
              {label(it)}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    )
  }

  const tabItem = (it) => {
    const active = isActive(it.path)
    return (
      <button key={it.path} className={`tab-item ${active ? 'active' : ''}`} onClick={() => go(it.path)}>
        <it.Ico size={22} strokeWidth={active ? 2 : 1.7} />
        <span>{label(it)}</span>
      </button>
    )
  }
  const moreActive = MORE_ITEMS.some((it) => isActive(it.path))

  return (
    <>
      {/* ── Десктоп: рельс ───────────────────────────────────────────── */}
      <nav
        className={`fluid-menu ${expanded ? 'expanded' : ''} ${pinned ? 'pinned' : ''}`}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={enter}
        onBlur={leave}
      >
        <button
          className="fluid-logo"
          onClick={setPinned}
          title={pinned
            ? (lang === 'en' ? 'Unpin menu' : 'Открепить меню')
            : (lang === 'en' ? 'Pin menu' : 'Закрепить меню')}
        >
          <span className="fluid-logo-mark">А</span>
          <AnimatePresence>
            {expanded && (
              <motion.span
                className="fluid-logo-name"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.16 }}
              >
                владелец
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        <div className="fluid-menu-inner">
          {ITEMS.map(railItem)}
        </div>

        <div className="fluid-menu-bottom">
          {railItem(SETTINGS_ITEM, ITEMS.length)}
        </div>
      </nav>

      {/* ── Мобайл: нижняя таб-панель ────────────────────────────────── */}
      <nav className="mobile-tabbar">
        {TAB_ITEMS.map(tabItem)}
        <button className={`tab-item ${moreOpen || moreActive ? 'active' : ''}`} onClick={() => setMoreOpen((v) => !v)}>
          <MoreHorizontal size={22} strokeWidth={1.7} />
          <span>{lang === 'en' ? 'More' : 'Ещё'}</span>
        </button>
      </nav>
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              className="tab-more-scrim"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              className="tab-more card"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            >
              {MORE_ITEMS.map((it) => (
                <button key={it.path} className={`tab-more-item ${isActive(it.path) ? 'active' : ''}`} onClick={() => go(it.path)}>
                  <it.Ico size={20} strokeWidth={1.7} />
                  <span>{label(it)}</span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style>{`
        .fluid-menu {
          position: fixed;
          left: 0; top: 0;
          width: var(--sidebar-width);
          height: 100vh;
          background: linear-gradient(180deg, var(--bg-card-top, var(--bg-surface)), var(--bg-card-bot, var(--bg-surface)));
          border-right: 1px solid var(--border-soft);
          z-index: 100;
          display: flex;
          flex-direction: column;
          padding: 18px 14px;
          gap: 22px;
          overflow: hidden;
          transition: width 0.22s var(--ease), box-shadow 0.22s var(--ease);
        }
        .fluid-menu.expanded {
          width: var(--sidebar-width-expanded);
        }
        /* раскрытие по hover — оверлей поверх контента */
        .fluid-menu.expanded:not(.pinned) {
          box-shadow: 24px 0 60px -28px rgba(0,0,0,0.55);
        }

        .fluid-logo {
          display: flex; align-items: center; gap: 12px;
          padding: 0; border: none; background: transparent; cursor: pointer;
          flex-shrink: 0; font-family: inherit;
        }
        .fluid-logo-mark {
          width: 44px; height: 44px; flex-shrink: 0;
          border-radius: 12px;
          background: linear-gradient(180deg, var(--accent-btn-top), var(--accent-btn-bot));
          color: var(--on-accent);
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 19px;
          box-shadow: inset 0 1.5px 0.5px rgba(255,255,255,0.18), var(--shadow-btn);
        }
        .fluid-logo-name {
          font-size: 16px; font-weight: 700; color: var(--text-primary);
          letter-spacing: -0.01em; white-space: nowrap;
        }

        .fluid-menu-inner {
          display: flex; flex-direction: column; gap: 4px;
          margin: auto 0;
          width: 100%;
        }
        .fluid-menu-bottom { width: 100%; }

        .nav-item {
          position: relative;
          display: flex; align-items: center; gap: 12px;
          width: 100%; height: 46px;
          padding: 0 11px;
          border: none; border-radius: 12px;
          background: transparent;
          color: var(--text-muted);
          font-family: inherit; font-size: 14px; font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.18s var(--ease), color 0.18s var(--ease);
        }
        .nav-item:hover { background: var(--bg-tile); color: var(--text-body); }
        .nav-item.active { background: var(--bg-tile); color: var(--text-primary); box-shadow: var(--inset-tile, none); }
        .nav-item.active .nav-ico { color: var(--accent); }
        .nav-ico { display: flex; align-items: center; justify-content: center; width: 22px; flex-shrink: 0; }
        .nav-label { overflow: hidden; text-overflow: ellipsis; }
        .nav-active-bar {
          position: absolute; left: -14px; top: 11px;
          width: 3px; height: 24px;
          background: var(--accent);
          border-radius: 0 2px 2px 0;
        }

        /* ── Мобильная таб-панель ── */
        .mobile-tabbar { display: none; }
        .tab-more-scrim { display: none; }
        .tab-more { display: none; }

        @media (max-width: 640px) {
          .fluid-menu { display: none; }
          .mobile-tabbar {
            position: fixed; left: 0; right: 0; bottom: 0;
            z-index: 300;
            display: flex;
            justify-content: space-around;
            align-items: stretch;
            background: linear-gradient(180deg, var(--bg-card-top, var(--bg-surface)), var(--bg-card-bot, var(--bg-surface)));
            border-top: 1px solid var(--border-soft);
            padding: 6px 4px max(6px, env(safe-area-inset-bottom)) 4px;
          }
          .tab-item {
            display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
            flex: 1; min-height: 50px;
            border: none; background: transparent;
            color: var(--text-muted);
            font-family: inherit; font-size: 10.5px; font-weight: 600;
            cursor: pointer; border-radius: 10px;
          }
          .tab-item.active { color: var(--accent); }
          .tab-more-scrim {
            display: block; position: fixed; inset: 0; z-index: 290;
            background: var(--scrim, rgba(0,0,0,0.5));
          }
          .tab-more {
            display: flex; flex-direction: column; gap: 2px;
            position: fixed; left: 12px; right: 12px;
            bottom: calc(70px + env(safe-area-inset-bottom));
            z-index: 295;
            padding: 10px;
          }
          .tab-more-item {
            display: flex; align-items: center; gap: 12px;
            min-height: 48px; padding: 0 12px;
            border: none; border-radius: 10px; background: transparent;
            color: var(--text-body);
            font-family: inherit; font-size: 14.5px; font-weight: 600;
            cursor: pointer;
          }
          .tab-more-item.active { background: var(--bg-tile); color: var(--accent); }
        }
      `}</style>
    </>
  )
}
