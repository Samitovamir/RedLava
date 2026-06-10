import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { variants } from './motion.js'
import FluidMenu from './components/FluidMenu.jsx'
import WhatsNew from './components/WhatsNew.jsx'
import MailModal from './components/MailModal.jsx'
import DemoBanner from './components/DemoBanner.jsx'
import { isGuest } from './api/authFetch.js'
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
import Connections from './pages/Connections.jsx'
import Settings from './pages/Settings.jsx'

// Переходы между разделами: fade + лёгкий подъём (variants.pageEnter из motion.js).
// useLocation требует Router-контекст, поэтому анимированные роуты — отдельным
// компонентом внутри BrowserRouter. FluidMenu и модалки живут вне <main> и не дёргаются.
function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.main
        className="page-content"
        key={location.pathname}
        initial={variants.pageEnter.initial}
        animate={variants.pageEnter.animate}
        exit={variants.pageEnter.exit}
        transition={variants.pageEnter.transition}
      >
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/sport" element={<Navigate to="/health" replace />} />
          <Route path="/health" element={<Health />} />
          <Route path="/nutrition" element={<Nutrition />} />
          <Route path="/mail" element={<Mail />} />
          <Route path="/history" element={<History />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.main>
    </AnimatePresence>
  )
}

export default function App() {
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

  return (
    <HistoryProvider>
    <MemoryProvider>
    <MailProvider>
    <EventsProvider>
    <BrowserRouter>
      <div className="main-layout">
        <WhatsNew />
        <DemoBanner />
        <MailModal />
        <FluidMenu />
        <AnimatedRoutes />
      </div>
    </BrowserRouter>
    </EventsProvider>
    </MailProvider>
    </MemoryProvider>
    </HistoryProvider>
  )
}
