import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { variants } from './motion.js'
import FluidMenu from './components/FluidMenu.jsx'
import MailModal from './components/MailModal.jsx'
import DemoBanner from './components/DemoBanner.jsx'
import NavGuide from './components/NavGuide.jsx'
import CockpitShell from './shells/CockpitShell.jsx'
import JournalShell from './shells/JournalShell.jsx'
import CommandShell from './shells/CommandShell.jsx'
import { useLayout, useIsMobile } from './layout.js'
import { useThemeSync } from './theme.js'
import { isGuest } from './api/authFetch.js'
import { MAIL_ENABLED, HISTORY_ENABLED } from './config/features.js'
import { pullSync, startSync } from './utils/sync.js'
import { EventsProvider } from './context/EventsContext.jsx'
import { HistoryProvider } from './context/HistoryContext.jsx'
import { MemoryProvider } from './context/MemoryContext.jsx'
import { MailProvider } from './context/MailContext.jsx'
import Home from './pages/Home.jsx'
import Schedule from './pages/Schedule.jsx'
import Health from './pages/Health.jsx'
import Nutrition from './pages/Nutrition.jsx'
import Mail from './pages/Mail.jsx'
import History from './pages/History.jsx'
import Tasks from './pages/Tasks.jsx'
import Settings from './pages/Settings.jsx'

// Переходы между разделами: fade + лёгкий подъём (variants.pageEnter из motion.js).
// useLocation требует Router-контекст, поэтому анимированные роуты — отдельным
// компонентом внутри BrowserRouter. FluidMenu и модалки живут вне <main> и не дёргаются.
function AnimatedRoutes() {
  const location = useLocation()
  const isMobile = useIsMobile()
  // На мобильном — лёгкий fade (без transform всей страницы и с мгновенным
  // выходом), чтобы переключение вкладок было плавным и без задержки нажатий.
  const pv = isMobile ? variants.pageFade : variants.pageEnter
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.main
        className="page-content"
        key={location.pathname}
        initial={pv.initial}
        animate={pv.animate}
        exit={pv.exit}
        transition={pv.transition}
      >
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/sport" element={<Navigate to="/health" replace />} />
          <Route path="/health" element={<Health />} />
          <Route path="/nutrition" element={<Nutrition />} />
          <Route path="/mail" element={MAIL_ENABLED ? <Mail /> : <Navigate to="/" replace />} />
          <Route path="/history" element={HISTORY_ENABLED ? <History /> : <Navigate to="/" replace />} />
          {/* «Подключения» влиты в Настройки — старые ссылки ведут туда */}
          <Route path="/connections" element={<Navigate to="/settings" replace />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.main>
    </AnimatePresence>
  )
}

// Раскладка = ОБОЛОЧКА сайта: своя навигация, окна и структура при общих данных.
// classic — разделы+сайдбар (как было); cockpit — весь сайт на одном экране,
// разделы всплывают окнами; journal — главы с вкладками сверху; command —
// рабочий стол из трёх постоянных панелей.
function ShellRouter() {
  const layout = useLayout()
  const isMobile = useIsMobile()
  // На мобильном — всегда «Классика»: остальные оболочки плохо смотрятся на узком
  // экране (решение владельца). Предпочтение пользователя сохраняется для десктопа.
  const effective = isMobile ? 'classic' : layout
  // Держим html[data-layout] в согласии с эффективной раскладкой, чтобы CSS-правила
  // journal/cockpit/command не применялись к классике на мобильном.
  useEffect(() => {
    document.documentElement.setAttribute('data-layout', effective)
  }, [effective])
  if (effective === 'cockpit') return <CockpitShell />
  if (effective === 'journal') return <JournalShell />
  if (effective === 'command') return <CommandShell />
  return (
    <>
      <FluidMenu />
      <AnimatedRoutes />
    </>
  )
}

export default function App() {
  // Держим тему в согласии с устройством и оформлением телефона (тёмная/светлая) вживую.
  useThemeSync()

  // Синхронизация между устройствами: ДО показа приложения подтягиваем пользовательские
  // данные с сервера (расписание/память/анализы/питание), затем запускаем фоновый push.
  // Не блокируем дольше 4 с, если сеть висит.
  const [synced, setSynced] = useState(false)
  useEffect(() => {
    let done = false
    const finish = () => { if (!done) { done = true; setSynced(true); startSync() } }
    pullSync().finally(finish)
    const tmr = setTimeout(finish, 4000)
    return () => clearTimeout(tmr)
  }, [])

  // Подтягиваем живые данные Whoop и Garmin в localStorage (для страниц и для ИИ).
  // Гость работает на демо-данных — реальные не запрашиваем (и не затираем демо).
  useEffect(() => {
    if (isGuest()) return
    fetch('/api/whoop/data').then(r => r.json()).then(d => {
      try {
        if (d.connected && d.whoop) localStorage.setItem('albert-whoop-live', JSON.stringify(d.whoop))
        else localStorage.removeItem('albert-whoop-live')
      } catch { /* ignore */ }
    }).catch(() => {})
    fetch('/api/garmin/data').then(r => r.json()).then(d => {
      try {
        if (d.connected && d.garmin) localStorage.setItem('albert-garmin-live', JSON.stringify(d.garmin))
        else localStorage.removeItem('albert-garmin-live')
      } catch { /* ignore */ }
    }).catch(() => {})
  }, [])

  if (!synced) return null

  return (
    <HistoryProvider>
    <MemoryProvider>
    <MailProvider>
    <EventsProvider>
    <BrowserRouter>
      <div className="main-layout">
        <DemoBanner />
        <MailModal />
        <ShellRouter />
        <NavGuide />
      </div>
    </BrowserRouter>
    </EventsProvider>
    </MailProvider>
    </MemoryProvider>
    </HistoryProvider>
  )
}
