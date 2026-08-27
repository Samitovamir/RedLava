import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useEvents, dateKey } from '../context/EventsContext.jsx'
import { useMail } from '../context/MailContext.jsx'
import { useMemoryFacts } from '../context/MemoryContext.jsx'
import { useHistory } from '../context/HistoryContext.jsx'
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

// Относительный день для eyebrow и промпта: сегодня/завтра/вчера/дата.
function dayRelative(dayKey, todayKey, lang) {
  const d0 = new Date(todayKey + 'T00:00:00'), d1 = new Date(dayKey + 'T00:00:00')
  const diff = Math.round((d1 - d0) / 86400000)
  const en = lang === 'en'
  if (diff === 0) return en ? 'today' : 'сегодня'
  if (diff === 1) return en ? 'tomorrow' : 'завтра'
  if (diff === -1) return en ? 'yesterday' : 'вчера'
  const [, m, dd] = dayKey.split('-').map(Number)
  const MM = en
    ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    : ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
  return `${dd} ${MM[m - 1]}`
}

// Короткий чип готовности (только для сегодня и при данных Whoop).
// Возвращает { label, tone }: tone = ok/warn/crit — цвет точки-индикатора.
function readinessChip(whoop, lang) {
  const r = whoop?.recovery
  if (r == null) return null
  const en = lang === 'en'
  if (r >= 67) return { label: en ? 'Reserve available' : 'Запас есть', tone: 'ok' }
  if (r >= 34) return { label: en ? 'In balance' : 'В балансе', tone: 'warn' }
  return { label: en ? 'Take it easy' : 'Стоит поберечься', tone: 'crit' }
}

export default function DaySummary({ dayKey: dayKeyProp } = {}) {
  const { lang } = useLang()
  const { events } = useEvents()
  const { facts } = useMemoryFacts()
  const snapshot = useSiteSnapshot()

  const todayKey = dateKey(mskNow())
  const dayKey = dayKeyProp || todayKey
  const dayEvents = events.filter(e => e.date === dayKey)
  const word = dayRelative(dayKey, todayKey, lang)
  const eyebrow = `${lang === 'en' ? 'Summary' : 'Сводка'} ${word}`.toUpperCase()
  // Чипы текущего состояния тела: нагрузка/восстановление (нейтральные) + готовность (зелёный).
  const whoop = readWhoopLive()
  const metrics = buildMetrics(whoop, readGarminLive(), dayKey, lang === 'en')
  const chip = readinessChip(whoop, lang)

  // Пока долгосрочная память не наполнилась — не советуем по рабочим встречам/звонкам.
  const memThin = (facts?.length || 0) < 8
  const DAY_CONTEXT =
    `Ты помощник пользователя по организации дня. Фокусируйся на расписании и планах, но ты ВИДИШЬ всю картину (спорт, здоровье, анализы) и учитываешь её в советах. ` +
    `Отвечай кратко и по делу на русском. Учитывай приоритеты событий и предпочтения из памяти.` +
    ` ДЕНЬ СВОДКИ: ${dayKey} (${word}). Сделай сводку именно про ЭТОТ день — бери события ИМЕННО этого дня из расписания, учитывай подготовку к нему и состояние. Если день не сегодня — не описывай «сегодня».` +
    (memThin
      ? ` ВАЖНО: ты пока мало знаешь о рабочем ритме пользователя — поэтому НЕ давай советов и рекомендаций про рабочие встречи и звонки (не пиши «нужны силы на завтрашние звонки», не советуй, как с ними быть). Сосредоточься на спорте, нагрузке, восстановлении и здоровье. Рабочие события можно лишь нейтрально упомянуть как факт расписания, без советов.`
      : '') +
    (lang === 'en' ? ' Always reply to the user in English.' : '')

  return <DaySummaryInner dayContext={DAY_CONTEXT} snapshot={snapshot} eyebrow={eyebrow} eventCount={dayEvents.length} metrics={metrics} chip={chip} />
}

