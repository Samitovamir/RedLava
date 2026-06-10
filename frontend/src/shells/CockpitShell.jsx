import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, UtensilsCrossed, Mail, History as HistoryIcon, Settings as SettingsIcon } from 'lucide-react'
import TodaySignal from '../components/TodaySignal.jsx'
import HealthSignal from '../components/HealthSignal.jsx'
import TodayTimelineStrip from '../components/TodayTimelineStrip.jsx'
import RecentActions from '../components/RecentActions.jsx'
import AIWorkZone from '../components/AIWorkZone.jsx'
import HubTile from '../components/HubTile.jsx'
import StatTile from '../components/StatTile.jsx'
import Schedule from '../pages/Schedule.jsx'
import Health from '../pages/Health.jsx'
import Nutrition from '../pages/Nutrition.jsx'
import MailPage from '../pages/Mail.jsx'
import History from '../pages/History.jsx'
import Settings from '../pages/Settings.jsx'
import { useT, useLang } from '../context/LanguageContext.jsx'
import { mskNow } from '../utils/time.js'
import { variants, Z } from '../motion.js'

/*
  Оболочка «Кокпит» — ВЕСЬ сайт на одном экране (hub-and-spoke).
  Нет сайдбара и «страниц»: главная = сетка окон-виджетов со всеми данными,
  любой раздел разворачивается ПОВЕРХ хаба полноценным окном (роут остаётся
  обычным /schedule, /health, … — поэтому все navigate() в компонентах работают,
  а закрытие окна = возврат на «/». Esc тоже закрывает.)
*/

const SECTIONS = [
  { path: '/schedule', ru: 'Расписание', en: 'Schedule' },
  { path: '/health', ru: 'Здоровье', en: 'Health' },
  { path: '/nutrition', ru: 'Питание', en: 'Nutrition' },
  { path: '/mail', ru: 'Письма', en: 'Mail' },
  { path: '/history', ru: 'История', en: 'History' },
  { path: '/settings', ru: 'Настройки', en: 'Settings' },
]

function hasMealPlan() {
  try { const s = localStorage.getItem('albert-meal-plan'); const o = s ? JSON.parse(s) : null; return !!(o && Object.keys(o).length) } catch { return false }
}
function readWhoop() {
  try { const s = localStorage.getItem('albert-whoop-live'); return s ? JSON.parse(s) : null } catch { return null }
}
function readGarmin() {
  try { const s = localStorage.getItem('albert-garmin-live'); return s ? JSON.parse(s) : null } catch { return null }
}

