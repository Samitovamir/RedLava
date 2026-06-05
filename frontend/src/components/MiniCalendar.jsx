import { useState } from 'react'
import { motion } from 'framer-motion'

/*
  Мини-календарь для быстрого перехода к любой дате.
  value — выбранная дата (Date), onSelect(date), onToday().
*/

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function MiniCalendar({ value, onSelect, onToday }) {
  const [view, setView] = useState(new Date(value.getFullYear(), value.getMonth(), 1))
  const today = new Date()

  const year = view.getFullYear()
  const month = view.getMonth()

  // первый день месяца → смещение (понедельник = 0)
  const firstDay = new Date(year, month, 1)
  let startOffset = firstDay.getDay() - 1
  if (startOffset < 0) startOffset = 6
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))

  const prevMonth = () => setView(new Date(year, month - 1, 1))
  const nextMonth = () => setView(new Date(year, month + 1, 1))

  return (
    <motion.div
      className="mc"
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.16 }}
    >
      <div className="mc-head">
        <button className="mc-nav" onClick={prevMonth}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="mc-title">{MONTHS[month]} {year}</span>
        <button className="mc-nav" onClick={nextMonth}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <div className="mc-week">
        {WEEK.map(w => <span key={w} className="mc-wd">{w}</span>)}
      </div>

      <div className="mc-grid">
        {cells.map((d, i) => {
          if (!d) return <span key={i} className="mc-cell empty" />
          const isToday = sameDay(d, today)
          const isSelected = sameDay(d, value)
          const isWeekend = d.getDay() === 0 || d.getDay() === 6
          return (
            <button
              key={i}
              className={`mc-cell ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''}`}
              onClick={() => onSelect(d)}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>

      <button className="mc-today" onClick={onToday}>Сегодня</button>

      <style>{`
        .mc {
          width: 280px;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 16px;
          box-shadow: 0 16px 40px rgba(0,0,0,0.5);
          padding: 14px;
        }
        .mc-head {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 12px;
        }
        .mc-title { font-size: 14px; font-weight: 700; color: var(--foreground); }
        .mc-nav {
          width: 28px; height: 28px;
          border: none; background: transparent;
          color: var(--muted-foreground);
          cursor: pointer; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .mc-nav:hover { background: var(--card); color: var(--foreground); }
        .mc-week {
          display: grid; grid-template-columns: repeat(7, 1fr);
          margin-bottom: 6px;
        }
        .mc-wd {
          text-align: center; font-size: 11px; font-weight: 600;
          color: var(--muted-foreground); padding: 4px 0;
        }
        .mc-grid {
          display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px;
        }
        .mc-cell {
          aspect-ratio: 1;
          border: none; background: transparent;
          color: var(--foreground);
          font-family: inherit; font-size: 13px; font-weight: 500;
          border-radius: 9px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.12s;
        }
        .mc-cell.empty { cursor: default; }
        .mc-cell:not(.empty):hover { background: var(--card); }
        .mc-cell.weekend { color: var(--muted-foreground); }
        .mc-cell.today {
          color: var(--yellow); font-weight: 700;
          box-shadow: inset 0 0 0 1.5px var(--yellow);
        }
        .mc-cell.selected {
          background: var(--primary) !important;
          color: var(--primary-foreground); font-weight: 700;
          box-shadow: none;
        }
        .mc-today {
          width: 100%; margin-top: 12px;
          padding: 9px; border-radius: 10px;
          border: 1px solid var(--border); background: transparent;
          color: var(--primary); font-family: inherit;
          font-size: 13px; font-weight: 600; cursor: pointer;
          transition: all 0.15s;
        }
        .mc-today:hover { border-color: var(--border-hover); background: var(--card); }
      `}</style>
    </motion.div>
  )
}
