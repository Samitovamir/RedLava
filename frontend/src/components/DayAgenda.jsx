import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useEvents, dateKey } from '../context/EventsContext.jsx'
import { useAiSummary } from '../hooks/useAiSummary.js'
import { useSiteSnapshot } from '../hooks/useSiteSnapshot.js'
import { eventCategory } from '../utils/events.js'
import { mskNow } from '../utils/time.js'
import { useLang, useT } from '../context/LanguageContext.jsx'
import AiAdvice from './AiAdvice.jsx'

/*
  «Расписание» на Главной: один развёрнутый ближайший/текущий ивент,
  компактная сводка дня (тренировки + встречи) и ОДНО предложение от ИИ снизу.
  Клик по карточке ведёт в /schedule с фокусом на ближайшее событие.
  Только реальные данные: события из расписания, тренировки из Garmin (localStorage).
*/

// «сейчас» как сравнимый ключ «YYYY-MM-DD HH:MM» (московское время)
function nowKey() {
  const now = mskNow(); const p = n => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`
}

// Ближайшее (или текущее) событие — как nextEvent() на Главной: сортируем по date+start,
// берём первое, чей конец (или начало) ещё не прошёл.
function nextEvent(events, nk) {
  return [...events].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .find(e => `${e.date} ${e.end || e.start}` >= nk) || null
}

// Минуты от «сейчас» до начала события (по тому же московскому «сейчас»)
function minutesUntil(ev, now) {
  const [h, m] = String(ev.start).split(':').map(Number)
  const start = new Date(now); start.setHours(h, m || 0, 0, 0)
  return Math.round((start - now) / 60000)
}

function readGarminLive() {
  try { const s = localStorage.getItem('albert-garmin-live'); return s ? JSON.parse(s) : null } catch { return null }
}

// Спорт-тип Garmin → короткая локализованная подпись (строчная — для «была: бег 8 км»)
const SPORT_LABELS = {
  ru: { running: 'бег', cycling: 'велосипед', lap_swimming: 'плавание', swimming: 'плавание', strength_training: 'силовая', cardio: 'кардио', walking: 'ходьба', other: 'тренировка' },
  en: { running: 'run', cycling: 'ride', lap_swimming: 'swim', swimming: 'swim', strength_training: 'strength', cardio: 'cardio', walking: 'walk', other: 'workout' },
}
const sportLabel = (s, map, fallback) => map[s] || (s ? s.replace(/_/g, ' ') : fallback)

export default function DayAgenda() {
  const navigate = useNavigate()
  const { lang } = useLang()
  const { events, setFocusSignal } = useEvents()
  const snapshot = useSiteSnapshot()
  const en = lang === 'en'

  const t = useT({
    ru: {
      label: 'Расписание',
      free: 'Сегодня свободно', freeSub: 'Нет ближайших событий',
      now: 'сейчас идёт',
      inMin: n => `через ${n} мин`,
      inHour: n => `через ${n} ч`,
      prioName: { 1: 'неотложный', 2: 'важный', 3: 'обычный' },
      workouts: 'Тренировки', meetings: 'Встречи',
      was: w => `была: ${w}`,
      ahead: w => `впереди: ${w}`,
      meetSplit: (back, fwd) => `${back} позади, ${fwd} впереди`,
      aiBadge: 'ИИ',
    },
    en: {
      label: 'Schedule',
      free: 'Free today', freeSub: 'No upcoming events',
      now: 'in progress now',
      inMin: n => `in ${n} min`,
      inHour: n => `in ${n} h`,
      prioName: { 1: 'urgent', 2: 'important', 3: 'normal' },
      workouts: 'Workouts', meetings: 'Meetings',
      was: w => `done: ${w}`,
      ahead: w => `ahead: ${w}`,
      meetSplit: (back, fwd) => `${back} behind, ${fwd} ahead`,
      aiBadge: 'AI',
    },
  })

  const now = mskNow()
  const nk = nowKey()
  const todayKey = dateKey(now)
  const nextEv = nextEvent(events, nk)

  // ── Относительная подсказка к ближайшему событию ──
  let hint = null
  if (nextEv) {
    const startKey = `${nextEv.date} ${nextEv.start}`
    if (startKey <= nk) hint = t.now                              // уже началось, ещё не кончилось
    else if (nextEv.date === todayKey) {
      const mins = minutesUntil(nextEv, now)
      hint = mins >= 60 ? t.inHour(Math.round(mins / 60)) : t.inMin(Math.max(1, mins))
    }
  }

  // ── Сводка дня (только сегодня) ──
  const garmin = readGarminLive()
  const sportMap = SPORT_LABELS[en ? 'en' : 'ru']

  // Тренировки: уже сделанные сегодня (Garmin) + предстоящие сегодняшние ивенты-тренировки
  const doneToday = (garmin?.workouts || []).filter(w => w.date === todayKey)
  const workoutRows = []
  doneToday.forEach(w => {
    const name = sportLabel(w.sport, sportMap, t.workouts)
    const km = w.distanceKm != null ? ` ${w.distanceKm} ${en ? 'km' : 'км'}` : (w.durationMin != null ? ` ${w.durationMin} ${en ? 'min' : 'мин'}` : '')
    workoutRows.push(t.was(`${name}${km}`))
  })
  events
    .filter(e => e.date === todayKey && eventCategory(e) === 'workout' && `${e.date} ${e.end || e.start}` >= nk)
    .forEach(e => workoutRows.push(t.ahead(`${e.title} ${e.start}`)))

  // Встречи: сегодняшние НЕ-тренировочные события, поделённые на «позади / впереди»
  const meetings = events.filter(e => e.date === todayKey && eventCategory(e) !== 'workout')
  const meetBack = meetings.filter(e => `${e.date} ${e.end || e.start}` < nk).length
  const meetFwd = meetings.length - meetBack

  // ── ОДНО предложение от ИИ ──
  const AI_CONTEXT =
    'Ты помощник пользователя по дню. Дай ОДНО короткое практичное предложение: как пройти сегодняшний день с учётом расписания и состояния (спорт/здоровье). Без вступлений, одно предложение.' +
    (en ? ' Always reply to the user in English.' : '')
  const ai = useAiSummary({
    id: 'day-agenda',
    context: AI_CONTEXT,
    snapshot,
    message: en ? 'One sentence of advice for today.' : 'Одно предложение-совет по сегодняшнему дню.',
    fallback: '',
  })
  const aiLine = !ai.loading && ai.text ? ai.text.trim() : ''

  // Клик по карточке → /schedule с фокусом на ближайшее событие
  const goToEvent = () => {
    if (nextEv) setFocusSignal({ date: nextEv.date, time: nextEv.start, n: Date.now() })
    navigate('/schedule')
  }

  const prio = nextEv?.priority || 3
  const prioLabel = `${prio} ${t.prioName[prio] || t.prioName[3]}`

  return (
    <motion.div
      className="card day-agenda"
      whileHover={{ y: -4 }}
      onClick={goToEvent}
    >
      <div className="da-top">
        <span className="da-label">{t.label}</span>
      </div>

      {nextEv ? (
        <div className="da-event">
          <div className="da-event-head">
            <span className="da-time">{nextEv.start}{nextEv.end ? `–${nextEv.end}` : ''}</span>
            {hint && <span className="da-hint">{hint}</span>}
            <span className={`da-prio prio-${prio}`}>{prioLabel}</span>
          </div>
          <h3 className="da-title">{nextEv.title}</h3>
          {nextEv.who && <span className="da-who">{nextEv.who}</span>}
        </div>
      ) : (
        <div className="da-event">
          <h3 className="da-title">{t.free}</h3>
          <span className="da-who">{t.freeSub}</span>
        </div>
      )}

      {(workoutRows.length > 0 || meetings.length > 0) && (
        <div className="da-summary">
          {workoutRows.length > 0 && (
            <div className="da-row">
              <span className="da-row-label">{t.workouts}</span>
              <span className="da-row-val">{workoutRows.join(' · ')}</span>
            </div>
          )}
          {meetings.length > 0 && (
            <div className="da-row">
              <span className="da-row-label">{t.meetings}</span>
              <span className="da-row-val">{t.meetSplit(meetBack, meetFwd)}</span>
            </div>
          )}
        </div>
      )}

      {aiLine && (
        <AiAdvice glow="soft" label={t.aiBadge}>{aiLine}</AiAdvice>
      )}

      <style>{`
        .day-agenda {
          display: flex; flex-direction: column; gap: 14px;
          cursor: pointer;
        }
        .da-top { display: flex; align-items: center; gap: 9px; }
        .da-label {
          font-size: 15px; font-weight: 600; color: var(--muted-foreground);
        }

        .da-event {
          display: flex; flex-direction: column; gap: 6px;
          padding: 14px 16px;
          background: var(--bg-tile); border: 1px solid var(--border-med);
          border-radius: var(--radius-md);
        }
        .da-event-head {
          display: flex; align-items: center; flex-wrap: wrap; gap: 8px 10px;
        }
        .da-time {
          font-size: 14px; font-weight: 700; color: var(--text-primary);
          font-variant-numeric: tabular-nums; letter-spacing: -0.01em;
        }
        .da-hint {
          font-size: 12px; font-weight: 600; color: var(--accent);
          font-variant-numeric: tabular-nums;
        }
        .da-prio {
          margin-left: auto;
          font-size: 11px; font-weight: 600; line-height: 1;
          padding: 4px 8px; border-radius: var(--radius-sm);
          font-variant-numeric: tabular-nums;
          color: var(--text-secondary); background: var(--bg-secondary);
          border: 1px solid var(--border);
        }
        .da-prio.prio-1 { color: var(--red); border-color: color-mix(in srgb, var(--red) 40%, transparent); }
        .da-prio.prio-2 { color: var(--yellow); border-color: color-mix(in srgb, var(--yellow) 40%, transparent); }
        .da-title {
          font-size: 20px; font-weight: 700; line-height: 1.2;
          color: var(--text-primary); letter-spacing: -0.01em;
          overflow-wrap: anywhere;
        }
        .da-who { font-size: 13px; color: var(--text-secondary); }

        .da-summary { display: flex; flex-direction: column; gap: 8px; }
        .da-row {
          display: flex; align-items: baseline; gap: 10px;
          font-size: 13.5px; line-height: 1.4;
        }
        .da-row-label {
          flex-shrink: 0; min-width: 92px;
          font-size: 12px; font-weight: 600; color: var(--text-muted);
        }
        .da-row-val {
          color: var(--text-body);
          font-variant-numeric: tabular-nums;
          overflow-wrap: anywhere;
        }

        .da-ai {
          display: flex; align-items: baseline; gap: 8px;
          padding-top: 12px; border-top: 1px solid var(--border);
        }
        .da-ai-badge {
          flex-shrink: 0;
          font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
          color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent);
          padding: 2px 7px; border-radius: 7px; line-height: 1.4;
        }
        .da-ai-text {
          font-size: 13px; line-height: 1.5; color: var(--text-muted);
        }
      `}</style>
    </motion.div>
  )
}
