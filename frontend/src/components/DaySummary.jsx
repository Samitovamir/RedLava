import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useEvents, dateKey } from '../context/EventsContext.jsx'
import { useMemoryFacts } from '../context/MemoryContext.jsx'
import { useHistory } from '../context/HistoryContext.jsx'
import { PRIORITY_MAP } from './AddEventModal.jsx'
import { useAiSummary } from '../hooks/useAiSummary.js'
import { useSiteSnapshot } from '../hooks/useSiteSnapshot.js'
import AiRefreshButton from './AiRefreshButton.jsx'
import MicButton from './MicButton.jsx'
import { mskNow } from '../utils/time.js'

/*
  Сводка дня + мини-чат с ИИ в контексте расписания.
  Чат идёт через /agent — умеет реально создавать/переносить/удалять события.
  Контекст строится из реальных событий — отражает все перестановки.
*/

export default function DaySummary() {
  const { events } = useEvents()
  const snapshot = useSiteSnapshot()

  const todayKey = dateKey(mskNow())
  const todayEvents = events.filter(e => e.date === todayKey)
  const DAY_CONTEXT =
    `Ты помощник владельца по организации дня. Фокусируйся на расписании и планах, но ты ВИДИШЬ всю картину (спорт, здоровье, анализы) и учитываешь её в советах. ` +
    `Отвечай кратко и по делу на русском. Учитывай приоритеты событий и предпочтения из памяти.`

  return <DaySummaryInner dayContext={DAY_CONTEXT} snapshot={snapshot} eventCount={todayEvents.length} />
}

function DaySummaryInner({ dayContext, snapshot, eventCount }) {
  const DAY_CONTEXT = dayContext
  const { applyAiActions } = useEvents()
  const { addFact } = useMemoryFacts()
  const { logAction } = useHistory()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const msgsRef = useRef(null)

  // ИИ-сводка дня (с кэшем; шаблон — как фолбэк без backend)
  const fallbackSummary =
    eventCount > 0
      ? `Сегодня ${eventCount} ${eventCount === 1 ? 'событие' : 'событий'}. Восстановление хорошее (78%) — можно дать полную интенсивность. Закройте важные дела до вечерней тренировки.`
      : 'На сегодня событий нет — хороший день, чтобы отдохнуть или закрыть отложенные задачи. Восстановление 78%.'
  const summary = useAiSummary({
    id: 'daysummary',
    context: DAY_CONTEXT,
    snapshot,
    message: 'Дай очень короткую сводку дня (2–3 предложения): общая нагрузка, на что обратить внимание и один совет. Без приветствия и без списков.',
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
      const eventActions = actions.filter(a => a.name !== 'remember_fact')
      const memActions = actions.filter(a => a.name === 'remember_fact')
      if (eventActions.length) applyAiActions(eventActions)
      memActions.forEach(a => {
        addFact(a.input?.fact)
        logAction({ actor: 'ai', type: 'task', title: `Запомнил: ${a.input?.fact}` })
      })
      setMessages(m => [...m, { role: 'assistant', text: data.reply || 'Ошибка ответа', didActions: actions.length }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: 'Нет связи с сервером. Запустите backend.' }])
    }
    setLoading(false)
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className="card day-summary">
      <div className="summary-head">
        <span className="summary-badge">ИИ</span>
        <div className="card-title" style={{ margin: 0 }}>Сводка дня</div>
        <AiRefreshButton onClick={summary.refresh} loading={summary.loading} />
      </div>

      <p className="summary-text">
        {summary.loading ? 'ИИ собирает сводку дня…' : summary.text}
      </p>
      <div className="summary-tags">
        <span className="summary-tag">{eventCount} {eventCount === 1 ? 'событие' : eventCount >= 2 && eventCount <= 4 ? 'события' : 'событий'}</span>
        <span className="summary-tag accent">Recovery 78%</span>
      </div>

      {/* Мини-чат */}
      <div className="ds-chat">
        {messages.length > 0 && (
          <div className="ds-chat-msgs" ref={msgsRef}>
            {messages.map((m, i) => (
              <div key={i} className={`ds-chat-msg ${m.role}`}>
                {m.text}
                {m.didActions ? <span className="ds-done-badge">✓ выполнено</span> : null}
              </div>
            ))}
            {loading && <div className="ds-chat-msg assistant thinking">думает…</div>}
          </div>
        )}
        {messages.length === 0 && (
          <div className="ds-chat-suggests">
            {['Что важного сегодня?', 'Когда лучше тренироваться?', 'Освободи мне час'].map(s => (
              <button key={s} className="ds-chat-suggest" onClick={() => setInput(s)}>{s}</button>
            ))}
          </div>
        )}
        <div className="ds-chat-input-row">
          <MicButton primary onText={t => setInput(prev => (prev ? prev.trim() + ' ' : '') + t)} />
          <input
            className="ds-chat-input"
            placeholder="Скажите или спросите про день…"
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
        .summary-head { display: flex; align-items: center; gap: 10px; }
        .summary-badge {
          font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
          color: var(--primary-foreground); background: var(--primary);
          padding: 3px 8px; border-radius: 6px;
        }
        .summary-text { font-size: 17.5px; line-height: 1.7; color: var(--foreground); white-space: pre-wrap; }
        .ds-done-badge {
          display: inline-block; margin-top: 6px; font-size: 11px; font-weight: 600;
          color: var(--green); background: rgba(34,197,94,0.14);
          padding: 2px 8px; border-radius: 10px;
        }
        .summary-tags { display: flex; gap: 8px; flex-wrap: wrap; }
        .summary-tag {
          font-size: 12px; padding: 5px 12px; border-radius: 20px;
          background: var(--bg-secondary); color: var(--muted-foreground); font-weight: 500;
        }
        .summary-tag.accent { background: rgba(34,197,94,0.14); color: var(--green); }

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
