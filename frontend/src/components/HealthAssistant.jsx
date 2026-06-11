import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useEvents } from '../context/EventsContext.jsx'
import { useMail } from '../context/MailContext.jsx'
import { useMemoryFacts } from '../context/MemoryContext.jsx'
import { useHistory } from '../context/HistoryContext.jsx'
import { useSiteSnapshot } from '../hooks/useSiteSnapshot.js'
import { useLang, useT } from '../context/LanguageContext.jsx'
import MicButton from './MicButton.jsx'

/*
  Плавающий ассистент ИИ в углу страницы «Здоровье» (только здесь).
  Свёрнут — круглая кнопка снизу-справа; по клику разворачивается в поле ввода с лентой
  сообщений. Знает текущую вкладку (Активность/Показатели) и весь снимок дашборда; через
  /api/ai/agent реально умеет создавать/переносить события, писать письма, копить память.
*/
export default function HealthAssistant({ tab = 'activity' }) {
  const { lang } = useLang()
  const t = useT({
    ru: {
      placeholder: 'Спросите про здоровье или тренировки…',
      thinking: 'думает…', you: 'Вы', ai: 'ИИ',
      title: 'Помощник', noServer: 'Нет связи с сервером.', replyError: 'Ошибка ответа.'
    },
    en: {
      placeholder: 'Ask about health or training…',
      thinking: 'thinking…', you: 'You', ai: 'AI',
      title: 'Assistant', noServer: 'No connection to the server.', replyError: 'Response error.'
    }
  })

  const { applyAiActions } = useEvents()
  const { openDraft } = useMail()
  const { addFact, updateFact } = useMemoryFacts()
  const { logAction } = useHistory()
  const snapshot = useSiteSnapshot()

  const [expanded, setExpanded] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [kb, setKb] = useState(0)   // высота клавиатуры (iOS): поднимаем панель над ней
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Клавиатура на телефоне перекрывает ввод (position:fixed считает от layout-вьюпорта,
  // а не от видимой части). Через visualViewport узнаём, насколько её подняла клавиатура,
  // и сдвигаем панель ровно над ней — поле ввода всегда видно.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => setKb(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    vv.addEventListener('resize', onResize)
    vv.addEventListener('scroll', onResize)
    onResize()
    return () => { vv.removeEventListener('resize', onResize); vv.removeEventListener('scroll', onResize) }
  }, [])

  function buildContext() {
    const tabName = tab === 'activity' ? 'Активность' : 'Показатели'
    return (
      `Ты ассистент владельца на странице «Здоровье · ${tabName}». ` +
      (tab === 'activity'
        ? 'Сейчас открыта вкладка тренировок (Garmin): последняя/плановые/недавние тренировки, шаги, пульс, объём за неделю, зоны пульса. Фокусируйся на спорте, нагрузке и форме. '
        : 'Сейчас открыта вкладка показателей: восстановление и сон (Whoop), HRV, пульс, дыхание, VO2max, нагрузка и анализы крови. Фокусируйся на здоровье и восстановлении, объясняй простыми словами, при тревожных отклонениях советуй врача. ') +
      'Ты ВИДИШЬ весь контекст дашборда и можешь создавать/переносить события и запоминать факты о владельце. Отвечай кратко и по делу.' +
      (lang === 'en' ? ' Always reply to the user in English.' : '')
    )
  }

  async function send(override) {
    const q = (typeof override === 'string' ? override : input).trim()
    if (!q || loading) return
    const priorHistory = messages
    setInput('')
    setMessages(m => [...m, { role: 'user', text: q }])
    setLoading(true)
    try {
      const res = await fetch('/api/ai/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, snapshot, history: priorHistory, context: buildContext() })
      })
      const data = await res.json()
      const actions = data.actions || []
      const memNames = ['remember_fact', 'update_fact']
      const eventActions = actions.filter(a => !memNames.includes(a.name) && a.name !== 'send_email')
      const mailActions = actions.filter(a => a.name === 'send_email')
      if (eventActions.length) applyAiActions(eventActions)
      if (mailActions.length) openDraft(mailActions[0].input)
      actions.filter(a => a.name === 'remember_fact').forEach(a => {
        if (a.input?.fact) { addFact(a.input.fact); logAction({ actor: 'ai', type: 'task', title: `Запомнил: ${a.input.fact}` }) }
      })
      actions.filter(a => a.name === 'update_fact').forEach(a => {
        if (a.input?.old) { updateFact(a.input.old, a.input.new); logAction({ actor: 'ai', type: 'task', title: a.input.new ? `Обновил память: ${a.input.new}` : `Забыл устаревшее: ${a.input.old}` }) }
      })
      setMessages(m => [...m, { role: 'assistant', text: data.reply || t.replyError }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: t.noServer }])
    }
    setLoading(false)
  }

  return (
    <>
      <AnimatePresence>
        {expanded && (
          <motion.div className="ha-panel"
            style={kb > 0 ? { bottom: kb + 12, maxHeight: `calc(100dvh - ${kb}px - 24px)` } : undefined}
            initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }} transition={{ duration: 0.2 }}>
            <div className="ha-head">
              <span className="ha-title">{t.title}</span>
              <button className="ha-close" onClick={() => setExpanded(false)} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {messages.length > 0 && (
              <div className="ha-msgs">
                {messages.map((m, i) => (
                  <div key={i} className={`ha-msg ${m.role}`}>
                    <span className="ha-role">{m.role === 'user' ? t.you : t.ai}</span>
                    <span className="ha-text">{m.text}</span>
                  </div>
                ))}
                {loading && <div className="ha-msg assistant"><span className="ha-role">{t.ai}</span><span className="ha-text muted">{t.thinking}</span></div>}
                <div ref={endRef} />
              </div>
            )}
            {/* Голос — основной способ: микрофон надиктовывает и сразу отправляет.
                Текстовое поле остаётся как запасной вариант. */}
            <div className="ha-input-row">
              <MicButton primary onText={txt => send((input ? input.trim() + ' ' : '') + txt)} />
              <input className="ha-input" placeholder={t.placeholder} value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send() } }} />
              <button className="ha-send" onClick={() => send()} disabled={loading || !input.trim()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button className={`ha-fab ${expanded ? 'open' : ''}`} onClick={() => setExpanded(o => !o)}
        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} aria-label={t.title}>
        {expanded ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/></svg>
        )}
      </motion.button>

      <style>{`
        .ha-fab {
          position: fixed; bottom: 24px; right: 24px; z-index: 300;
          width: 56px; height: 56px; border-radius: 50%;
          border: none; background: var(--accent); color: var(--on-accent, #fff);
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          box-shadow: var(--shadow-btn, var(--shadow-card));
        }
        .ha-panel {
          position: fixed; bottom: 92px; right: 24px; z-index: 300;
          width: min(380px, calc(100vw - 48px));
          background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px;
          box-shadow: var(--shadow-lift); padding: 14px;
          display: flex; flex-direction: column; gap: 12px;
        }
        .ha-head { display: flex; align-items: center; justify-content: space-between; }
        .ha-title { font-size: 14px; font-weight: 700; color: var(--foreground); }
        .ha-close { width: 28px; height: 28px; border-radius: 8px; border: none; background: var(--bg-secondary); color: var(--muted-foreground); cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .ha-close:hover { color: var(--foreground); }
        .ha-msgs { display: flex; flex-direction: column; gap: 10px; max-height: 320px; overflow-y: auto; }
        .ha-msg { display: flex; gap: 9px; align-items: flex-start; }
        .ha-role { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; min-width: 22px; color: var(--muted-foreground); padding-top: 3px; }
        .ha-msg.assistant .ha-role { color: var(--accent); }
        .ha-text { font-size: 14.5px; line-height: 1.55; color: var(--foreground); white-space: pre-wrap; }
        .ha-text.muted { color: var(--muted-foreground); font-style: italic; }
        .ha-input-row { display: flex; align-items: center; gap: 8px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 14px; padding: 7px; transition: border-color 0.2s; }
        .ha-input-row:focus-within { border-color: var(--border-hover); }
        /* Микрофон — главный, круглый («запись»); это основной способ обращения к ИИ */
        .ha-input-row .mic-btn { width: 40px; height: 40px; border-radius: 50%; }
        .ha-input { flex: 1; min-width: 0; border: none; background: transparent; outline: none; font-family: inherit; font-size: 15px; color: var(--foreground); padding: 0 4px; }
        .ha-input::placeholder { color: var(--muted-foreground); }
        /* Отправка — тихая (призрак), чтобы не спорить акцентом с микрофоном */
        .ha-send { width: 36px; height: 36px; flex-shrink: 0; border: none; border-radius: 50%; background: transparent; color: var(--accent); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s, color 0.15s; }
        .ha-send:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 14%, transparent); }
        .ha-send:disabled { color: var(--muted); cursor: default; }
        @media (max-width: 640px) { .ha-input-row .mic-btn { width: 44px; height: 44px; } .ha-send { width: 40px; height: 40px; } }
        /* Не перекрывать плавающую таб-панель на мобильном — поднимаем FAB и панель выше неё */
        @media (max-width: 640px) {
          .ha-fab { bottom: calc(86px + env(safe-area-inset-bottom)); right: 16px; }
          .ha-panel { bottom: calc(150px + env(safe-area-inset-bottom)); right: 16px; }
        }
      `}</style>
    </>
  )
}
