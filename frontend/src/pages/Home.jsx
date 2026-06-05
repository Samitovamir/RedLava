import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import AIWorkZone from '../components/AIWorkZone.jsx'
import DaySchedule from '../components/DaySchedule.jsx'
import DaySummary from '../components/DaySummary.jsx'
import { getQuoteOfDay } from '../utils/quotes.js'
import { useEvents } from '../context/EventsContext.jsx'

const FALL_STEP = 0.028          // задержка между падением соседних символов/единиц (сек)
const FALL_EASE = [0.45, 0, 0.9, 0.4] // ease-in — имитация гравитации

// Текст, падающий посимвольно. start — глобальный индекс первого символа.
function FallText({ text, fallen, start, className, tag = 'span' }) {
  const Tag = motion[tag]
  return (
    <Tag className={className} aria-label={text}>
      {[...text].map((ch, i) => (
        <motion.span
          key={i}
          style={{ display: 'inline-block', whiteSpace: 'pre' }}
          animate={fallen
            ? { y: '110vh', x: Math.random() * 50 - 25, rotate: Math.random() * 100 - 50, opacity: 0,
                transition: { duration: 1.1, delay: (start + i) * FALL_STEP, ease: FALL_EASE } }
            : { y: 0, x: 0, rotate: 0, opacity: 1, transition: { duration: 0.3 } }}
        >
          {ch}
        </motion.span>
      ))}
    </Tag>
  )
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Доброе утро'
  if (hour >= 12 && hour < 17) return 'Добрый день'
  if (hour >= 17 && hour < 22) return 'Добрый вечер'
  return 'Доброй ночи'
}

function formatDate() {
  const d = new Date()
  const days = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`
}

const ICON_CAL = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)
const ICON_RUN = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>
  </svg>
)
const ICON_WHOOP = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
  </svg>
)
const ICON_SLEEP = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)

function readWhoopLive() {
  try { const s = localStorage.getItem('albert-whoop-live'); return s ? JSON.parse(s) : null } catch { return null }
}

function readGarminLive() {
  try { const s = localStorage.getItem('albert-garmin-live'); return s ? JSON.parse(s) : null } catch { return null }
}

// Ближайшее (или текущее) событие из расписания
function nextEvent(events) {
  const now = new Date(); const p = n => String(n).padStart(2, '0')
  const nowKey = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`
  return [...events].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .find(e => `${e.date} ${e.end || e.start}` >= nowKey) || null
}

function humanDate(dateStr) {
  const p = n => String(n).padStart(2, '0'); const d0 = new Date()
  const today = `${d0.getFullYear()}-${p(d0.getMonth() + 1)}-${p(d0.getDate())}`
  const tm = new Date(d0); tm.setDate(d0.getDate() + 1)
  const tomorrow = `${tm.getFullYear()}-${p(tm.getMonth() + 1)}-${p(tm.getDate())}`
  if (dateStr === today) return 'сегодня'
  if (dateStr === tomorrow) return 'завтра'
  const [, m, dd] = dateStr.split('-')
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
  return `${Number(dd)} ${months[Number(m) - 1]}`
}

