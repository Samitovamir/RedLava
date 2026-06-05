import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import FluidMenu from './components/FluidMenu.jsx'
import AICommandBar from './components/AICommandBar.jsx'
import { EventsProvider } from './context/EventsContext.jsx'
import { HistoryProvider } from './context/HistoryContext.jsx'
import { MemoryProvider } from './context/MemoryContext.jsx'
import Home from './pages/Home.jsx'
import Schedule from './pages/Schedule.jsx'
import Sport from './pages/Sport.jsx'
import Health from './pages/Health.jsx'
import History from './pages/History.jsx'
import Connections from './pages/Connections.jsx'

export default function App() {
  // Подтягиваем живые данные Whoop и Garmin в localStorage (для страниц и для ИИ)
  useEffect(() => {
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
    <EventsProvider>
    <BrowserRouter>
      <div className="main-layout">
        <FluidMenu />
        <main className="page-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/sport" element={<Sport />} />
            <Route path="/health" element={<Health />} />
            <Route path="/history" element={<History />} />
            <Route path="/connections" element={<Connections />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <AICommandBar />
      </div>
    </BrowserRouter>
    </EventsProvider>
    </MemoryProvider>
    </HistoryProvider>
  )
}
