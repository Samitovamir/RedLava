import { SectionHeader } from '../ui'
import ThemeSwitcher from '../components/ThemeSwitcher.jsx'
import LayoutSwitcher from '../components/LayoutSwitcher.jsx'
import { useLang, useT } from '../context/LanguageContext.jsx'

// Настройки: язык интерфейса + оформление (темы) + раскладка (компоновка).
// Сюда переехали переключатели из сайдбара («EN») и «Подключений».
export default function Settings() {
  const { lang, setLang } = useLang()
  const t = useT({
    ru: {
      title: 'Настройки',
      subtitle: 'Язык и оформление',
      langTitle: 'Язык интерфейса',
      langHint: 'Применяется сразу ко всем разделам',
    },
    en: {
      title: 'Settings',
      subtitle: 'Language and appearance',
      langTitle: 'Interface language',
      langHint: 'Applies instantly to all sections',
    },
  })

  const LANGS = [
    { id: 'ru', label: 'Русский' },
    { id: 'en', label: 'English' },
  ]

  return (
    <div className="settings-page">
      <SectionHeader title={t.title} subtitle={t.subtitle} />

      <div className="card settings-card">
        <div className="settings-card-head">
          <span className="settings-card-title">{t.langTitle}</span>
          <span className="settings-card-hint">{t.langHint}</span>
        </div>
        <div className="settings-lang-row">
          {LANGS.map((l) => (
            <button
              key={l.id}
              className={`settings-lang ${lang === l.id ? 'active' : ''}`}
              onClick={() => setLang(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card settings-card">
        <ThemeSwitcher />
      </div>

      <div className="card settings-card">
        <LayoutSwitcher />
      </div>

      <style>{`
        .settings-page {
          display: flex; flex-direction: column; gap: 20px;
          max-width: 720px;
        }
        .settings-card { display: flex; flex-direction: column; gap: 16px; }
        .settings-card-head { display: flex; flex-direction: column; gap: 4px; }
        .settings-card-title { font-size: 16px; font-weight: 700; color: var(--text-primary); }
        .settings-card-hint { font-size: 13px; color: var(--text-muted); }
        .settings-lang-row { display: flex; gap: 10px; }
        .settings-lang {
          flex: 1; max-width: 200px;
          padding: 12px 16px;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-med);
          background: var(--bg-tile);
          box-shadow: var(--inset-tile, none);
          color: var(--text-body);
          font-family: inherit; font-size: 14.5px; font-weight: 600;
          cursor: pointer;
          transition: border-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
        }
        .settings-lang:hover { border-color: var(--accent); }
        .settings-lang.active {
          border-color: var(--accent);
          color: var(--text-primary);
          box-shadow: inset 0 0 0 1px var(--accent);
        }
      `}</style>
    </div>
  )
}
