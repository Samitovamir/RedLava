import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthGate from './components/AuthGate.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import { installAuthFetch } from './api/authFetch.js'
import './index.css'

// Подключаем токен ко всем /api запросам до старта приложения
installAuthFetch()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </LanguageProvider>
  </React.StrictMode>
)
