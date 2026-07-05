import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'
import { useT, useLang } from '../context/LanguageContext.jsx'
import { useIsMobile } from '../layout.js'
import { getDesktopTheme, setDesktopTheme, getMobilePref, setMobilePref } from '../theme.js'

// Переключатель тем. На десктопе — кожаные темы (выбор пользователя). На телефоне —
// только минималистичные iOS-темы + «Авто» (подстраивается под оформление телефона).
// Тема хранится раздельно (albert-theme / albert-theme-mobile) и применяется к
// <html data-theme>; все цвета сайта завязаны на CSS-переменные.

// Десктоп: образцы фон / поверхность / акцент для превью
const DESKTOP_THEMES = [
  { id: 'black-leather', ru: 'Тёмная',   en: 'Dark',  sub: { ru: 'Чёрная кожа', en: 'Black leather' }, bg: '#121211', surface: '#1E1E1C', accent: '#8FB2D4' },
  { id: 'brown-leather', ru: 'Коричневая кожа', en: 'Brown leather', bg: '#120E0B', surface: '#271F19', accent: '#C89B6A' },
  { id: 'cream',         ru: 'Кремовая',        en: 'Cream',         bg: '#EFE9DD', surface: '#FDFBF6', accent: '#C97B4A' },
  { id: 'original',      ru: 'Оригинальная',    en: 'Original',      bg: '#1E1B18', surface: '#2C2825', accent: '#818CF8' },
]
// Телефон: «Авто» + две iOS-темы
const MOBILE_OPTIONS = [
  { id: 'auto',      ru: 'Авто',        en: 'Auto',      sub: { ru: 'Как на телефоне', en: 'Matches your phone' }, auto: true },
  { id: 'ios-dark',  ru: 'iOS Тёмная',  en: 'iOS Dark',  bg: '#000000', surface: '#1C1C1E', accent: '#0A84FF' },
  { id: 'ios-light', ru: 'iOS Светлая', en: 'iOS Light', bg: '#F2F2F7', surface: '#FFFFFF', accent: '#007AFF' },
  { id: 'brown-leather', ru: 'Коричневая кожа', en: 'Brown leather', bg: '#120E0B', surface: '#271F19', accent: '#C89B6A' },
]

export default function ThemeSwitcher() {
  const t = useT({
    ru: { title: 'Оформление', hint: 'Тема применяется сразу и запоминается' },
    en: { title: 'Appearance', hint: 'Theme applies instantly and is remembered' },
  })
  const { lang } = useLang()
  const isMobile = useIsMobile()
  const [sel, setSel] = useState(() => (isMobile ? getMobilePref() : getDesktopTheme()))

  // Пересинхронизируем выделение при смене устройства / внешней смене темы
  useEffect(() => {
    const sync = () => setSel(isMobile ? getMobilePref() : getDesktopTheme())
    sync()
    window.addEventListener('albert-theme-change', sync)
    return () => window.removeEventListener('albert-theme-change', sync)
  }, [isMobile])

  const list = isMobile ? MOBILE_OPTIONS : DESKTOP_THEMES
  const pick = (id) => {
    if (isMobile) setMobilePref(id); else setDesktopTheme(id)
    setSel(id)
  }

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
            className={`ts-opt ${sel === it.id ? 'on' : ''}`}
            onClick={() => pick(it.id)}
            type="button"
            aria-pressed={sel === it.id}
          >
            {it.auto ? (
              <span className="ts-swatch ts-swatch--auto" aria-hidden="true">
                <span className="ts-swatch-dot" style={{ background: '#0A84FF' }} />
              </span>
            ) : (
              <span className="ts-swatch" style={{ background: it.bg }}>
                <span className="ts-swatch-card" style={{ background: it.surface }} />
                <span className="ts-swatch-dot" style={{ background: it.accent }} />
              </span>
            )}
            <span className="ts-text">
              <span className="ts-label">{lang === 'en' ? it.en : it.ru}</span>
              {it.sub && <span className="ts-sub">{lang === 'en' ? it.sub.en : it.sub.ru}</span>}
            </span>
            {sel === it.id && (
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
          text-align: left;
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
        /* «Авто»: диагональ тёмная/светлая — намёк, что тема следует за телефоном */
        .ts-swatch--auto { background: linear-gradient(125deg, #000 0 50%, #F2F2F7 50% 100%); }
        .ts-swatch-card { position: absolute; left: 6px; top: 7px; width: 22px; height: 18px; border-radius: 4px; border: 1px solid rgba(0, 0, 0, 0.10); }
        .ts-swatch-dot { position: absolute; right: 6px; bottom: 6px; width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(0, 0, 0, 0.10); }
        .ts-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .ts-label { font-size: 15px; color: var(--foreground); font-weight: 500; }
        .ts-sub { font-size: 11.5px; color: var(--muted); }
        @media (max-width: 520px) { .ts-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  )
}
