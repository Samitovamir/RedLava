import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useEvents, dateKey } from '../context/EventsContext.jsx'
import { useMail } from '../context/MailContext.jsx'
import { useMemoryFacts } from '../context/MemoryContext.jsx'
import { useHistory } from '../context/HistoryContext.jsx'
import { PRIORITY_MAP } from './AddEventModal.jsx'
import { useAiSummary } from '../hooks/useAiSummary.js'
import { useSiteSnapshot } from '../hooks/useSiteSnapshot.js'
import AiRefreshButton from './AiRefreshButton.jsx'
import MicButton from './MicButton.jsx'
import { mskNow } from '../utils/time.js'
import { useLang, useT } from '../context/LanguageContext.jsx'

/*
  Сводка дня + мини-чат с ИИ в контексте расписания.
  Чат идёт через /agent — умеет реально создавать/переносить/удалять события.
  Контекст строится из реальных событий — отражает все перестановки.
*/

function readWhoopLive() { try { const s = localStorage.getItem('albert-whoop-live'); return s ? JSON.parse(s) : null } catch { return null } }
function readGarminLive() { try { const s = localStorage.getItem('albert-garmin-live'); return s ? JSON.parse(s) : null } catch { return null } }

// Маленькие чипы-метрики дня из реальных данных (тренировка / нагрузка / восстановление)
function buildMetrics(whoop, garmin, todayKey, en) {
  const m = []
  const todW = (garmin?.workouts || []).filter(w => w.date === todayKey)
  let mins = todW.reduce((s, w) => s + (w.durationMin || 0), 0)
  if (!mins && garmin?.lastWorkout?.date === todayKey) mins = garmin.lastWorkout.durationMin || 0
  if (mins) m.push(`${en ? 'Workout' : 'Тренировка'} ${mins} ${en ? 'min' : 'мин'}`)
  if (whoop?.strain != null) m.push(`${en ? 'Strain' : 'Нагрузка'} ${whoop.strain}/21`)
  if (whoop?.recovery != null) m.push(`${en ? 'Recovery' : 'Восстановление'} ${whoop.recovery}%`)
  return m
}

export default function DaySummary() {
  const { lang } = useLang()
  const { events } = useEvents()
  const { facts } = useMemoryFacts()
  const snapshot = useSiteSnapshot()

  const todayKey = dateKey(mskNow())
  const todayEvents = events.filter(e => e.date === todayKey)
  const metrics = buildMetrics(readWhoopLive(), readGarminLive(), todayKey, lang === 'en')

  // Пока долгосрочная память не наполнилась — не советуем по рабочим встречам/звонкам.
  const memThin = (facts?.length || 0) < 8
  const DAY_CONTEXT =
    `Ты помощник владельца по организации дня. Фокусируйся на расписании и планах, но ты ВИДИШЬ всю картину (спорт, здоровье, анализы) и учитываешь её в советах. ` +
    `Отвечай кратко и по делу на русском. Учитывай приоритеты событий и предпочтения из памяти.` +
    (memThin
      ? ` ВАЖНО: ты пока мало знаешь о рабочем ритме владельца — поэтому НЕ давай советов и рекомендаций про рабочие встречи и звонки (не пиши «нужны силы на завтрашние звонки», не советуй, как с ними быть). Сосредоточься на спорте, нагрузке, восстановлении и здоровье. Рабочие события можно лишь нейтрально упомянуть как факт расписания, без советов.`
      : '') +
    (lang === 'en' ? ' Always reply to the user in English.' : '')

  return <DaySummaryInner dayContext={DAY_CONTEXT} snapshot={snapshot} eventCount={todayEvents.length} metrics={metrics} />
}