export default function Home() {
  const [fallen, setFallen] = useState(false)
  const [answer, setAnswer] = useState('')
  const [wrong, setWrong] = useState(false)
  const scheduleRef = useRef(null)

  // Вернуть сайт можно, только решив пример (ответ 9986)
  function checkAnswer(e) {
    e.preventDefault()
    if (answer.trim() === '9986') {
      setFallen(false); setAnswer(''); setWrong(false)
    } else {
      setWrong(true)
    }
  }
  const navigate = useNavigate()
  const quote = getQuoteOfDay()
  const { events } = useEvents()

  // Карточки только из реальных данных (иначе — «Подключите …», без выдумок)
  const whoop = readWhoopLive()
  const garmin = readGarminLive()
  const lastW = garmin?.lastWorkout
  const nextEv = nextEvent(events)
  const cards = [
    nextEv
      ? { label: 'Следующее событие', value: nextEv.title, sub: `${humanDate(nextEv.date)} · ${nextEv.start}`, color: 'var(--accent)', scrollTo: true, icon: ICON_CAL }
      : { label: 'Следующее событие', value: 'Нет событий', sub: events.length ? 'на ближайшее время' : 'Подключите Google Календарь', color: 'var(--accent)', link: events.length ? undefined : '/connections', scrollTo: !!events.length, icon: ICON_CAL },
    lastW
      ? { label: 'Последняя тренировка', value: lastW.label, sub: [lastW.distanceKm ? `${lastW.distanceKm} км` : null, lastW.durationMin ? `${lastW.durationMin} мин` : null, lastW.pace ? `${lastW.pace}/км` : null].filter(Boolean).join(' · ') || humanDate(lastW.date), color: 'var(--orange)', link: '/sport', icon: ICON_RUN }
      : { label: 'Последняя тренировка', value: '—', sub: 'Подключите Garmin', color: 'var(--orange)', link: '/connections', icon: ICON_RUN },
    whoop
      ? { label: 'Recovery Whoop', value: `${whoop.recovery}%`, sub: whoop.recovery >= 67 ? 'хорошее восстановление' : whoop.recovery >= 34 ? 'среднее восстановление' : 'низкое восстановление', color: 'var(--green)', progress: whoop.recovery, link: '/health', icon: ICON_WHOOP }
      : { label: 'Recovery Whoop', value: '—', sub: 'Подключите Whoop', color: 'var(--green)', link: '/connections', icon: ICON_WHOOP },
    whoop
      ? { label: 'Сон', value: `${whoop.sleep.hoursSlept} ч`, sub: `эффективность ${whoop.sleep.efficiency}%`, color: 'var(--accent)', progress: whoop.sleep.efficiency, link: '/health', icon: ICON_SLEEP }
      : { label: 'Сон', value: '—', sub: 'Подключите Whoop', color: 'var(--accent)', link: '/connections', icon: ICON_SLEEP }
  ]

  const scrollToSchedule = () => {
    const el = scheduleRef.current
    const container = el?.closest('.page-content')
    if (!el || !container) return
    const target = container.scrollTop + (el.getBoundingClientRect().top - container.getBoundingClientRect().top) - 16
    container.scrollTo({ top: target, behavior: 'smooth' })
  }

  // Тексты и их позиции в общей последовательности падения (сверху вниз)
  const dateStr = formatDate()
  const greetStr = `${getGreeting()}, владелец`
  const quoteStr = quote.text
  const authorStr = `— ${quote.author}`

  const iDate = 0
  const iGreet = iDate + dateStr.length
  const iBtn = iGreet + greetStr.length
  const iQuote = iBtn + 1
  const iAuthor = iQuote + quoteStr.length
  const iCards = iAuthor + authorStr.length     // быстрые карточки
  const iAIWZ = iCards + cards.length            // рабочая зона
  const iGrid = iAIWZ + 1                        // расписание + сводка
  const iLast = iGrid + 2
  const overlayDelay = (iLast + 2) * FALL_STEP

  // падение крупной единицы (карточка/блок) по её индексу в последовательности
  const unitFall = (idx) => fallen
    ? { y: '120vh', rotate: idx % 2 ? 8 : -8, opacity: 0,
        transition: { duration: 1.1, delay: idx * FALL_STEP, ease: FALL_EASE } }
    : { y: 0, rotate: 0, opacity: 1, transition: { duration: 0.4 } }

  return (
    <div className="home-page">
      <div className="home-header">
        <div className="header-left">
          <FallText text={dateStr} fallen={fallen} start={iDate} className="home-date" />
          <FallText text={greetStr} fallen={fallen} start={iGreet} className="greeting" tag="h1" />
          <motion.button className="huli-btn" onClick={() => setFallen(f => !f)} animate={unitFall(iBtn)}>хули-ули</motion.button>
        </div>
        <div className="quote-of-day">
          <FallText text={quoteStr} fallen={fallen} start={iQuote} className="quote-text" tag="p" />
          <FallText text={authorStr} fallen={fallen} start={iAuthor} className="quote-author" />
        </div>
      </div>

      <div className="quick-cards">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            className={`card quick-card ${c.scrollTo || c.link ? 'clickable' : ''}`}
            animate={unitFall(iCards + i)}
            whileHover={fallen ? undefined : { y: -4 }}
            onClick={c.scrollTo ? scrollToSchedule : c.link ? () => navigate(c.link) : undefined}
          >
            <div className="quick-card-top">
              <span className="quick-card-label">{c.label}</span>
              <span className="quick-card-icon" style={{ color: c.color, background: `color-mix(in srgb, ${c.color} 14%, transparent)` }}>
                {c.icon}
              </span>
            </div>
            <span className="quick-card-value">{c.value}</span>
            <span className="quick-card-sub">{c.sub}</span>
            {c.progress != null && (
              <div className="quick-progress">
                <motion.div
                  className="quick-progress-fill"
                  style={{ background: c.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${c.progress}%` }}
                  transition={{ duration: 0.8, delay: 0.2 + 0.05 * i, ease: 'easeOut' }}
                />
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <motion.div animate={unitFall(iAIWZ)}>
        <AIWorkZone />
      </motion.div>

      <div className="home-grid" ref={scheduleRef} style={{ scrollMarginTop: 16 }}>
        <motion.div animate={unitFall(iGrid)}>
          <DaySchedule />
        </motion.div>
        <motion.div animate={unitFall(iGrid + 1)}>
          <DaySummary />
        </motion.div>
      </div>

      {/* Эффект хули-ули: надпись на весь экран + кнопка возврата (после падения) */}
      <AnimatePresence>
        {fallen && (
          <motion.div
            className="huli-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={{ duration: 0.8, delay: overlayDelay }}
          >
            <motion.h2
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, delay: overlayDelay + 0.2, ease: 'backOut' }}
            >
              Никогда не знаешь, когда твоя идея обернётся против тебя
            </motion.h2>
            <motion.div
              className="huli-math"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: overlayDelay + 0.5 }}
            >
              <div className="huli-math-hint">Решите пример, чтобы вернуть сайт:</div>
              <div className="huli-expr">√99720196 · ∫₁ᵉ (1/x) dx + ∑(n=1..∞) 1/2ⁿ − 1 = ?</div>
              <form className="huli-answer" onSubmit={checkAnswer}>
                <input
                  className={`huli-input ${wrong ? 'err' : ''}`}
                  placeholder="Дайте ответ"
                  inputMode="numeric"
                  value={answer}
                  onChange={e => { setAnswer(e.target.value); setWrong(false) }}
                  autoFocus
                />
                <button className="huli-btn overlay" type="submit">Вернуть сайт</button>
              </form>
              {wrong && <div className="huli-wrong">Неверно. Подумайте ещё 🙂</div>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .home-page {
          display: flex;
          flex-direction: column;
          gap: 28px;
          max-width: 1400px;
        }
        .home-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 32px;
        }
        .header-left { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }

        .quote-of-day {
          max-width: 420px;
          text-align: right;
          padding-top: 8px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .quote-text {
          font-size: 15px;
          line-height: 1.55;
          color: var(--foreground);
          font-style: italic;
          font-family: var(--font-serif), Georgia, serif;
        }
        .quote-author {
          font-size: 13px;
          color: var(--muted-foreground);
          font-weight: 500;
        }

        .huli-btn {
          margin-top: 8px;
          font-size: 12px;
          font-weight: 600;
          color: var(--muted-foreground);
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 5px 14px;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.18s;
        }
        .huli-btn:hover { color: var(--accent); border-color: var(--border-hover); }
        .huli-btn.overlay {
          margin-top: 24px;
          font-size: 14px;
          padding: 10px 24px;
          background: var(--accent);
          color: var(--accent-foreground);
          border-color: var(--accent);
        }
        .huli-btn.overlay:hover { opacity: 0.9; }

        .huli-overlay {
          position: fixed;
          inset: 0;
          z-index: 400;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0;
          pointer-events: auto;
          background: radial-gradient(800px circle at 50% 50%, rgba(30,27,24,0.4), rgba(30,27,24,0.85));
          backdrop-filter: blur(2px);
        }
        .huli-math {
          display: flex; flex-direction: column; align-items: center; gap: 16px;
          margin-top: 36px; padding: 0 24px; max-width: 760px; width: 100%;
        }
        .huli-math-hint { font-size: 14px; color: var(--muted-foreground); }
        .huli-expr {
          font-family: var(--font-serif), 'Times New Roman', Georgia, serif;
          font-size: clamp(20px, 3.2vw, 34px);
          color: var(--foreground);
          text-align: center;
          line-height: 1.5;
          letter-spacing: 0.01em;
        }
        .huli-answer { display: flex; gap: 10px; align-items: center; margin-top: 6px; flex-wrap: wrap; justify-content: center; }
        .huli-input {
          background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px;
          padding: 12px 18px; font-family: inherit; font-size: 18px; color: var(--foreground);
          outline: none; text-align: center; width: 180px; transition: border-color 0.15s;
        }
        .huli-input:focus { border-color: var(--accent); }
        .huli-input.err { border-color: var(--red); }
        .huli-input::placeholder { color: var(--muted-foreground); }
        .huli-wrong { font-size: 14px; color: var(--red); }
        .huli-overlay h2 {
          font-size: clamp(32px, 6vw, 72px);
          font-weight: 800;
          letter-spacing: -0.02em;
          text-align: center;
          background: linear-gradient(135deg, var(--foreground), var(--accent));
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          padding: 0 24px;
        }
        .home-date {
          font-size: 13px;
          color: var(--muted);
          text-transform: capitalize;
          font-weight: 500;
        }
        .greeting {
          font-size: 36px;
          font-weight: 700;
          color: var(--foreground);
          letter-spacing: -0.025em;
          line-height: 1.1;
        }
        .quick-cards {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        .quick-card {
          display: flex;
          flex-direction: column;
          gap: 6px;
          cursor: default;
          transition: box-shadow 0.2s, border-color 0.2s;
        }
        .quick-card:hover {
          box-shadow: var(--shadow-lift);
          border-color: var(--border-hover);
        }
        .quick-card.clickable { cursor: pointer; }
        .quick-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }
        .quick-card-label {
          font-size: 11px;
          color: var(--muted);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }
        .quick-card-icon {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .quick-card-value {
          font-size: 22px;
          font-weight: 700;
          color: var(--foreground);
          letter-spacing: -0.01em;
        }
        .quick-card-sub {
          font-size: 12.5px;
          color: var(--muted);
        }
        .quick-progress {
          margin-top: 8px;
          height: 5px;
          background: var(--bg-secondary);
          border-radius: 3px;
          overflow: hidden;
        }
        .quick-progress-fill { height: 100%; border-radius: 3px; }

        .home-grid {
          display: grid;
          grid-template-columns: 1.8fr 1fr;
          gap: 16px;
          align-items: stretch;
        }
      `}</style>
    </div>
  )
}
