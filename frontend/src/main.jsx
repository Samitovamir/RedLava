import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthGate from './components/AuthGate.jsx'
import TasksHelper from './pages/TasksHelper.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import { installAuthFetch } from './api/authFetch.js'
import { applyTheme } from './theme.js'
import './index.css'

// Подключаем токен ко всем /api запросам до старта приложения
installAuthFetch()

// Применяем эффективную тему до рендера (учитывает мобильный + системную тему телефона)
applyTheme()

// Личное приложение помощника (/tasks/h) — публичная страница БЕЗ AuthGate и без тяжёлого
// App (шеллы/sync/провайдеры): помощник входит своим PIN, а не паролем владельца.
const isHelperApp = window.location.pathname.startsWith('/tasks/h')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      {isHelperApp ? <TasksHelper /> : (
        <AuthGate>
          <App />
        </AuthGate>
      )}
    </LanguageProvider>
  </React.StrictMode>
)