function DaySummaryInner({ dayContext, snapshot, eventCount, metrics = [] }) {
  const DAY_CONTEXT = dayContext
  const { lang } = useLang()
  const t = useT({
    ru: {
      aiBadge: 'ИИ',
      summaryTitle: 'Сводка дня',
      collecting: 'ИИ собирает сводку дня…',
      eventOne: 'событие', eventFew: 'события', eventMany: 'событий',
      recovery: 'Recovery 78%',
      done: '✓ выполнено',
      thinking: 'думает…',
      replyError: 'Ошибка ответа',
      noServer: 'Нет связи с сервером. Запустите backend.',
      placeholder: 'Скажите или спросите про день…',
      suggests: ['Что важного сегодня?', 'Когда лучше тренироваться?', 'Освободи мне час'],
      summaryMessage: 'Учитывай ВСЕ данные дашборда (расписание, спорт, здоровье, анализы, питание, память). Сформулируй сводку дня СТРОГО так: ПЕРВАЯ строка — короткий вывод-заголовок из 3–6 слов без точки в конце (например «Вечер лучше оставить спокойным»). Затем с НОВОЙ строки — 1–2 коротких предложения по сути: что уже было сегодня и на что обратить внимание. Без приветствия, без списков, без воды.'
    },
    en: {
      aiBadge: 'AI',
      summaryTitle: 'Day summary',
      collecting: 'AI is putting together the day summary…',
      eventOne: 'event', eventFew: 'events', eventMany: 'events',
      recovery: 'Recovery 78%',
      done: '✓ done',
      thinking: 'thinking…',
      replyError: 'Response error',
      noServer: 'No connection to the server. Start the backend.',
      placeholder: 'Say or ask about your day…',
      suggests: ['What’s important today?', 'When is the best time to train?', 'Free up an hour for me'],
      summaryMessage: 'Use ALL dashboard data (schedule, sport, health, labs, nutrition, memory). Format the day summary STRICTLY like this: FIRST line — a short verdict headline of 3–6 words with no trailing period (e.g. “Keep the evening calm”). Then on a NEW line — 1–2 short sentences on the essentials: what already happened today and what to watch. No greeting, no lists, no fluff.'
    }
  })
  const { applyAiActions } = useEvents()
  const { openDraft } = useMail()
  const { addFact, updateFact } = useMemoryFacts()
  const { logAction } = useHistory()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const msgsRef = useRef(null)

  // ИИ-сводка дня (с кэшем; шаблон — как фолбэк без backend)
  const fallbackSummary = lang === 'en'
    ? (eventCount > 0
        ? `Wrap up the day calmly\nToday: ${eventCount} ${eventCount === 1 ? 'event' : 'events'}. Do the important tasks first, leave the workout for the evening.`
        : 'A good day to recover\nNo events today — rest or clear out backlog tasks.')
    : (eventCount > 0
        ? `Спокойно закрой день\nСегодня ${eventCount} ${eventCount === 1 ? 'событие' : 'событий'}. Сначала важные дела, тренировку — на вечер.`
        : 'Хороший день для восстановления\nСобытий нет — можно отдохнуть или закрыть отложенное.')
  const summary = useAiSummary({
    id: 'daysummary',
    context: DAY_CONTEXT,
    snapshot,
    message: t.summaryMessage,
    fallback: fallbackSummary
  })

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight
  }, [messages, loading])

  async function send() {
    if (!input.trim() || loading) return
    const q = input.trim()
    const priorHistory = messages
    setInput('')
    setMessages(m => [...m, { role: 'user', text: q }])
    setLoading(true)
    try {
      // Через /agent — ассистент реально умеет создавать/переносить/удалять события
      const res = await fetch('/api/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, snapshot, history: priorHistory, context: DAY_CONTEXT })
      })
      const data = await res.json()
      const actions = data.actions || []
      const memNames = ['remember_fact', 'update_fact']
      const eventActions = actions.filter(a => !memNames.includes(a.name) && a.name !== 'send_email')
      const memActions = actions.filter(a => a.name === 'remember_fact')
      const updateActions = actions.filter(a => a.name === 'update_fact')
      const mailActions = actions.filter(a => a.name === 'send_email')
      if (eventActions.length) applyAiActions(eventActions)
      if (mailActions.length) openDraft(mailActions[0].input)
      memActions.forEach(a => {
        addFact(a.input?.fact)
        logAction({ actor: 'ai', type: 'task', title: `Запомнил: ${a.input?.fact}` })
      })
      updateActions.forEach(a => {
        updateFact(a.input?.old, a.input?.new)
        logAction({ actor: 'ai', type: 'task', title: a.input?.new ? `Обновил память: ${a.input.new}` : `Забыл устаревшее: ${a.input?.old}` })
      })
      setMessages(m => [...m, { role: 'assistant', text: data.reply || t.replyError, didActions: actions.length }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: t.noServer }])
    }
    setLoading(false)
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className="card day-summary">
      <div className="summary-head">
        <span className="summary-eyebrow">{t.summaryTitle}</span>
        <AiRefreshButton onClick={summary.refresh} loading={summary.loading} />
      </div>

      {summary.loading ? (
        <p className="summary-sub">{t.collecting}</p>
      ) : (() => {
        const lines = (summary.text || '').split('\n').map(s => s.trim()).filter(Boolean)
        const headline = lines[0] || ''
        const subtitle = lines.slice(1).join(' ')
        return (
          <>
            {headline && <h2 className="summary-headline">{headline}</h2>}
            {subtitle && <p className="summary-sub">{subtitle}</p>}
          </>
        )
      })()}

      {metrics.length > 0 && (
        <div className="summary-tags">
          {metrics.map(m => <span key={m} className="summary-tag">{m}</span>)}
        </div>
      )}

      {/* Мини-чат */}
      <div className="ds-chat">
        {messages.length > 0 && (
          <div className="ds-chat-msgs" ref={msgsRef}>
            {messages.map((m, i) => (
              <div key={i} className={`ds-chat-msg ${m.role}`}>
                {m.text}
                {m.didActions ? <span className="ds-done-badge">{t.done}</span> : null}
              </div>
            ))}
            {loading && <div className="ds-chat-msg assistant thinking">{t.thinking}</div>}
          </div>
        )}
        {messages.length === 0 && (
          <div className="ds-chat-suggests">
            {t.suggests.map(s => (
              <button key={s} className="ds-chat-suggest" onClick={() => setInput(s)}>{s}</button>
            ))}
          </div>
        )}
        <div className="ds-chat-input-row">
          <MicButton primary onText={t => setInput(prev => (prev ? prev.trim() + ' ' : '') + t)} />
          <input
            className="ds-chat-input"
            placeholder={t.placeholder}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
          />
          <button className="ds-chat-send" onClick={send} disabled={loading || !input.trim()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        .day-summary { display: flex; flex-direction: column; gap: 14px; height: 100%; min-height: 560px; }
        .summary-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .summary-eyebrow {
          font-size: 12px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
          color: var(--accent);
        }
        .summary-headline {
          font-family: var(--font-serif), Georgia, serif;
          font-size: 26px; font-weight: 700; line-height: 1.18;
          color: var(--foreground); letter-spacing: -0.01em;
          margin-top: 2px;
        }
        .summary-sub { font-size: 15.5px; line-height: 1.55; color: var(--muted-foreground); white-space: pre-wrap; }
        .ds-done-badge {
          display: inline-block; margin-top: 6px; font-size: 11px; font-weight: 600;
          color: var(--green); background: rgba(126, 155, 110,0.14);
          padding: 2px 8px; border-radius: 10px;
        }
        .summary-tags { display: flex; gap: 8px; flex-wrap: wrap; }
        .summary-tag {
          font-size: 12px; padding: 5px 12px; border-radius: 20px;
          background: var(--bg-secondary); color: var(--muted-foreground); font-weight: 500;
        }
        .summary-tag.accent { background: rgba(126, 155, 110,0.14); color: var(--green); }

        .ds-chat {
          margin-top: auto;
          display: flex; flex-direction: column; gap: 10px;
          border-top: 1px solid var(--border);
          padding-top: 14px;
        }
        .ds-chat-msgs {
          display: flex; flex-direction: column; gap: 8px;
          max-height: 240px; overflow-y: auto;
          padding-right: 2px;
        }
        .ds-chat-msg {
          font-size: 16.5px; line-height: 1.6;
          padding: 11px 14px; border-radius: 12px;
          max-width: 92%; white-space: pre-wrap;
        }
        .ds-chat-msg.user {
          align-self: flex-end;
          background: var(--primary); color: var(--primary-foreground);
          border-bottom-right-radius: 4px;
        }
        .ds-chat-msg.assistant {
          align-self: flex-start;
          background: var(--bg-secondary); color: var(--foreground);
          border-bottom-left-radius: 4px;
        }
        .ds-chat-msg.thinking { color: var(--muted-foreground); font-style: italic; }
        .ds-chat-suggests { display: flex; flex-wrap: wrap; gap: 6px; }
        .ds-chat-suggest {
          font-size: 12px; padding: 6px 11px;
          border: 1px solid var(--border); background: transparent;
          color: var(--muted-foreground); border-radius: 16px;
          cursor: pointer; font-family: inherit;
          transition: all 0.15s;
        }
        .ds-chat-suggest:hover { color: var(--primary); border-color: var(--border-hover); }
        .ds-chat-input-row {
          display: flex; align-items: center; gap: 8px;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 6px 6px 6px 14px;
          transition: border-color 0.2s;
        }
        .ds-chat-input-row:focus-within { border-color: var(--border-hover); }
        .ds-chat-input {
          flex: 1; border: none; background: transparent; outline: none;
          font-family: inherit; font-size: 14.5px; color: var(--foreground);
        }
        .ds-chat-input::placeholder { color: var(--muted-foreground); }
        .ds-chat-send {
          width: 32px; height: 32px; flex-shrink: 0;
          border: none; border-radius: 9px;
          background: var(--primary); color: var(--primary-foreground);
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: opacity 0.15s;
        }
        .ds-chat-send:hover:not(:disabled) { opacity: 0.9; }
        .ds-chat-send:disabled { opacity: 0.4; cursor: default; }
      `}</style>
    </div>
  )
}
