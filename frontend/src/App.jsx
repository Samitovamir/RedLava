import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { variants } from './motion.js'
import FluidMenu from './components/FluidMenu.jsx'
import MailModal from './components/MailModal.jsx'
import ConfirmAiActionModal from './components/ConfirmAiActionModal.jsx'
import DemoBanner from './components/DemoBanner.jsx'
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
// Pages are imported normally (not lazily): lazy loading + Suspense + AnimatePresence gave a
// white screen when switching tabs. The heavy scanner (BarcodeScanner) is in its own chunk
// anyway (lazy import in DiaryTab), so the bundle stays split without risking a blank screen.
import Home from './pages/Home.jsx'
import Schedule from './pages/Schedule.jsx'
import Health from './pages/Health.jsx'
import Nutrition from './pages/Nutrition.jsx'
import Mail from './pages/Mail.jsx'
import History from './pages/History.jsx'
import Settings from './pages/Settings.jsx'

// Transitions between sections: a fade plus a slight rise (variants.pageEnter from motion.js).
// useLocation needs the Router context, so the animated routes live in a component of their
// own inside BrowserRouter. FluidMenu and the modals sit outside <main> and don't twitch.
function AnimatedRoutes() {
  const location = useLocation()
  const isMobile = useIsMobile()
  // On mobile, a light fade (no transform on the whole page, and an instant exit),
  // so switching tabs stays smooth and taps don't feel delayed.
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
          <Route path="/sport" element={<Health view="activity" />} />
          <Route path="/health" element={<Health view="metrics" />} />
          <Route path="/nutrition" element={<Nutrition />} />
          <Route path="/mail" element={MAIL_ENABLED ? <Mail /> : <Navigate to="/" replace />} />
          <Route path="/history" element={HISTORY_ENABLED ? <History /> : <Navigate to="/" replace />} />
          {/* "Connections" has been folded into Settings — old links lead there */}
          <Route path="/connections" element={<Navigate to="/settings" replace />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.main>
    </AnimatePresence>
  )
}

// A layout is the site's SHELL: its own navigation, windows and structure over the same data.
// classic — sections plus a sidebar (the original); cockpit — the whole site on one screen,
// with sections popping up as windows; journal — chapters with tabs along the top; command —
// a desktop built from three permanent panels.
function ShellRouter() {
  const layout = useLayout()
  const isMobile = useIsMobile()
  // On mobile it's always "classic": the other shells look bad on a narrow screen
  // (the owner's decision). The user's own preference is kept for desktop.
  const effective = isMobile ? 'classic' : layout
  // Keep html[data-layout] in step with the effective layout, so the journal/cockpit/command
  // CSS rules don't end up applied to classic on mobile.
  useEffect(() => {
    document.documentElement.setAttribute('data-layout', effective)
  }, [effective])
  if (effective === 'command') return <CommandShell />
  return (
    <>
      <FluidMenu />
      <AnimatedRoutes />
    </>
  )
}

export default function App() {
  // Keep the theme in step, live, with the device and the phone's appearance (dark/light).
  useThemeSync()

  // Cross-device sync: BEFORE showing the app we pull the user's data from the server
  // (schedule/memory/blood tests/nutrition), then start the background push.
  // We don't block for longer than 4 s if the network hangs.
  const [synced, setSynced] = useState(false)
  useEffect(() => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      setSynced(true)
      startSync()
    }
    pullSync().finally(finish)
    const tmr = setTimeout(finish, 4000)
    return () => clearTimeout(tmr)
  }, [])

  // Pull live Whoop and Garmin data into localStorage (for the pages and for the AI).
  // A guest runs on demo data — we don't request the real thing (and don't overwrite the demo).
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
        <ConfirmAiActionModal />
        <ShellRouter />
      </div>
    </BrowserRouter>
    </EventsProvider>
    </MailProvider>
    </MemoryProvider>
    </HistoryProvider>
  )
}
