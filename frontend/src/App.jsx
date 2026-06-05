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
