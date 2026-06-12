import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Home from '../pages/Home.jsx'
import Schedule from '../pages/Schedule.jsx'
import Health from '../pages/Health.jsx'
import Nutrition from '../pages/Nutrition.jsx'
import MailPage from '../pages/Mail.jsx'
import History from '../pages/History.jsx'
import Settings from '../pages/Settings.jsx'
import Tasks from '../pages/Tasks.jsx'
import JournalGlance from '../components/journal/JournalGlance.jsx'
import { useLang } from '../context/LanguageContext.jsx'
import { mskNow } from '../utils/time.js'
import { MAIL_ENABLED, HISTORY_ENABLED } from '../config/features.js'

/*
  Оболочка «Лента» — ВЕСЬ сайт одной журнальной полосой-брифингом.
  Раскладка как разворот журнала: слева липкое оглавление-таймлайн (где я в
  выпуске), по центру широкая лента глав, справа липкая колонка «На виду»
  (ключевые числа дня). Боковые поля заняты делом — пустоты по краям нет.

  Порядок глав = утренний брифинг: сегодня → расписание → здоровье → питание,
  затем «рабочее» (письма, история) и «служебное» (настройки). Никаких
  «страниц» и переходов: navigate('/health') из любого места просто прокручивает
  ленту к нужной главе — все внутренние ссылки сайта продолжают работать.
*/

const CHAPTERS = [
  { id: 'today', path: '/', ru: 'Сегодня', en: 'Today', El: Home },
  { id: 'schedule', path: '/schedule', ru: 'Расписание', en: 'Schedule', El: Schedule },
  { id: 'health', path: '/health', ru: 'Здоровье', en: 'Health', El: Health },
  { id: 'nutrition', path: '/nutrition', ru: 'Питание', en: 'Nutrition', El: Nutrition },
  ...(MAIL_ENABLED ? [{ id: 'mail', path: '/mail', ru: 'Письма', en: 'Mail', El: MailPage }] : []),
  ...(HISTORY_ENABLED ? [{ id: 'history', path: '/history', ru: 'История', en: 'History', El: History }] : []),
  { id: 'tasks', path: '/tasks', ru: 'Задачи', en: 'Tasks', El: Tasks },
  { id: 'settings', path: '/settings', ru: 'Настройки', en: 'Settings', El: Settings },
]

