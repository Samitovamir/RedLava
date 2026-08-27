import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthGate from './components/AuthGate.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import { installAuthFetch } from './api/authFetch.js'
import { applyTheme } from './theme.js'
import './index.css'

// Применяем эффективную тему до рендера (учитывает мобильный + системную тему телефона)
applyTheme()

// Глобальный инжектор токена — добавляет Bearer к запросам /api/*
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
