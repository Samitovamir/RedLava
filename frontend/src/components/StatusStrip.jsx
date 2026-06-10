import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, HeartPulse, UtensilsCrossed, Clock } from 'lucide-react'
import { useEvents, dateKey } from '../context/EventsContext.jsx'
import { useT, useLang } from '../context/LanguageContext.jsx'
import { mskNow } from '../utils/time.js'

/*
  Глобальная статус-строка раскладки «Командный центр»: сон · готовность ·
  питание · следующее событие · часы. Видна на всех страницах (рендерится в App
  только при data-layout="command"). Только реальные данные — пустые источники
  просто не показываются. На мобиле скрыта (узко).
*/

function readWhoop() {
  try { const s = localStorage.getItem('albert-whoop-live'); if (s) return JSON.parse(s) } catch { /* ignore */ }
  return null
}
function hasMealPlan() {
  try { const s = localStorage.getItem('albert-meal-plan'); const o = s ? JSON.parse(s) : null; return !!(o && Object.keys(o).length) } catch { return false }
}

export default function StatusStrip() {
  const navigate = useNavigate()
  const { lang } = useLang()
  const { events } = useEvents()
  const t = useT({
    ru: { sleep: 'Сон', h: 'ч', rec: 'Готовность', menuOk: 'Меню готово', menuNo: 'Меню не готово', next: 'Далее', free: 'День свободен' },
    en: { sleep: 'Sleep', h: 'h', rec: 'Recovery', menuOk: 'Menu ready', menuNo: 'No menu yet', next: 'Next', free: 'Day is free' },
  })

  // Часы — живые, обновление раз в 30 секунд
  const [now, setNow] = useState(mskNow)
  useEffect(() => {
    const id = setInterval(() => setNow(mskNow()), 30000)
    return () => clearInterval(id)
  }, [])
  const pad = (n) => String(n).padStart(2, '0')
  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}`

  const whoop = readWhoop()
  const pick = (o, f) => (lang === 'en' && o[f + 'En']) ? o[f + 'En'] : o[f]
  const todayKey = dateKey(now)
  const nowHM = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const nextEv = events
    .filter(e => e.date === todayKey && (e.end || e.start) >= nowHM)
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''))[0] || null

  const items = []
  if (whoop?.sleep?.hoursSlept != null) items.push({ icon: Moon, text: `${t.sleep} ${whoop.sleep.hoursSlept} ${t.h}`, link: '/health' })
  if (whoop?.recovery != null) items.push({ icon: HeartPulse, text: `${t.rec} ${whoop.recovery}%`, link: '/health' })
  items.push({ icon: UtensilsCrossed, text: hasMealPlan() ? t.menuOk : t.menuNo, link: '/nutrition' })
  items.push(nextEv
    ? { icon: Clock, text: `${t.next}: ${nextEv.start} ${pick(nextEv, 'title')}`, link: '/schedule', strong: true }
    : { icon: Clock, text: t.free, link: '/schedule' })

  return (
    <div className="status-strip">
      <div className="ss-items">
        {items.map((it, i) => {
          const Icon = it.icon
          return (
            <button key={i} className={`ss-item ${it.strong ? 'strong' : ''}`} onClick={() => navigate(it.link)}>
              <Icon size={14} strokeWidth={1.7} />
              <span>{it.text}</span>
            </button>
          )
        })}
      </div>
      <span className="ss-clock">{clock}</span>

      <style>{`
        .status-strip {
          position: fixed; top: 0; right: 0; left: var(--sidebar-width);
          z-index: 90;
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
          height: var(--status-strip-h, 42px);
          padding: 0 20px;
          background: color-mix(in srgb, var(--bg-surface) 86%, transparent);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--border);
          transition: left var(--dur-base) var(--ease);
        }
        html[data-nav-pinned] .status-strip { left: var(--sidebar-width-expanded); }
        .ss-items { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; }
        .ss-item {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 5px 10px; border: none; border-radius: 8px;
          background: transparent;
          font-family: inherit; font-size: 12.5px; color: var(--text-muted);
          cursor: pointer; white-space: nowrap;
          transition: color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
        }
        .ss-item:hover { color: var(--foreground); background: var(--bg-tile); }
        .ss-item svg { color: var(--muted); flex-shrink: 0; }
        .ss-item:hover svg { color: var(--accent); }
        .ss-item.strong { color: var(--text-body); font-weight: 600; }
        .ss-clock {
          font-size: 13px; font-weight: 700; color: var(--text-primary);
          font-variant-numeric: tabular-nums; letter-spacing: 0.03em;
          flex-shrink: 0;
        }
        @media (max-width: 640px) { .status-strip { display: none; } }
      `}</style>
    </div>
  )
}