export default function CockpitShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { lang } = useLang()
  const t = useT({
    ru: {
      brand: 'владелец',
      months: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
      nutrition: 'Питание', menuOk: 'Меню готово', menuNo: 'Нет меню', menuSub: 'неделя · покупки',
      mail: 'Письма', mailSub: 'Написать или поручить ИИ',
      history: 'История', historySub: 'Полный журнал действий',
      settings: 'Настройки', settingsSub: 'Темы · раскладка · подключения',
      recovery: 'Восстановление', sleep: 'Сон', steps: 'Шаги', rhr: 'Пульс покоя',
      hrv: 'HRV', vo2: 'VO₂max', week: 'За неделю', strain: 'Нагрузка',
      h: 'ч', bpm: 'уд/мин', ms: 'мс', km: 'км', wk: n => `${n} трен.`,
      stepsGoal: 'цель 10 000', ofMax: 'из 21',
    },
    en: {
      brand: 'Owner',
      months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      nutrition: 'Nutrition', menuOk: 'Menu ready', menuNo: 'No menu', menuSub: 'week · groceries',
      mail: 'Mail', mailSub: 'Write or delegate to AI',
      history: 'History', historySub: 'Full action log',
      settings: 'Settings', settingsSub: 'Themes · layout · services',
      recovery: 'Recovery', sleep: 'Sleep', steps: 'Steps', rhr: 'Resting HR',
      hrv: 'HRV', vo2: 'VO₂max', week: 'This week', strain: 'Strain',
      h: 'h', bpm: 'bpm', ms: 'ms', km: 'km', wk: n => `${n} workouts`,
      stepsGoal: 'goal 10,000', ofMax: 'of 21',
    },
  })

  const open = location.pathname !== '/'
  const section = SECTIONS.find(s => location.pathname.startsWith(s.path))
  const title = section ? (lang === 'en' ? section.en : section.ru) : ''

  // Esc закрывает развёрнутое окно
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') navigate('/') }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const d = mskNow()
  const dateStr = `${d.getDate()} ${t.months[d.getMonth()]}`
  const whoop = readWhoop()
  const garmin = readGarmin()

  return (
    <div className="cockpit-shell">
      <header className="ck-top">
        <span className="ck-logo">А</span>
        <span className="ck-brand">{t.brand}</span>
        <span className="ck-date">{dateStr}</span>
      </header>

      <main className="ck-hub">
        <TodaySignal />
        <HealthSignal />

        {/* Приборная панель: все ключевые цифры видны сразу, клик → раздел */}
        <div className="ck-stats">
          <StatTile label={t.recovery} value={whoop?.recovery} unit="%" onClick={() => navigate('/health')} />
          <StatTile label={t.sleep} value={whoop?.sleep?.hoursSlept} unit={t.h} onClick={() => navigate('/health')} />
          <StatTile label={t.steps} value={garmin?.steps != null ? garmin.steps.toLocaleString('ru-RU') : null} sub={garmin?.steps != null ? t.stepsGoal : ''} onClick={() => navigate('/health')} />
          <StatTile label={t.rhr} value={whoop?.rhr ?? garmin?.restingHr} unit={t.bpm} onClick={() => navigate('/health')} />
          <StatTile label={t.hrv} value={whoop?.hrv} unit={t.ms} onClick={() => navigate('/health')} />
          <StatTile label={t.vo2} value={garmin?.vo2Max} onClick={() => navigate('/health')} />
          <StatTile label={t.week} value={garmin?.weekKm} unit={t.km} sub={garmin?.weekWorkouts != null ? t.wk(garmin.weekWorkouts) : ''} onClick={() => navigate('/health')} />
          <StatTile label={t.strain} value={whoop?.strain} sub={whoop?.strain != null ? t.ofMax : ''} onClick={() => navigate('/health')} />
          <StatTile label={t.nutrition} value={hasMealPlan() ? t.menuOk : t.menuNo} sub={t.menuSub} onClick={() => navigate('/nutrition')} />
        </div>

        <TodayTimelineStrip />
        <RecentActions limit={4} />

        <div className="ck-tiles">
          <HubTile icon={UtensilsCrossed} title={t.nutrition} sub={hasMealPlan() ? t.menuOk : t.menuNo} onOpen={() => navigate('/nutrition')} />
          <HubTile icon={Mail} title={t.mail} sub={t.mailSub} onOpen={() => navigate('/mail')} />
          <HubTile icon={HistoryIcon} title={t.history} sub={t.historySub} onOpen={() => navigate('/history')} />
          <HubTile icon={SettingsIcon} title={t.settings} sub={t.settingsSub} onOpen={() => navigate('/settings')} />
        </div>

        <AIWorkZone />
      </main>

      <AnimatePresence>
        {open && (
          <motion.div
            className="ck-scrim"
            initial={variants.modalBackdrop.initial}
            animate={variants.modalBackdrop.animate}
            exit={variants.modalBackdrop.exit}
            transition={variants.modalBackdrop.transition}
            onClick={() => navigate('/')}
          >
            <motion.section
              className="ck-window"
              initial={{ opacity: 0, y: 30, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="ck-win-head">
                <h2 className="ck-win-title">{title}</h2>
                <button className="ck-win-close" onClick={() => navigate('/')} aria-label="Закрыть">
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
              <div className="ck-win-body">
                <Routes location={location}>
                  <Route path="/schedule" element={<Schedule />} />
                  <Route path="/sport" element={<Navigate to="/health" replace />} />
                  <Route path="/health" element={<Health />} />
                  <Route path="/nutrition" element={<Nutrition />} />
                  <Route path="/mail" element={<MailPage />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/connections" element={<Navigate to="/settings" replace />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        /* ОДИН ЭКРАН: всё помещается во вьюпорт, страница не листается —
           длинные виджеты (журнал, помощник) скроллятся внутри себя */
        .cockpit-shell {
          flex: 1; min-width: 0;
          height: 100vh; overflow: hidden;
          display: flex; flex-direction: column;
        }
        .ck-top {
          flex-shrink: 0;
          display: flex; align-items: center; gap: 12px;
          padding: 14px 28px 0;
          width: 100%; max-width: 1280px; margin-inline: auto;
        }
        .ck-logo {
          width: 34px; height: 34px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          background: var(--accent); color: var(--on-accent);
          font-weight: 800; font-size: 17px;
        }
        .ck-brand { font-size: 16px; font-weight: 700; color: var(--text-primary); }
        .ck-date { margin-left: auto; font-size: 13px; color: var(--muted); padding-right: 110px; }

        .ck-hub {
          flex: 1; min-height: 0;
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          grid-template-rows: auto auto auto auto minmax(0, 1fr);
          gap: 12px;
          align-items: stretch;
          padding: 12px 28px 18px;
          width: 100%; max-width: 1360px; margin-inline: auto;
        }
        .ck-hub > .today-signal { grid-column: 1 / 5; grid-row: 1; }
        .ck-hub > .signal-card { grid-column: 5 / 7; grid-row: 1; }
        /* Приборная строка: 9 показателей в ряд */
        .ck-stats {
          grid-column: 1 / 7; grid-row: 2;
          display: grid; grid-template-columns: repeat(9, 1fr); gap: 10px;
        }
        .ck-hub > .tl-strip { grid-column: 1 / 5; grid-row: 3; }
        .ck-hub > .recent-actions { grid-column: 5 / 7; grid-row: 3; min-height: 0; overflow: hidden; }
        .ck-hub > .recent-actions .ra-list { overflow-y: auto; min-height: 0; }
        .ck-tiles {
          grid-column: 1 / 7; grid-row: 4;
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
        }
        /* Помощник — нижняя зона на всю ширину, внутренний скролл при нехватке места */
        .ck-hub > .ai-work-zone { grid-column: 1 / -1; grid-row: 5; min-height: 0; overflow-y: auto; }
        @media (max-width: 1200px) { .ck-stats { grid-template-columns: repeat(5, 1fr); } }

        /* Каскадная сборка хаба */
        @media (prefers-reduced-motion: no-preference) {
          .ck-hub > * { animation: block-rise 0.42s var(--ease) backwards; }
          .ck-hub > :nth-child(1) { animation-delay: 0.02s; }
          .ck-hub > :nth-child(2) { animation-delay: 0.06s; }
          .ck-hub > :nth-child(3) { animation-delay: 0.10s; }
          .ck-hub > :nth-child(4) { animation-delay: 0.14s; }
          .ck-hub > :nth-child(5) { animation-delay: 0.18s; }
          .ck-hub > :nth-child(n+6) { animation-delay: 0.22s; }
        }

        .ck-scrim {
          position: fixed; inset: 0; z-index: ${Z.reading};
          background: var(--scrim, rgba(0,0,0,0.55));
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          display: flex; align-items: stretch; justify-content: center;
          padding: 28px;
        }
        .ck-window {
          width: min(1180px, 100%);
          display: flex; flex-direction: column; min-height: 0;
          background: linear-gradient(180deg, var(--bg-card-top, var(--bg-surface)), var(--bg-card-bot, var(--bg-surface)));
          border: 1px solid var(--border-soft);
          border-radius: var(--radius);
          box-shadow: inset 0 1px 0 var(--edge-light), 0 32px 80px rgba(0,0,0,0.5);
          overflow: hidden;
        }
        .ck-win-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 24px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .ck-win-title { font-size: 17px; font-weight: 700; color: var(--text-primary); }
        .ck-win-close {
          display: flex; align-items: center; justify-content: center;
          width: 32px; height: 32px; border-radius: 9px;
          border: 1px solid var(--border-med); background: var(--bg-tile);
          color: var(--text-secondary); cursor: pointer;
          transition: color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
        }
        .ck-win-close:hover { color: var(--foreground); border-color: var(--accent); }
        .ck-win-body { flex: 1; min-height: 0; overflow-y: auto; padding: 24px 24px 48px; }

        @media (max-width: 900px) {
          /* На узком экране «один экран» невозможен — обычная прокрутка */
          .cockpit-shell { height: auto; overflow: visible; display: block; }
          .ck-hub { display: flex; flex-direction: column; }
          .ck-hub > .recent-actions { overflow: visible; }
          .ck-stats { grid-template-columns: repeat(3, 1fr); }
          .ck-tiles { grid-template-columns: repeat(2, 1fr); }
          .ck-scrim { padding: 8px; }
          .ck-win-body { padding: 14px; }
          .ck-date { padding-right: 0; }
        }
      `}</style>
    </div>
  )
}