const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WD_RU = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
const WD_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function chapterForPath(pathname) {
  if (pathname === '/') return CHAPTERS[0]
  if (pathname.startsWith('/sport')) return CHAPTERS.find(c => c.id === 'health')
  if (pathname.startsWith('/connections')) return CHAPTERS.find(c => c.id === 'settings')
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
  const weekday = lang === 'en' ? WD_EN[d.getDay()] : WD_RU[d.getDay()]

  const scrollToChapter = (id) => {
    const el = document.getElementById(`fd-${id}`)
    if (!el) return
    spyPaused.current = true
    setActive(id)
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(() => { spyPaused.current = false }, 900)
  }
  const go = (c) => { navigate(c.path); scrollToChapter(c.id) }

  // Роут → плавная прокрутка к главе (включая navigate() из глубины компонентов)
  useEffect(() => {
    scrollToChapter(chapterForPath(location.pathname).id)
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const activeIdx = Math.max(0, CHAPTERS.findIndex(c => c.id === active))

  return (
    <div className="feed-shell">
      <header className="fd-mast">
        <div className="fd-mast-inner">
          <span className="fd-brand">{lang === 'en' ? 'Owner' : 'владелец'}</span>
          {/* Горизонтальное оглавление — только на узком экране (на широком его роль играет левый рейл) */}
          <nav className="fd-bar" role="navigation" aria-label={lang === 'en' ? 'Sections' : 'Разделы'}>
            {CHAPTERS.map((c) => (
              <button key={c.id} className={`fd-bar-item ${active === c.id ? 'active' : ''}`} onClick={() => go(c)}>
                {lang === 'en' ? c.en : c.ru}
              </button>
            ))}
          </nav>
          <span className="fd-date">{dateStr}</span>
        </div>
      </header>

      <div className="fd-grid">
        {/* Левый рейл — оглавление-таймлайн: где я в выпуске */}
        <div className="fd-rail">
          <div className="fd-rail-day">
            <span className="fd-rail-wd">{weekday}</span>
            <span className="fd-rail-date">{dateStr}</span>
          </div>
          <nav className="fd-railnav" role="navigation" aria-label={lang === 'en' ? 'Sections' : 'Разделы'}>
            {CHAPTERS.map((c, i) => (
              <button
                key={c.id}
                className={`fd-rail-item ${active === c.id ? 'active' : ''} ${i < activeIdx ? 'visited' : ''}`}
                onClick={() => go(c)}
              >
                <span className="fd-rail-dot" />
                <span className="fd-rail-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="fd-rail-name">{lang === 'en' ? c.en : c.ru}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Центр — лента глав */}
        <main className="fd-feed">
          {CHAPTERS.map((c, i) => {
            const El = c.El
            return (
              <section key={c.id} id={`fd-${c.id}`} data-chapter={c.id} className="fd-chapter">
                <div className="fd-chapter-eyebrow">
                  <span className="fd-chapter-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="fd-chapter-name">{lang === 'en' ? c.en : c.ru}</span>
                </div>
                <El />
              </section>
            )
          })}
          <div className="fd-end">— {lang === 'en' ? 'that’s all for today' : 'на сегодня всё'} —</div>
        </main>

        {/* Правый рейл — «На виду» */}
        <div className="fd-aside">
          <JournalGlance />
        </div>
      </div>

      <style>{`
        /* Свой скролл-контейнер: .main-layout режет прокрутку окна (overflow:hidden) */
        .feed-shell {
          --fd-max: 1800px;
          flex: 1; min-width: 0;
          height: 100vh; overflow-y: auto;
        }
        .fd-mast {
          /* fixed, не sticky: прокрутка живёт во вложенном контейнере,
             а оглавление обязано быть на экране всегда */
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          background: color-mix(in srgb, var(--bg-app) 86%, transparent);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border-bottom: 1px solid var(--border);
        }
        .fd-mast-inner {
          display: flex; align-items: center; gap: 18px;
          max-width: var(--fd-max); margin-inline: auto;
          padding: 11px 32px;
        }
        .fd-brand { font-size: 15px; font-weight: 800; color: var(--text-primary); flex-shrink: 0; letter-spacing: -0.01em; }
        /* На широком экране дату показывает левый рейл; в шапке прячем (и чтобы
           не наезжала на плавающий «Демо»-бейдж). Появляется лишь в средней
           полосе, где рейла нет. */
        .fd-date { display: none; font-size: 12.5px; color: var(--text-muted); flex-shrink: 0; margin-left: auto; font-variant-numeric: tabular-nums; }

        /* Горизонтальное оглавление в шапке — прячем на широком экране */
        .fd-bar { display: none; }

        /* Журнальный разворот: рейл | лента | «На виду» */
        .fd-grid {
          display: grid;
          grid-template-columns: 232px minmax(0, 1fr) 312px;
          gap: 36px;
          max-width: var(--fd-max); margin-inline: auto;
          padding: 78px 32px 64px; /* верх — под фиксированную шапку */
        }

        /* ── Левый рейл: оглавление-таймлайн ── */
        .fd-rail {
          position: sticky; top: 70px; align-self: start;
          max-height: calc(100vh - 92px); overflow-y: auto; scrollbar-width: none;
          display: flex; flex-direction: column; gap: 16px;
        }
        .fd-rail::-webkit-scrollbar { display: none; }
        .fd-rail-day { display: flex; flex-direction: column; gap: 2px; padding-left: 4px; }
        .fd-rail-wd { font-size: 12px; color: var(--text-muted); text-transform: capitalize; }
        .fd-rail-date { font-size: 17px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.01em; }
        .fd-railnav { display: flex; flex-direction: column; position: relative; }
        /* вертикальная нить таймлайна */
        .fd-railnav::before {
          content: ''; position: absolute; left: 10px; top: 16px; bottom: 16px;
          width: 2px; background: var(--border); border-radius: 1px;
        }
        .fd-rail-item {
          display: flex; align-items: center; gap: 11px; position: relative;
          padding: 8px 8px 8px 2px; border: none; border-radius: 9px;
          background: none; cursor: pointer; font-family: inherit; text-align: left;
          transition: background var(--dur-fast) var(--ease);
        }
        .fd-rail-item:hover { background: var(--bg-tile); }
        .fd-rail-dot {
          width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; z-index: 1;
          background: var(--bg-app); border: 2px solid var(--border-med);
          transition: background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
        }
        .fd-rail-item.visited .fd-rail-dot { background: var(--accent); border-color: var(--accent); opacity: 0.45; }
        .fd-rail-item.active .fd-rail-dot {
          background: var(--accent); border-color: var(--accent);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent);
        }
        .fd-rail-num {
          font-size: 11px; font-weight: 700; color: var(--text-faint);
          font-variant-numeric: tabular-nums; flex-shrink: 0; width: 16px;
        }
        .fd-rail-name {
          font-size: 13.5px; font-weight: 600; color: var(--text-muted);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          transition: color var(--dur-fast) var(--ease);
        }
        .fd-rail-item.active .fd-rail-name { color: var(--text-primary); }
        .fd-rail-item.active .fd-rail-num { color: var(--accent); }

        /* ── Центр: лента ── */
        .fd-feed { min-width: 0; display: flex; flex-direction: column; gap: 14px; }
        /* Внутренние страницы в ленте идут во всю ширину колонки */
        .fd-feed .health-page, .fd-feed .nu-page, .fd-feed .history-page,
        .fd-feed .conn-page, .fd-feed .mail-page, .fd-feed .settings-page,
        .fd-feed .home-page {
          max-width: none;
        }
        .fd-chapter { scroll-margin-top: 86px; padding-top: 4px; }
        .fd-chapter + .fd-chapter { border-top: 1px solid var(--border); padding-top: 18px; }
        /* Эпиграф главы — номер + название: порядок выпуска читается явно */
        .fd-chapter-eyebrow {
          display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
        }
        .fd-chapter-num {
          font-size: 12px; font-weight: 800; color: var(--on-accent);
          font-variant-numeric: tabular-nums; letter-spacing: 0.02em;
          background: linear-gradient(180deg, var(--accent-btn-top), var(--accent-btn-bot));
          border-radius: 7px; padding: 3px 8px; flex-shrink: 0;
        }
        .fd-chapter-name {
          font-size: 12px; font-weight: 700; color: var(--text-secondary);
          text-transform: uppercase; letter-spacing: 0.09em;
        }

        /* Высотные страницы укрощаем под спокойную колонку */
        .fd-chapter .schedule-layout {
          grid-template-columns: 1fr;
          height: auto; min-height: 0;
        }
        .fd-chapter .schedule-layout .schedule-col:first-child { height: 64vh; min-height: 460px; order: 2; }
        .fd-chapter .schedule-layout .schedule-col:last-child { height: auto; order: 1; }

        .fd-end {
          text-align: center; font-size: 12.5px; color: var(--text-faint);
          padding-top: 10px;
        }

        /* ── Правый рейл: «На виду» ── */
        .fd-aside {
          position: sticky; top: 70px; align-self: start;
          max-height: calc(100vh - 92px); overflow-y: auto; scrollbar-width: none;
        }
        .fd-aside::-webkit-scrollbar { display: none; }

        /* Планшет: убираем правую колонку, оставляем рейл + ленту */
        @media (max-width: 1320px) {
          .fd-grid { grid-template-columns: 210px minmax(0, 1fr); gap: 28px; }
          .fd-aside { display: none; }
        }

        /* Мобайл/узкий: одна колонка-лента, оглавление возвращается в шапку */
        @media (max-width: 1000px) {
          .fd-grid { display: block; max-width: 760px; padding: 64px 18px 72px; }
          .fd-rail { display: none; }
          .fd-date { display: block; }
          .fd-mast-inner { padding: 9px 16px; gap: 12px; }
          .fd-bar {
            display: flex; gap: 2px; flex: 1; min-width: 0; justify-content: flex-start;
            overflow-x: auto; scrollbar-width: none;
            -webkit-mask-image: linear-gradient(90deg, #000 90%, transparent);
            mask-image: linear-gradient(90deg, #000 90%, transparent);
          }
          .fd-bar::-webkit-scrollbar { display: none; }
          .fd-bar-item {
            padding: 7px 11px; min-height: 40px; border: none; border-radius: 8px;
            background: none; font-family: inherit; font-size: 13px; font-weight: 600;
            color: var(--text-muted); cursor: pointer; white-space: nowrap; flex-shrink: 0;
            transition: color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
          }
          .fd-bar-item:hover { color: var(--text-body); background: var(--bg-tile); }
          .fd-bar-item.active { color: var(--accent); background: var(--bg-tile); }
        }
        @media (max-width: 640px) {
          .fd-date { display: none; }
          .fd-grid { padding: 60px 14px 80px; }
        }
      `}</style>
    </div>
  )
}
