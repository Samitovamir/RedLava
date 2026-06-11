import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Mail, History as HistoryIcon, Settings as SettingsIcon } from 'lucide-react'
import CkToday from '../components/cockpit/CkToday.jsx'
import CkDock from '../components/cockpit/CkDock.jsx'
import { CkRecovery, CkSleep, CkLoad, CkSteps, CkNutrition, CkLabs, CkVitals } from '../components/cockpit/CkWidgets.jsx'
import { CkSleepPanel, CkRecoveryPanel } from '../components/cockpit/CkPanels.jsx'
import GarminLive from '../components/GarminLive.jsx'
import MetricsView from '../components/MetricsView.jsx'
import LabResults from '../components/LabResults.jsx'
import Schedule from '../pages/Schedule.jsx'
import Nutrition from '../pages/Nutrition.jsx'
import MailPage from '../pages/Mail.jsx'
import History from '../pages/History.jsx'
import Settings from '../pages/Settings.jsx'
import { useEvents } from '../context/EventsContext.jsx'
import { useMemoryFacts } from '../context/MemoryContext.jsx'
import { useAiSummary } from '../hooks/useAiSummary.js'
import { buildSignalData, SIGNAL_CONTEXT, parseSignal, fallbackSignal } from '../utils/daySignal.js'
import { useT, useLang } from '../context/LanguageContext.jsx'
import { mskNow } from '../utils/time.js'
import { isGuest } from '../api/authFetch.js'
import { variants, Z } from '../motion.js'

/*
  Оболочка «Один экран» (кокпит) — ВЕСЬ сайт как приборная панель дня:
  - шапка-вывод: ИИ-заголовок дня (типографика, без карточки) + часы + редкое
    (письма/история/настройки) иконками;
  - слева колонка «Сегодня» (события, + событие), правее — графические виджеты:
    восстановление (кольцо+тренд), сон (полоса стадий), нагрузка+тренировка,
    шаги, питание, анализы, строка виталов;
  - внизу тонкий ИИ-док (командная строка).
  Клик по виджету открывает SCOPED-панель ровно его темы (сон → только сон),
  а не раздел с вкладками. Маршруты продолжают работать: /nutrition и т.п.
  открываются такими же панелями поверх (deep-link, Esc/клик-вне закрывают).
*/

function readWhoop() {
  try { const s = localStorage.getItem('albert-whoop-live'); return s ? JSON.parse(s) : null } catch { return null }
}
function readGarmin() {
  try { const s = localStorage.getItem('albert-garmin-live'); return s ? JSON.parse(s) : null } catch { return null }
}

const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

