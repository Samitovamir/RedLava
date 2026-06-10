import { Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, UtensilsCrossed } from 'lucide-react'
import { useT } from '../context/LanguageContext.jsx'

/*
  Тонкая строка-статус под быстрыми карточками: неброские факты дня через точку
  (сон · питание · письма). Только из реальных данных. Почты пока нет — задел ниже.
  Оформлена аккуратной плашкой-контейнером (var(--bg-tile)), чтобы не висеть сиротой
  между карточками и блоком ИИ.
*/

function readWhoop() {
  try { const s = localStorage.getItem('albert-whoop-live'); if (s) return JSON.parse(s) } catch { /* ignore */ }
  return null
}
function hasMealPlan() {
  try { const s = localStorage.getItem('albert-meal-plan'); const o = s ? JSON.parse(s) : null; return !!(o && Object.keys(o).length) } catch { return false }
}

export default function DayStatusStrip() {
  const navigate = useNavigate()
  const t = useT({
    ru: { sleep: 'Сон', h: 'ч', menuReady: 'Питание: меню готово', menuNot: 'Питание: меню не готово' /*, mail: n => `Письма: ${n} новых` */ },
    en: { sleep: 'Sleep', h: 'h', menuReady: 'Nutrition: menu ready', menuNot: 'Nutrition: no menu yet' /*, mail: n => `Mail: ${n} new` */ }
  })

  const whoop = readWhoop()
  const items = []
  // Единый формат единиц: число + пробел + единица («7.3 ч»).
  if (whoop?.sleep?.hoursSlept != null) items.push({ icon: Moon, text: `${t.sleep} ${whoop.sleep.hoursSlept} ${t.h}`, link: '/health' })
  items.push({ icon: UtensilsCrossed, text: hasMealPlan() ? t.menuReady : t.menuNot, link: '/nutrition' })
  // Почта появится позже — тогда раскомментировать (и подтянуть число непрочитанных):
  // items.push({ text: t.mail(mail.unread), link: '/mail' })

  if (!items.length) return null

  return (
    <div className="day-strip">
      {items.map((it, i) => {
        const Icon = it.icon
        return (
          <Fragment key={i}>
            {i > 0 && <span className="day-strip-dot">·</span>}
            <button className="day-strip-item" onClick={() => navigate(it.link)}>
              <Icon size={15} strokeWidth={1.5} />
              <span>{it.text}</span>
            </button>
          </Fragment>
        )
      })}

      <style>{`
        .day-strip {
          display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px;
          padding: 11px 16px; font-size: 13px; color: var(--text-muted);
          background: var(--bg-tile); border: 1px solid var(--border-med);
          border-radius: var(--radius-md);
        }
        .day-strip-item {
          display: inline-flex; align-items: center; gap: 7px;
          background: none; border: none; padding: 0;
          font-family: inherit; font-size: inherit; color: var(--text-muted);
          cursor: pointer; transition: color 0.15s;
        }
        .day-strip-item:hover { color: var(--foreground); }
        .day-strip-item svg { color: var(--muted); }
        .day-strip-item:hover svg { color: var(--accent); }
        .day-strip-dot { color: var(--text-muted); opacity: 0.4; }
      `}</style>
    </div>
  )
}