function DaySummaryInner({ dayContext, snapshot, eyebrow, eventCount, metrics = [], chip }) {
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

  async function send(override) {
    const q = (typeof override === 'string' ? override : input).trim()
    if (!q || loading) return
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
        <span className="summary-eyebrow">{eyebrow}</span>
        <AiRefreshButton onClick={summary.refresh} loading={summary.loading} />
      </div>

      <div className="summary-card">
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
              {(metrics.length > 0 || chip) && (
                <div className="summary-tags">
                  {metrics.map(m => <span key={m} className="summary-tag">{m}</span>)}
                  {chip && (
                    <span className="summary-tag readiness">
                      <span className="summary-tag-dot" style={{ background: `var(--status-${chip.tone})` }} />
                      {chip.label}
                    </span>
                  )}
                </div>
              )}
            </>
          )
        })()}
      </div>

      {messages.length === 0 && (
        <div className="ds-chat-suggests">
          {t.suggests.map(s => (
            <button key={s} className="ds-chat-suggest" onClick={() => setInput(s)}>
              <Sparkles size={15} strokeWidth={1.5} className="ds-chat-suggest-ic" />
              <span className="ds-chat-suggest-txt">{s}</span>
            </button>
          ))}
        </div>
      )}

      {/* Мини-чат: история (если есть) + ввод, прижатый к низу */}
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
        {/* Голос — основной способ обращения к ИИ: микрофон надиктовывает и сразу отправляет */}
        <div className="ds-chat-input-row">
          <MicButton primary onText={txt => send((input ? input.trim() + ' ' : '') + txt)} />
          <input
            className="ds-chat-input"
            placeholder={t.placeholder}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
          />
          <button className="ds-chat-send" onClick={() => send()} disabled={loading || !input.trim()}>
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
        .summary-card {
          background: var(--bg-tile); border: 1px solid var(--border-med);
          border-radius: var(--radius-md); padding: 16px 18px;
          display: flex; flex-direction: column; gap: 10px;
        }
        .summary-headline {
          font-size: 25px; font-weight: 700; line-height: 1.18;
          color: var(--text-primary); letter-spacing: -0.02em;
          margin-top: 2px;
        }
        .summary-sub { font-size: 15.5px; line-height: 1.55; color: var(--text-secondary); white-space: pre-wrap; }
        .ds-done-badge {
          display: inline-block; margin-top: 6px; font-size: 11px; font-weight: 600;
          color: var(--green); background: color-mix(in srgb, var(--green) 14%, transparent);
          padding: 2px 8px; border-radius: 10px;
        }
        .summary-tags { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
        .summary-tag {
          display: inline-flex; align-items: center; gap: 7px;
          font-size: 12px; line-height: 1; font-weight: 500; white-space: nowrap;
          padding: 7px 11px; border-radius: var(--radius-sm);
          background: var(--bg-tile); border: 1px solid var(--border-med);
          color: var(--text-secondary);
        }
        /* Готовность — нейтральная плашка с маленькой точкой-индикатором статуса (не холодное пятно).
           Цвет точки задаётся inline от уровня восстановления: ok / warn / crit */
        .summary-tag.readiness { color: var(--text-body); }
        .summary-tag-dot {
          width: 7px; height: 7px; border-radius: 50%;
          flex-shrink: 0;
        }

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
          min-width: 0; overflow-wrap: anywhere;
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
        .ds-chat-suggests { display: flex; flex-direction: column; gap: 8px; }
        /* Кнопки-подсказки: явно «вопрос к ИИ», а не поле ввода — лёгкая плашка-чип
           с искрой-акцентом, без рамки-как-у-инпута */
        .ds-chat-suggest {
          display: flex; align-items: center; gap: 10px;
          width: 100%; text-align: left;
          font-size: 14px; padding: 11px 14px;
          border: none; background: var(--bg-tile);
          color: var(--text-secondary); border-radius: var(--radius-md);
          cursor: pointer; font-family: inherit;
          transition: background 0.15s, color 0.15s;
        }
        .ds-chat-suggest-ic { color: var(--accent); flex-shrink: 0; }
        .ds-chat-suggest-txt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ds-chat-suggest:hover { background: var(--bg-secondary); color: var(--text-body); }
        .ds-chat-input-row {
          display: flex; align-items: center; gap: 8px;
          background: var(--bg-tile);
          border: 1px solid var(--border-med);
          border-radius: var(--radius-md);
          padding: 6px 6px 6px 14px;
          transition: border-color 0.2s;
        }
        .ds-chat-input-row:focus-within { border-color: var(--accent); }
        .ds-chat-input {
          flex: 1; min-width: 0; border: none; background: transparent; outline: none;
          font-family: inherit; font-size: 14.5px; color: var(--text-primary);
        }
        .ds-chat-input::placeholder { color: var(--text-faint); }
        /* Микрофон — главный круглый «запись»: голос основной способ обращения к ИИ */
        .ds-chat-input-row .mic-btn { width: 40px; height: 40px; border-radius: 50%; }
        /* Отправка — тихая (призрак), не спорит акцентом с микрофоном */
        .ds-chat-send {
          width: 36px; height: 36px; flex-shrink: 0;
          border: none; border-radius: 50%;
          background: transparent; color: var(--accent);
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: background 0.15s, color 0.15s;
        }
        .ds-chat-send:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 14%, transparent); }
        .ds-chat-send:disabled { color: var(--text-faint); cursor: default; }
        @media (max-width: 640px) { .ds-chat-input-row .mic-btn { width: 44px; height: 44px; } .ds-chat-send { width: 40px; height: 40px; } }
      `}</style>
    </div>
  )
}
