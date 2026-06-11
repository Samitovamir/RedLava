import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'
import { useT, useLang } from '../context/LanguageContext.jsx'
import { useIsMobile } from '../layout.js'

// Переключатель тем оформления (THEMES_1.md). Самодостаточный — позже легко
// перенести из «Подключений» в «Настройки». Тема хранится в localStorage и
// применяется к <html data-theme="…">; все цвета сайта завязаны на CSS-переменные.

const STORAGE_KEY = 'albert-theme'
const DEFAULT_THEME = 'black-leather'

// id + образцы цветов для превью (фон / поверхность / акцент)
const THEMES = [
  { id: 'black-leather', ru: 'Чёрная кожа',    en: 'Black leather', bg: '#121211', surface: '#1E1E1C', accent: '#8FB2D4' },
  { id: 'brown-leather', ru: 'Коричневая кожа', en: 'Brown leather', bg: '#120E0B', surface: '#271F19', accent: '#C89B6A' },
  { id: 'cream',         ru: 'Кремовая',        en: 'Cream',         bg: '#EFE9DD', surface: '#FDFBF6', accent: '#C97B4A' },
  { id: 'original',      ru: 'Оригинальная',    en: 'Original',      bg: '#1E1B18', surface: '#2C2825', accent: '#818CF8' },
]
// Минималистичные темы под мобильную (iOS-26): показываются на телефоне
// (или если такая тема уже выбрана), на десктопе скрыты.
const MOBILE_THEMES = [
  { id: 'ios-dark',  ru: 'iOS Тёмная',  en: 'iOS Dark',  bg: '#000000', surface: '#1C1C1E', accent: '#0A84FF' },
  { id: 'ios-light', ru: 'iOS Светлая', en: 'iOS Light', bg: '#F2F2F7', surface: '#FFFFFF', accent: '#007AFF' },
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
  const isMobile = useIsMobile()
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME } catch { return DEFAULT_THEME }
  })

  useEffect(() => {
    applyTheme(theme)
    try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* ignore */ }
  }, [theme])

  // iOS-темы — только на мобильном (или если такая тема уже выбрана, чтобы выбор было видно).
  const showMobile = isMobile || theme.startsWith('ios-')
  const list = showMobile ? [...THEMES, ...MOBILE_THEMES] : THEMES

  return (
    <div className="theme-switcher">
      <div className="ts-head">
        <span className="ts-title">{t.title}</span>
        <span className="ts-hint">{t.hint}</span>
      </div>
      <div className="ts-grid">
        {list.map((it) => (
          <button
            key={it.id}
            className={`ts-opt ${theme === it.id ? 'on' : ''}`}
            onClick={() => setTheme(it.id)}
            type="button"
            aria-pressed={theme === it.id}
          >
            <span className="ts-swatch" style={{ background: it.bg }}>
              <span className="ts-swatch-card" style={{ background: it.surface }} />
              <span className="ts-swatch-dot" style={{ background: it.accent }} />
            </span>
            <span className="ts-label">{lang === 'en' ? it.en : it.ru}</span>
            {theme === it.id && (
              <span className="ts-check" aria-hidden="true">
                <Check size={14} strokeWidth={2.5} />
              </span>
            )}
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
          position: relative;
          display: flex; align-items: center; gap: var(--space-3);
          padding: var(--space-3);
          padding-right: calc(var(--space-3) + 22px);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-med);
          background: var(--bg-tile);
          cursor: pointer;
          font-family: inherit;
          transition: border-color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
        }
        .ts-opt:hover { transform: translateY(-1px); border-color: var(--accent); }
        .ts-opt.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
        .ts-check {
          position: absolute; top: var(--space-2); right: var(--space-2);
          display: flex; align-items: center; justify-content: center;
          width: 20px; height: 20px; border-radius: 50%;
          background: var(--accent); color: var(--on-accent);
        }
        .ts-swatch {
          position: relative; flex-shrink: 0;
          width: 44px; height: 32px; border-radius: var(--radius-sm);
          border: 1px solid rgba(0, 0, 0, 0.10); overflow: hidden;
        }
        .ts-swatch-card { position: absolute; left: 6px; top: 7px; width: 22px; height: 18px; border-radius: 4px; border: 1px solid rgba(0, 0, 0, 0.10); }
        .ts-swatch-dot { position: absolute; right: 6px; bottom: 6px; width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(0, 0, 0, 0.10); }
        .ts-label { font-size: 15px; color: var(--foreground); font-weight: 500; }
        @media (max-width: 520px) { .ts-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  )
}
