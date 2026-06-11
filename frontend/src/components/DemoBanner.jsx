import { isGuest } from '../api/authFetch.js'
import { useT } from '../context/LanguageContext.jsx'

// Ненавязчивая плашка для гостевого входа: данные — демо, не настоящие.
export default function DemoBanner() {
  const t = useT({
    ru: {
      tooltip: 'Вы вошли как гость. Все данные — пример, личные данные недоступны.',
      label: 'Демо-режим — данные для примера',
      short: 'Демо',
    },
    en: {
      tooltip: 'You’re signed in as a guest. All data is sample data; personal data is unavailable.',
      label: 'Demo mode — sample data',
      short: 'Demo',
    },
  })
  if (!isGuest()) return null
  return (
    <div className="demo-banner" title={t.tooltip}>
      <span className="demo-dot" />
      <span className="demo-label-full">{t.label}</span>
      <span className="demo-label-short">{t.short}</span>
      <style>{`
        .demo-banner {
          position: fixed; top: 14px; right: 16px; z-index: 800;
          display: flex; align-items: center; gap: 8px;
          background: var(--bg-card); border: 1px solid var(--border);
          color: var(--muted); font-size: 12.5px; font-weight: 600;
          padding: 7px 12px; border-radius: 999px;
          box-shadow: 0 6px 18px rgba(0,0,0,0.35);
          font-family: inherit; pointer-events: auto;
        }
        .demo-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--yellow); flex-shrink: 0; }
        .demo-label-short { display: none; }
        /* На телефоне бейдж компактный («Демо») — не перекрывает заголовки страниц */
        @media (max-width: 640px) {
          .demo-banner { top: calc(8px + env(safe-area-inset-top)); right: 10px; padding: 5px 10px; font-size: 11.5px; }
          .demo-label-full { display: none; }
          .demo-label-short { display: inline; }
        }
      `}</style>
    </div>
  )
}
