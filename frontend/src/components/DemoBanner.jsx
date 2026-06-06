import { isGuest } from '../api/authFetch.js'

// Ненавязчивая плашка для гостевого входа: данные — демо, не настоящие.
export default function DemoBanner() {
  if (!isGuest()) return null
  return (
    <div className="demo-banner" title="Вы вошли как гость. Все данные — пример, личные данные недоступны.">
      <span className="demo-dot" />
      Демо-режим — данные для примера
      <style>{`
        .demo-banner {
          position: fixed; top: 14px; right: 16px; z-index: 800;
          display: flex; align-items: center; gap: 8px;
          background: var(--bg-card); border: 1px solid var(--border);
          color: var(--muted); font-size: 12.5px; font-weight: 600;
          padding: 7px 12px; border-radius: 999px;
          box-shadow: 0 6px 18px rgba(0,0,0,0.35);
          font-family: Inter, system-ui, sans-serif; pointer-events: auto;
        }
        .demo-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--yellow); flex-shrink: 0; }
      `}</style>
    </div>
  )
}
