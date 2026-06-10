import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Home from '../pages/Home.jsx'
import Schedule from '../pages/Schedule.jsx'
import Health from '../pages/Health.jsx'
import Nutrition from '../pages/Nutrition.jsx'
import MailPage from '../pages/Mail.jsx'
import History from '../pages/History.jsx'
import Connections from '../pages/Connections.jsx'
import Settings from '../pages/Settings.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import { mskNow } from '../utils/time.js'

/*
  Оболочка «Лента» — ВЕСЬ сайт одной непрерывной прокручиваемой лентой-брифингом.
  Никаких «страниц» и переходов: главы идут друг за другом (сегодня → расписание →
  тело → питание → письма → история → связь → настройки), оглавление сверху плавно
  прокручивает к главе и подсвечивается при скролле (scrollspy).
  Роуты сохранены: navigate('/health') из любого компонента просто прокручивает
  ленту к главе «Тело» — все внутренние ссылки сайта продолжают работать.
*/

const CHAPTERS = [
  { id: 'today', path: '/', ru: 'Сегодня', en: 'Today', El: Home },
  { id: 'schedule', path: '/schedule', ru: 'Расписание', en: 'Schedule', El: Schedule },
  { id: 'health', path: '/health', ru: 'Тело', en: 'Body', El: Health },
  { id: 'nutrition', path: '/nutrition', ru: 'Питание', en: 'Food', El: Nutrition },
  { id: 'mail', path: '/mail', ru: 'Письма', en: 'Mail', El: MailPage },
  { id: 'history', path: '/history', ru: 'Журнал', en: 'Log', El: History },
  { id: 'connections', path: '/connections', ru: 'Связь', en: 'Services', El: Connections },
  { id: 'settings', path: '/settings', ru: 'Настройки', en: 'Settings', El: Settings },
]

const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function chapterForPath(pathname) {
  if (pathname === '/') return CHAPTERS[0]
  if (pathname.startsWith('/sport')) return CHAPTERS.find(c => c.id === 'health')
  return CHAPTERS.find(c => c.path !== '/' && pathname.startsWith(c.path)) || CHAPTERS[0]
}

export default function JournalShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { lang } = useLang()
  const [active, setActive] = useState('today')
  const spyPaused = useRef(false)

  const d = mskNow()
  const dateStr = lang === 'en'
    ? `${MONTHS_EN[d.getMonth()]} ${d.getDate()}`
    : `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`

  // Роут → плавная прокрутка к главе (включая navigate() из глубины компонентов)
  useEffect(() => {
    const ch = chapterForPath(location.pathname)
    setActive(ch.id)
    const el = document.getElementById(`fd-${ch.id}`)
    if (el) {
      spyPaused.current = true
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      const t = setTimeout(() => { spyPaused.current = false }, 900)
      return () => clearTimeout(t)
    }
  }, [location.pathname])

  // Scrollspy: подсветка главы при ручной прокрутке
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      if (spyPaused.current) return
      const vis = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (vis) setActive(vis.target.dataset.chapter)
    }, { rootMargin: '-15% 0px -65% 0px', threshold: [0, 0.1, 0.3] })
    CHAPTERS.forEach(c => {
      const el = document.getElementById(`fd-${c.id}`)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [])

  return (
    <div className="feed-shell">
      <header className="fd-mast">
        <div className="fd-mast-inner">
          <span className="fd-brand">{lang === 'en' ? 'Owner' : 'владелец'}</span>
          <nav className="fd-toc" role="navigation">
            {CHAPTERS.map((c) => (
              <button
                key={c.id}
                className={`fd-toc-item ${active === c.id ? 'active' : ''}`}
                onClick={() => navigate(c.path)}
              >
                {lang === 'en' ? c.en : c.ru}
              </button>
            ))}
          </nav>
          <span className="fd-date">{dateStr}</span>
        </div>
      </header>

      <main className="fd-feed">
        {CHAPTERS.map((c) => {
          const El = c.El
          return (
            <section key={c.id} id={`fd-${c.id}`} data-chapter={c.id} className="fd-chapter">
              <El />
            </section>
          )
        })}
        <div className="fd-end">— {lang === 'en' ? 'that’s all for today' : 'на сегодня всё'} —</div>
      </main>

      <style>{`
        .feed-shell { min-height: 100vh; }
        .fd-mast {
          /* fixed, не sticky: прокрутка может жить во вложенном контейнере,
             а оглавление обязано быть на экране всегда */
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          background: color-mix(in srgb, var(--bg-app) 86%, transparent);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border-bottom: 1px solid var(--border);
        }
        .fd-mast-inner {
          display: flex; align-items: center; gap: 18px;
          max-width: 880px; margin-inline: auto;
          padding: 10px 24px;
        }
        .fd-brand { font-size: 15px; font-weight: 800; color: var(--text-primary); flex-shrink: 0; }
        .fd-date { font-size: 12px; color: var(--muted); flex-shrink: 0; }
        .fd-toc {
          display: flex; gap: 2px; flex: 1; justify-content: center;
          overflow-x: auto; scrollbar-width: none;
        }
        .fd-toc::-webkit-scrollbar { display: none; }
        .fd-toc-item {
          padding: 7px 11px; border: none; border-radius: 8px;
          background: none; font-family: inherit; font-size: 13px; font-weight: 600;
          color: var(--text-muted); cursor: pointer; white-space: nowrap;
          transition: color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
        }
        .fd-toc-item:hover { color: var(--text-body); background: var(--bg-tile); }
        .fd-toc-item.active { color: var(--accent); background: var(--bg-tile); }

        .fd-feed {
          max-width: 820px; margin-inline: auto;
          padding: 78px 24px 80px; /* верх — под фиксированное оглавление */
          display: flex; flex-direction: column; gap: 22px;
        }
        .fd-chapter {
          scroll-margin-top: 70px;
          padding-top: 26px;
        }
        .fd-chapter:first-child { padding-top: 0; }
        .fd-chapter + .fd-chapter { border-top: 1px solid var(--border); }

        /* Главы — спокойная колонка; высотные страницы укрощаем */
        .fd-chapter .schedule-layout {
          grid-template-columns: 1fr;
          height: auto; min-height: 0;
        }
        .fd-chapter .schedule-layout .schedule-col:first-child { height: 64vh; min-height: 460px; order: 2; }
        .fd-chapter .schedule-layout .schedule-col:last-child { height: auto; order: 1; }

        .fd-end {
          text-align: center; font-size: 12.5px; color: var(--text-faint);
          padding-top: 8px;
        }

        @media (max-width: 640px) {
          .fd-mast-inner { padding: 8px 12px; gap: 10px; }
          .fd-date { display: none; }
          .fd-feed { padding: 18px 14px 80px; }
        }
      `}</style>
    </div>
  )
}
