import { useState, useEffect } from 'react'
import { useT, useLang } from '../context/LanguageContext.jsx'

// Переключатель тем оформления (THEMES_1.md). Самодостаточный — позже легко
// перенести из «Подключений» в «Настройки». Тема хранится в localStorage и
// применяется к <html data-theme="…">; все цвета сайта завязаны на CSS-переменные.

const STORAGE_KEY = 'albert-theme'
const DEFAULT_THEME = 'black-leather'

// id + образцы цветов для превью (фон / поверхность / акцент)
const THEMES = [
  { id: 'black-leather', ru: 'Чёрная кожа',    en: 'Black leather', bg: '#0F0F0E', surface: '#201F1C', accent: '#7BA3C9' },
  { id: 'brown-leather', ru: 'Коричневая кожа', en: 'Brown leather', bg: '#14100D', surface: '#2A211B', accent: '#C89B6A' },
  { id: 'cream',         ru: 'Кремовая',        en: 'Cream',         bg: '#F4F0E8', surface: '#FBF8F2', accent: '#C97B4A' },
  { id: 'original',      ru: 'Оригинальная',    en: 'Original',      bg: '#1E1B18', surface: '#2C2825', accent: '#818CF8' },
]

export function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id)
}

export default function ThemeSwitcher() {
  const t = useT({
    ru: { title: 'Оформление', hint: 'Тема применяется сразу и запоминается' },
    en: { title: 'Appearance', hint: 'Theme applies instantly and is remembered' },
  })
  const { lang } = useLang()
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME } catch { return DEFAULT_THEME }
  })

  useEffect(() => {
    applyTheme(theme)
    try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* ignore */ }
  }, [theme])

  return (
    <div className="theme-switcher">
      <div className="ts-head">
        <span className="ts-title">{t.title}</span>
        <span className="ts-hint">{t.hint}</span>
      </div>
      <div className="ts-grid">
        {THEMES.map((it) => (
          <button
            key={it.id}
            className={`ts-opt ${theme === it.id ? 'on' : ''}`}
            onClick={() => setTheme(it.id)}
            type="button"
          >
            <span className="ts-swatch" style={{ background: it.bg }}>
              <span className="ts-swatch-card" style={{ background: it.surface }} />
              <span className="ts-swatch-dot" style={{ background: it.accent }} />
            </span>
            <span className="ts-label">{lang === 'en' ? it.en : it.ru}</span>
          </button>
        ))}
      </div>

      <style>{`
        .theme-switcher { display: flex; flex-direction: column; gap: var(--space-3); }
        .ts-head { display: flex; flex-direction: column; gap: 2px; }
        .ts-title { font-size: var(--text-title); font-weight: 700; color: var(--foreground); }
        .ts-hint { font-size: var(--text-label); color: var(--muted); }
        .ts-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-3); }
        .ts-opt {
          display: flex; align-items: center; gap: var(--space-3);
          padding: var(--space-3);
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          background: var(--bg-secondary);
          cursor: pointer;
          font-family: inherit;
          transition: border-color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
        }
        .ts-opt:hover { transform: translateY(-1px); border-color: var(--border-hover); }
        .ts-opt.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
        .ts-swatch {
          position: relative; flex-shrink: 0;
          width: 44px; height: 32px; border-radius: var(--radius-sm);
          border: 1px solid var(--border); overflow: hidden;
        }
        .ts-swatch-card { position: absolute; left: 6px; top: 7px; width: 22px; height: 18px; border-radius: 4px; }
        .ts-swatch-dot { position: absolute; right: 6px; bottom: 6px; width: 10px; height: 10px; border-radius: 50%; }
        .ts-label { font-size: 15px; color: var(--foreground); font-weight: 500; }
        @media (max-width: 520px) { .ts-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  )
}
