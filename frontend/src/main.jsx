import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthGate from './components/AuthGate.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import { installAuthFetch } from './api/authFetch.js'
import { applyTheme } from './theme.js'
import './index.css'

// Apply the effective theme before rendering (accounts for mobile plus the phone's system theme)
applyTheme()

// The global token injector — adds Bearer to /api/* requests
installAuthFetch()

// Service worker — the offline shell (see public/sw.js) and a prerequisite for a proper
// install to the home screen (Android/Chrome). We register it once the page has fully
// loaded, so that it does not compete for the network with the first paint.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* not critical — we just go without the offline cache */ })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </LanguageProvider>
  </React.StrictMode>
)