export default function CockpitShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { lang } = useLang()
  const t = useT({
    ru: {
      brand: 'владелец',
      mail: 'Письма', history: 'История', settings: 'Настройки', close: 'Закрыть',
      titles: {
        sleep: 'Сон', recovery: 'Восстановление', sport: 'Тренировки и активность', labs: 'Анализы крови',
        '/schedule': 'Расписание', '/sport': 'Тренировки и активность', '/health': 'Показатели тела', '/nutrition': 'Питание',
        '/mail': 'Письма', '/history': 'История', '/settings': 'Настройки',
      },
    },
    en: {
      brand: 'Owner',
      mail: 'Mail', history: 'History', settings: 'Settings', close: 'Close',
      titles: {
        sleep: 'Sleep', recovery: 'Recovery', sport: 'Workouts & activity', labs: 'Blood tests',
        '/schedule': 'Schedule', '/sport': 'Workouts & activity', '/health': 'Body metrics', '/nutrition': 'Nutrition',
        '/mail': 'Mail', '/history': 'History', '/settings': 'Settings',
      },
    },
  })

  // Локальные scoped-панели (не-маршрутные): сон / восстановление / спорт / анализы
  const [panel, setPanel] = useState(null)
  const routeOpen = location.pathname !== '/'
  const open = routeOpen || !!panel
  const closeTop = () => { if (panel) setPanel(null); else if (routeOpen) navigate('/') }

  // Esc закрывает верхний слой (панель → окно маршрута)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeTop() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel, routeOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Открыли маршрут поверх — локальная панель уступает (один слой за раз)
  useEffect(() => { if (routeOpen && panel) setPanel(null) }, [routeOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Живые часы в шапке
  const [now, setNow] = useState(mskNow)
  useEffect(() => {
    const id = setInterval(() => setNow(mskNow()), 30000)
    return () => clearInterval(id)
  }, [])
  const pad = (n) => String(n).padStart(2, '0')
  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const dateStr = lang === 'en'
    ? `${now.getDate()}.${pad(now.getMonth() + 1)}`
    : `${now.getDate()} ${MONTHS_RU[now.getMonth()]}`

  // ИИ-вывод дня — та же сводка, что на Главной (общий кэш по id)
  const { events } = useEvents()
  const { facts } = useMemoryFacts()
  const fb = fallbackSignal(lang)
  const summary = useAiSummary({
    id: 'today-signal',
    context: SIGNAL_CONTEXT + (lang === 'en' ? '\nReply in English.' : ''),
    snapshot: buildSignalData({ events, facts }),
    message: 'Сформируй сегодняшний баннер «СЕГОДНЯ»: заголовок-вывод и неброскую строку с ключевым данным. Ровно две строки.',
    fallback: `${fb.headline}\n${fb.note}`
  })
  const parsed = summary.text ? parseSignal(summary.text) : null
  const headline = parsed?.headline || fb.headline
  const note = parsed?.note || fb.note

  const whoop = readWhoop()
  const garmin = readGarmin()
  const guest = isGuest()

  const title = panel ? t.titles[panel] : (t.titles[Object.keys(t.titles).find(k => k.startsWith('/') && location.pathname.startsWith(k))] || '')
  const narrow = panel === 'sleep' || panel === 'recovery'

  return (
    <div className="cockpit-shell">
      <header className={`ck-top ${guest ? 'has-demo' : ''}`}>
        <span className="ck-logo">А</span>
        <div className="ck-signal" role="button" tabIndex={0} onClick={() => navigate('/schedule')} onKeyDown={(e) => e.key === 'Enter' && navigate('/schedule')}>
          <span className="ck-headline">{headline}</span>
          <span className="ck-note">{note}</span>
        </div>
        <div className="ck-top-right">
          <span className="ck-clock">{dateStr} · {clock}</span>
          <button className="ck-icon-btn" title={t.mail} aria-label={t.mail} onClick={() => navigate('/mail')}><Mail size={17} /></button>
          <button className="ck-icon-btn" title={t.history} aria-label={t.history} onClick={() => navigate('/history')}><HistoryIcon size={17} /></button>
          <button className="ck-icon-btn" title={t.settings} aria-label={t.settings} onClick={() => navigate('/settings')}><SettingsIcon size={17} /></button>
        </div>
      </header>

      <main className="ck-hub">
        <div className="ck-cell" style={{ gridArea: 't' }}><CkToday /></div>
        <div className="ck-cell" style={{ gridArea: 'r' }}><CkRecovery whoop={whoop} onOpen={() => setPanel('recovery')} /></div>
        <div className="ck-cell" style={{ gridArea: 's' }}><CkSleep whoop={whoop} onOpen={() => setPanel('sleep')} /></div>
        <div className="ck-cell" style={{ gridArea: 'l' }}><CkLoad whoop={whoop} garmin={garmin} onOpen={() => setPanel('sport')} /></div>
        <div className="ck-cell" style={{ gridArea: 'p' }}><CkSteps garmin={garmin} onOpen={() => setPanel('sport')} /></div>
        <div className="ck-cell" style={{ gridArea: 'n' }}><CkNutrition onOpen={() => navigate('/nutrition')} /></div>
        <div className="ck-cell" style={{ gridArea: 'a' }}><CkLabs onOpen={() => setPanel('labs')} /></div>
        <div className="ck-cell" style={{ gridArea: 'v' }}><CkVitals whoop={whoop} garmin={garmin} onOpen={() => navigate('/health')} /></div>
        <div className="ck-cell" style={{ gridArea: 'd' }}><CkDock /></div>
      </main>

      <AnimatePresence>
        {open && (
          <motion.div
            className="ck-scrim"
            initial={variants.modalBackdrop.initial}
            animate={variants.modalBackdrop.animate}
            exit={variants.modalBackdrop.exit}
            transition={variants.modalBackdrop.transition}
            onClick={closeTop}
          >
            <motion.section
              className={`ck-window ${narrow ? 'narrow' : ''}`}
              initial={{ opacity: 0, y: 30, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="ck-win-head">
                <h2 className="ck-win-title">{title}</h2>
                <button className="ck-win-close" onClick={closeTop} aria-label={t.close}>
                  <X size={18} strokeWidth={2} />
                </button>
              </div>
              <div className="ck-win-body">
                {panel === 'sleep' && <CkSleepPanel whoop={whoop} />}
                {panel === 'recovery' && <CkRecoveryPanel whoop={whoop} />}
                {panel === 'sport' && <GarminLive />}
                {panel === 'labs' && <LabResults />}
                {!panel && (
                  <Routes location={location}>
                    <Route path="/schedule" element={<Schedule />} />
                    <Route path="/sport" element={<GarminLive />} />
                    <Route path="/health" element={<MetricsView />} />
                    <Route path="/nutrition" element={<Nutrition />} />
                    <Route path="/mail" element={<MailPage />} />
                    <Route path="/history" element={<History />} />
                    <Route path="/connections" element={<Navigate to="/settings" replace />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                )}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        /* ОДИН ЭКРАН: всё во вьюпорте, страница не листается; длинные списки
           скроллятся ВНУТРИ виджетов (сама карточка скролл-контейнером не бывает —
           иначе пунктирная прошивка card::after уезжает в середину контента) */
        .cockpit-shell {
          flex: 1; min-width: 0;
          height: 100vh; overflow: hidden;
          display: flex; flex-direction: column;
        }
        .ck-top {
          flex-shrink: 0;
          display: flex; align-items: center; gap: 16px;
          padding: 12px 26px 0;
          width: 100%; max-width: 1680px; margin-inline: auto;
        }
        .ck-logo {
          width: 36px; height: 36px; border-radius: 11px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(180deg, var(--accent-btn-top), var(--accent-btn-bot));
          color: var(--on-accent);
          font-weight: 800; font-size: 17px;
        }
        .ck-signal { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; cursor: pointer; }
        .ck-headline {
          font-size: 17px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          transition: color var(--dur-fast) var(--ease);
        }
        .ck-signal:hover .ck-headline { color: var(--accent); }
        .ck-note { font-size: 12.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ck-top-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        /* Гость: плавающий демо-бейдж (fixed, top-right ~280px) — отводим контролам
           шапки место слева от него, чтобы иконки не уходили под бейдж */
        .ck-top.has-demo .ck-top-right { margin-right: 292px; }
        .ck-clock { font-size: 13px; color: var(--text-muted); font-variant-numeric: tabular-nums; margin-right: 6px; }
        .ck-icon-btn {
          width: 34px; height: 34px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          background: var(--bg-tile); border: 1px solid var(--border-med);
          color: var(--text-secondary); cursor: pointer;
          transition: color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
        }
        .ck-icon-btn:hover { color: var(--accent); border-color: var(--accent); }

        /* Иерархия: ОДИН большой герой (Восстановление, 2 ряда — кольцо+тренд),
           Сон и Нагрузка справа средними, ряд Шаги/Питание/Анализы — компактный
           (auto, по контенту → без мёртвых зон), внизу полоса виталов и ИИ-док.
           Колонка «Сегодня» слева во всю высоту приборной зоны. */
        .ck-hub {
          /* Высоту капим и центрируем по вертикали: на большом мониторе карточки
             остаются нормального размера (без растянутых пустот внутри), а лишняя
             высота уходит в аккуратные поля сверху/снизу — не в дыры в «окнах».
             На обычных экранах хаб заполняет высоту почти целиком. */
          flex: none;
          height: min(880px, calc(100vh - 58px));
          margin-block: auto;
          min-height: 0;
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          grid-template-rows: minmax(0, 1fr) minmax(0, 1fr) auto auto auto;
          grid-template-areas:
            "t t t r r r r r s s s s"
            "t t t r r r r r l l l l"
            "t t t p p p n n n a a a"
            "v v v v v v v v v v v v"
            "d d d d d d d d d d d d";
          gap: 12px;
          padding: 12px 26px 16px;
          width: 100%; max-width: 1680px; margin-inline: auto;
        }
        .ck-cell { min-width: 0; min-height: 0; display: flex; }
        .ck-cell > * { flex: 1; min-width: 0; min-height: 0; }

        /* Каскадная сборка приборной панели */
        @media (prefers-reduced-motion: no-preference) {
          .ck-hub > .ck-cell { animation: block-rise 0.42s var(--ease) backwards; }
          .ck-hub > .ck-cell:nth-child(1) { animation-delay: 0.02s; }
          .ck-hub > .ck-cell:nth-child(2) { animation-delay: 0.06s; }
          .ck-hub > .ck-cell:nth-child(3) { animation-delay: 0.10s; }
          .ck-hub > .ck-cell:nth-child(4) { animation-delay: 0.14s; }
          .ck-hub > .ck-cell:nth-child(5) { animation-delay: 0.18s; }
          .ck-hub > .ck-cell:nth-child(n+6) { animation-delay: 0.22s; }
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
          margin-block: auto;
          max-height: 100%;
        }
        .ck-window.narrow { width: min(880px, 100%); }
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

        @media (max-width: 1100px) {
          /* На узком экране «один экран» невозможен — обычная вертикальная лента */
          .cockpit-shell { height: auto; overflow: visible; display: block; }
          /* На узком экране лента вертикальная — снимаем кап высоты и центрирование */
          .ck-hub { display: flex; flex-direction: column; height: auto; margin-block: 0; padding: 12px 16px 20px; }
          .ck-today .ckt-list { max-height: 300px; }
          /* Шапка в стопку: лого+часы+иконки в ряд, вывод дня — отдельной строкой во всю ширину */
          .ck-top { padding: 12px 16px 0; flex-wrap: wrap; }
          /* Компактный «Демо»-бейдж (≤1100) ~76px — отводим иконкам место, чтобы не уходили под него */
          .ck-top.has-demo .ck-top-right { margin-right: 84px; }
          .ck-signal { order: 3; flex-basis: 100%; }
          .ck-headline { white-space: normal; }
          /* Под палец */
          .ck-icon-btn { width: 40px; height: 40px; }
          .ck-win-close { width: 40px; height: 40px; }
          .ck-scrim { padding: 8px; }
          .ck-win-body { padding: 14px; }
        }
      `}</style>
    </div>
  )
}
