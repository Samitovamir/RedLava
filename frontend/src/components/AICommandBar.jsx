import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { useEvents } from '../context/EventsContext.jsx'
import { useMemoryFacts } from '../context/MemoryContext.jsx'
import { useHistory } from '../context/HistoryContext.jsx'
import { useSiteSnapshot } from '../hooks/useSiteSnapshot.js'

const PAGE_HINT = {
  '/': 'Сейчас открыт главный экран.',
  '/schedule': 'Сейчас открыто расписание.',
  '/sport': 'Сейчас открыта вкладка спорта.',
  '/health': 'Сейчас открыта вкладка здоровья.',
  '/history': 'Сейчас открыта история действий.'
}

export default function AICommandBar() {
  const [expanded, setExpanded] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const messagesEndRef = useRef(null)
  const location = useLocation()
  const { applyAiActions } = useEvents()
  const { addFact } = useMemoryFacts()
  const { logAction } = useHistory()
  const snapshot = useSiteSnapshot()

  useEffect(() => {
    if (expanded) {
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [expanded])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    const priorHistory = messages   // диалог до этого сообщения — для памяти беседы
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setLoading(true)

    try {
      const res = await fetch('/api/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          snapshot,
          history: priorHistory,
          context: PAGE_HINT[location.pathname] || PAGE_HINT['/']
        })
      })
      const data = await res.json()
      const actions = data.actions || []
      // События — в расписание; факты — в долгую память
      const eventActions = actions.filter(a => a.name !== 'remember_fact')
      const memActions = actions.filter(a => a.name === 'remember_fact')
      if (eventActions.length) applyAiActions(eventActions)
      memActions.forEach(a => {
        addFact(a.input?.fact)
        logAction({ actor: 'ai', type: 'task', title: `Запомнил: ${a.input?.fact}` })
      })
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: data.reply || 'Ошибка ответа',
        didActions: actions.length
      }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Нет соединения с сервером. Запустите backend.' }])
    }
    setLoading(false)
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
    if (e.key === 'Escape') setExpanded(false)
  }

  return (
    <AnimatePresence>
      <motion.div
        className={`ai-bar ${expanded ? 'expanded' : ''}`}
        layout
        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
      >
        {expanded && (
          <motion.div
            className="ai-messages"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 240 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
          >
            {messages.length === 0 && (
              <div className="ai-hint">
                <p>Просто напишите, что нужно — я сделаю.</p>
                <div className="ai-examples">
                  {['Поставь звонок врачу завтра в 15:00', 'Перенеси тренировку на 19:30', 'Удали планёрку'].map(s => (
                    <button key={s} className="ai-example" onClick={() => setInput(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`ai-message ${m.role}`}>
                <span className="ai-message-role">{m.role === 'user' ? 'Вы' : 'ИИ'}</span>
                <span className="ai-message-text">
                  {m.text}
                  {m.didActions > 0 && <span className="ai-done-badge">✓ выполнено</span>}
                </span>
              </div>
            ))}
            {loading && (
              <div className="ai-message assistant">
                <span className="ai-message-role">ИИ</span>
                <span className="ai-thinking">думает...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </motion.div>
        )}

        <div className="ai-input-row">
          <div className="ai-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm0-14a1 1 0 0 0-1 1v4H7a1 1 0 0 0 0 2h4v4a1 1 0 0 0 2 0v-4h4a1 1 0 0 0 0-2h-4V7a1 1 0 0 0-1-1z"/>
            </svg>
          </div>
          <input
            ref={inputRef}
            className="ai-input"
            placeholder={expanded ? 'Введите запрос...' : 'Спросите что угодно...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            onFocus={() => setExpanded(true)}
          />
          {expanded && (
            <button className="ai-send-btn" onClick={sendMessage} disabled={loading || !input.trim()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          )}
          {expanded && (
            <button className="ai-close-btn" onClick={() => setExpanded(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        <style>{`
          .ai-bar {
            position: fixed;
            bottom: 20px;
            left: calc(var(--sidebar-width) + 24px);
            right: 24px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 14px;
            z-index: 200;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            overflow: hidden;
          }
          .ai-bar.expanded {
            border-color: rgba(129,140,248,0.3);
          }
          .ai-messages {
            overflow-y: auto;
            padding: 16px 16px 8px;
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .ai-hint {
            font-size: 13px;
            color: var(--muted);
            text-align: center;
            padding: 18px 0;
          }
          .ai-examples { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 12px; }
          .ai-example {
            font-size: 12px; padding: 6px 11px; border-radius: 16px;
            border: 1px solid var(--border); background: transparent;
            color: var(--muted-foreground); cursor: pointer; font-family: inherit; transition: all 0.15s;
          }
          .ai-example:hover { color: var(--accent); border-color: var(--accent); }
          .ai-done-badge {
            display: inline-block; margin-left: 8px; font-size: 11px; font-weight: 700;
            color: var(--green); background: rgba(34,197,94,0.14);
            padding: 2px 8px; border-radius: 10px; white-space: nowrap;
          }
          .ai-message {
            display: flex;
            gap: 10px;
            align-items: flex-start;
          }
          .ai-message-role {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            min-width: 28px;
            color: var(--muted);
            padding-top: 2px;
          }
          .ai-message.assistant .ai-message-role {
            color: var(--accent);
          }
          .ai-message-text {
            font-size: 17.5px;
            line-height: 1.65;
            color: var(--foreground);
            white-space: pre-wrap;
          }
          .ai-thinking {
            font-size: 13px;
            color: var(--muted);
            font-style: italic;
          }
          .ai-input-row {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
          }
          .ai-icon {
            color: var(--accent);
            flex-shrink: 0;
            display: flex;
          }
          .ai-input {
            flex: 1;
            background: transparent;
            border: none;
            outline: none;
            font-family: inherit;
            font-size: 14px;
            color: var(--foreground);
          }
          .ai-input::placeholder { color: var(--muted); }
          .ai-send-btn, .ai-close-btn {
            background: transparent;
            border: none;
            cursor: pointer;
            color: var(--muted);
            display: flex;
            padding: 4px;
            border-radius: 6px;
            transition: color 0.15s, background 0.15s;
          }
          .ai-send-btn:hover:not(:disabled) { color: var(--accent); }
          .ai-send-btn:disabled { opacity: 0.4; cursor: default; }
          .ai-close-btn:hover { color: var(--foreground); background: var(--bg-secondary); }
        `}</style>
      </motion.div>
    </AnimatePresence>
  )
}
