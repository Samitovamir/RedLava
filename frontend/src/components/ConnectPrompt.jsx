import { useNavigate } from 'react-router-dom'
import { useT } from '../context/LanguageContext.jsx'

/*
  Пустое состояние для неподключённого сервиса — вместо выдуманных данных.
  Показывает понятный призыв подключить и кнопку на страницу «Подключения».
*/
export default function ConnectPrompt({ heading, sub, title, text, children }) {
  const nav = useNavigate()
  const t = useT({ ru: { go: 'Перейти к подключениям' }, en: { go: 'Go to connections' } })
  return (
    <div className="cp-page">
      <div className="cp-header">
        <h2>{heading}</h2>
        {sub && <span className="cp-sub muted">{sub}</span>}
      </div>

      <div className="card cp-card">
        <div className="cp-ic">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22v-5"/><path d="M9 7V2"/><path d="M15 7V2"/>
            <path d="M6 13V8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4Z"/>
          </svg>
        </div>
        <div className="cp-title">{title}</div>
        <div className="cp-text">{text}</div>
        <button className="cp-btn" onClick={() => nav('/connections')}>{t.go}</button>
      </div>

      {children}

      <style>{`
        .cp-page { display: flex; flex-direction: column; gap: 22px; max-width: 1400px; padding-bottom: 20px; }
        .cp-header { display: flex; align-items: baseline; gap: 12px; }
        .cp-header h2 { font-size: 24px; font-weight: 700; color: var(--foreground); }
        .cp-sub { font-size: 14px; }
        .cp-card { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px; padding: 48px 28px; }
        .cp-ic { width: 64px; height: 64px; border-radius: 18px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); display: flex; align-items: center; justify-content: center; }
        .cp-title { font-size: 20px; font-weight: 700; color: var(--foreground); }
        .cp-text { font-size: 15px; color: var(--muted-foreground); max-width: 440px; line-height: 1.6; }
        .cp-btn { margin-top: 6px; padding: 12px 24px; border: none; border-radius: 12px; background: var(--accent); color: var(--accent-foreground); font-family: inherit; font-size: 15px; font-weight: 600; cursor: pointer; transition: opacity 0.15s; }
        .cp-btn:hover { opacity: 0.9; }
      `}</style>
    </div>
  )
}
