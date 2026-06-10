import { Check } from 'lucide-react'
import { useT, useLang } from '../context/LanguageContext.jsx'
import { LAYOUTS, applyLayout, useLayout } from '../layout.js'

/*
  Переключатель раскладок («что где находится») — сосед ThemeSwitcher в Настройках.
  Каждый вариант показан мини-схемой компоновки (чистый CSS, цвета из токенов).
  Раскладка применяется мгновенно (data-layout на <html>) и запоминается.
*/

// Мини-схема компоновки: набор «блоков» для каждой раскладки
function LayoutSketch({ id }) {
  if (id === 'classic') return (
    <span className="ls-sketch" aria-hidden="true">
      <i className="b" style={{ inset: '8% 8% auto 8%', height: '16%' }} />
      <i className="b" style={{ inset: '32% 8% auto 8%', height: '22%' }} />
      <i className="b" style={{ inset: '62% 8% auto 8%', height: '28%' }} />
    </span>
  )
  if (id === 'cockpit') return (
    <span className="ls-sketch" aria-hidden="true">
      <i className="b" style={{ inset: '8% 38% auto 8%', height: '34%' }} />
      <i className="b" style={{ inset: '8% 8% auto 66%', height: '34%' }} />
      <i className="b" style={{ inset: '50% 66% auto 8%', height: '20%' }} />
      <i className="b" style={{ inset: '50% 37% auto 37%', height: '20%' }} />
      <i className="b" style={{ inset: '50% 8% auto 66%', height: '20%' }} />
      <i className="b acc" style={{ inset: '78% 8% auto 8%', height: '12%' }} />
    </span>
  )
  if (id === 'journal') return (
    <span className="ls-sketch" aria-hidden="true">
      <i className="b" style={{ inset: '8% 26% auto 26%', height: '18%' }} />
      <i className="b" style={{ inset: '34% 26% auto 26%', height: '12%' }} />
      <i className="b" style={{ inset: '54% 26% auto 26%', height: '12%' }} />
      <i className="b acc" style={{ inset: '74% 26% auto 26%', height: '14%' }} />
    </span>
  )
  // command
  return (
    <span className="ls-sketch" aria-hidden="true">
      <i className="b acc" style={{ inset: '8% 8% auto 8%', height: '10%' }} />
      <i className="b" style={{ inset: '26% 66% auto 8%', height: '64%' }} />
      <i className="b" style={{ inset: '26% 37% auto 37%', height: '64%' }} />
      <i className="b" style={{ inset: '26% 8% auto 66%', height: '64%' }} />
    </span>
  )
}

export default function LayoutSwitcher() {
  const t = useT({
    ru: { title: 'Раскладка', hint: 'Что где находится — применяется сразу и запоминается' },
    en: { title: 'Layout', hint: 'What goes where — applies instantly and is remembered' },
  })
  const { lang } = useLang()
  const layout = useLayout()

  return (
    <div className="layout-switcher">
      <div className="ls-head">
        <span className="ls-title">{t.title}</span>
        <span className="ls-hint">{t.hint}</span>
      </div>
      <div className="ls-grid">
        {LAYOUTS.map((it) => (
          <button
            key={it.id}
            className={`ls-opt ${layout === it.id ? 'on' : ''}`}
            onClick={() => applyLayout(it.id)}
            type="button"
            aria-pressed={layout === it.id}
          >
            <LayoutSketch id={it.id} />
            <span className="ls-text">
              <span className="ls-label">{lang === 'en' ? it.en : it.ru}</span>
              <span className="ls-sub">{lang === 'en' ? it.enHint : it.ruHint}</span>
            </span>
            {layout === it.id && (
              <span className="ls-check" aria-hidden="true">
                <Check size={14} strokeWidth={2.5} />
              </span>
            )}
          </button>
        ))}
      </div>

      <style>{`
        .layout-switcher { display: flex; flex-direction: column; gap: var(--space-3); }
        .ls-head { display: flex; flex-direction: column; gap: 2px; }
        .ls-title { font-size: var(--text-title); font-weight: 700; color: var(--foreground); }
        .ls-hint { font-size: var(--text-label); color: var(--muted); }
        .ls-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-3); }
        .ls-opt {
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
        .ls-opt:hover { transform: translateY(-1px); border-color: var(--accent); }
        .ls-opt.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
        .ls-check {
          position: absolute; top: var(--space-2); right: var(--space-2);
          display: flex; align-items: center; justify-content: center;
          width: 20px; height: 20px; border-radius: 50%;
          background: var(--accent); color: var(--on-accent);
        }
        .ls-sketch {
          position: relative; flex-shrink: 0;
          width: 52px; height: 38px; border-radius: var(--radius-sm);
          background: var(--bg-app);
          border: 1px solid var(--border-med);
          overflow: hidden;
        }
        .ls-sketch .b {
          position: absolute; display: block;
          background: var(--text-faint);
          opacity: 0.55;
          border-radius: 2px;
        }
        .ls-sketch .b.acc { background: var(--accent); opacity: 0.9; }
        .ls-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .ls-label { font-size: 15px; color: var(--foreground); font-weight: 600; }
        .ls-sub { font-size: 12px; color: var(--muted); line-height: 1.4; }
        @media (max-width: 640px) { .ls-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  )
}
