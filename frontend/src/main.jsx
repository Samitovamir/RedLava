import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthGate from './components/AuthGate.jsx'
import TasksHelper from './pages/TasksHelper.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import { installAuthFetch } from './api/authFetch.js'
import { applyTheme } from './theme.js'
import './index.css'

// Применяем эффективную тему до рендера (учитывает мобильный + системную тему телефона)
applyTheme()

// Личное приложение помощника (/tasks/h) — публичная страница БЕЗ AuthGate и без тяжёлого
// App (шеллы/sync/провайдеры): помощник входит своим PIN, а не паролем владельца.
const isHelperApp = window.location.pathname.startsWith('/tasks/h')

// Глобальный инжектор токена дашборда — ТОЛЬКО для приложения владельца. В приложении
// помощника НЕ ставим его: у помощника своя PIN-авторизация, а подмешанный из localStorage
// токен владельца/гостя ломает вход (гостевой токен → бэкенд отдаёт demo-заглушку без token →
// «Не удалось сохранить пароль»). Помощник сам шлёт Bearer со своей PIN-сессией где нужно.
if (!isHelperApp) installAuthFetch()

// Приложение помощника — самостоятельная прокручиваемая страница (не дашборд со своим
// внутренним скролл-контейнером). Помечаем html, чтобы вернуть прокрутку документу (см. index.css).
if (isHelperApp) document.documentElement.setAttribute('data-helper', '')

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
