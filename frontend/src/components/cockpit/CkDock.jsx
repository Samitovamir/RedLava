import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Check, X } from 'lucide-react'
import MicButton from '../MicButton.jsx'
import ReadingOverlay from '../ReadingOverlay.jsx'
import { fetchImagesForQueries } from '../../utils/wikiImages.js'
import { useSiteSnapshot } from '../../hooks/useSiteSnapshot.js'
import { useEvents } from '../../context/EventsContext.jsx'
import { useMail } from '../../context/MailContext.jsx'
import { useMemoryFacts } from '../../context/MemoryContext.jsx'
import { useHistory } from '../../context/HistoryContext.jsx'
import { useLang, useT } from '../../context/LanguageContext.jsx'

/*
  ИИ-док «Одного экрана» — тонкая командная строка внизу: сказать/написать
  задачу, не теряя дашборд из виду. Мозги те же, что у рабочей зоны ИИ
  (письма → превью с одобрением; команды → /agent с инструментами; вопросы →
  режим чтения). Результат всплывает КАРТОЧКОЙ НАД доком — сетка не прыгает.
  Сам док не скроллится (скроллится вложенный список) — прошивка карточек цела.
*/
export default function CkDock() {
  const { lang } = useLang()
  const t = useT({
    ru: {
      badge: 'ИИ', placeholder: 'Скажите или напишите задачу — событие, письмо, вопрос…',
      run: 'Выполнить', processing: 'Выполняю…',
      to: 'Кому', subject: 'Тема',
      approve: 'Одобрить и отправить', cancel: 'Отмена', done: 'Готово',
      newTask: 'Новая задача',
      recipient: 'Получатель', noSubject: 'Без темы',
      msgFail: 'Не удалось подготовить текст. Проверьте, что backend запущен с ключом ИИ.',
      noServer: 'Нет связи с сервером. Запустите backend с ключом ИИ.',
      ready: 'Готово.', accepted: 'Принято.',
      readFail: 'Не удалось получить ответ.',
      remembered: (f) => `Запомнил: ${f}`,
      mailDone: (s, to) => `Письмо «${s}» отправлено получателю «${to}».`,
    },
    en: {
      badge: 'AI', placeholder: 'Say or type a task — an event, an email, a question…',
      run: 'Run', processing: 'Working…',
      to: 'To', subject: 'Subject',
      approve: 'Approve and send', cancel: 'Cancel', done: 'Done',
      newTask: 'New task',
      recipient: 'Recipient', noSubject: 'No subject',
      msgFail: 'Couldn’t prepare the text. Make sure the backend is running with the AI key.',
      noServer: 'No connection to the server. Start the backend with the AI key.',
      ready: 'Done.', accepted: 'Got it.',
      readFail: 'Couldn’t get a response.',
      remembered: (f) => `Remembered: ${f}`,
      mailDone: (s, to) => `Message “${s}” sent to “${to}”.`,
    },
  })

  const [task, setTask] = useState('')
  const [status, setStatus] = useState('idle') // idle | processing | result | done
  const [result, setResult] = useState(null)   // { kind:'message', to, subject, body }
  const [doneInfo, setDoneInfo] = useState(null)
  const [reading, setReading] = useState(null)
  const inputRef = useRef(null)
  const doneTimer = useRef(null)
  useEffect(() => () => clearTimeout(doneTimer.current), [])

  const snapshot = useSiteSnapshot()
  const { applyAiActions } = useEvents()
  const { openDraft } = useMail()
  const { addFact, updateFact } = useMemoryFacts()
  const { logAction } = useHistory()

  function complete(title, detail = '') {
    setDoneInfo({ title, detail })
    setStatus('done')
    setTask('')
    // Зелёная строка не висит вечно — дашборд возвращается сам
    clearTimeout(doneTimer.current)
    doneTimer.current = setTimeout(() => { setDoneInfo(null); setStatus('idle') }, 7000)
  }
  function reset() {
    clearTimeout(doneTimer.current)
    setStatus('idle'); setResult(null); setDoneInfo(null)
  }

  async function processTask() {
    const q = task.trim()
    if (!q || status === 'processing') return
    setStatus('processing')
    const isMessage = /напиши|письмо|email|сообщени|ответь|ответ /i.test(q)
    const isCommand = /поставь|запиш|закин|добавь|напомн|назнач|перенес|сдвин|передвин|убер|удал|отмен|запомни|созда/i.test(q)

    if (isMessage) {
      const context =
        'Ты — личный секретарь владельца. Составь готовый текст письма/сообщения по его просьбе. ' +
        'Верни ТОЛЬКО сам текст сообщения, без пояснений и без подписи «от ИИ». Вежливо, тепло, по-деловому. ' +
        'Если уместна подпись — подпиши «С уважением, владелец».' +
        (lang === 'en' ? ' Always reply to the user in English.' : '')
      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: q, context, snapshot })
        })
        const data = await res.json()
        setResult({ kind: 'message', to: t.recipient, subject: t.noSubject, body: data.reply || t.msgFail })
      } catch {
        setResult({ kind: 'message', to: t.recipient, subject: t.noSubject, body: t.noServer })
      }
      setStatus('result')
      return
    }

    if (isCommand) {
      try {
        const res = await fetch('/api/ai/agent', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: q, snapshot, context: 'Запрос из ИИ-дока на «Одном экране».' + (lang === 'en' ? ' Always reply to the user in English.' : '') })
        })
        const data = await res.json()
        const actions = data.actions || []
        const eventActions = actions.filter(a => !['remember_fact', 'update_fact', 'send_email'].includes(a.name))
        const memActions = actions.filter(a => a.name === 'remember_fact')
        const updateActions = actions.filter(a => a.name === 'update_fact')
        const mailActions = actions.filter(a => a.name === 'send_email')
        if (eventActions.length) applyAiActions(eventActions)
        if (mailActions.length) openDraft(mailActions[0].input)
        memActions.forEach(a => {
          if (a.input?.fact) { addFact(a.input.fact); logAction({ actor: 'ai', type: 'task', title: t.remembered(a.input.fact) }) }
        })
        updateActions.forEach(a => {
          if (a.input?.old) { updateFact(a.input.old, a.input.new); logAction({ actor: 'ai', type: 'task', title: a.input.new ? t.remembered(a.input.new) : `Забыл устаревшее: ${a.input.old}` }) }
        })
        complete(data.reply || (actions.length ? t.ready : t.accepted))
      } catch {
        complete(t.noServer)
      }
      return
    }

    // Вопрос/«расскажи» — режим чтения поверх дашборда
    setStatus('idle')
    setTask('')
    askRead(q, [])
  }

  async function askRead(q, existingEntries) {
    const base = existingEntries || []
    const history = base.flatMap(e => [{ role: 'user', text: e.q }, { role: 'assistant', text: e.text }])
    setReading({ open: true, entries: base, loading: true })
    try {
      const res = await fetch('/api/ai/read', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history, snapshot, context: lang === 'en' ? 'Always reply to the user in English.' : '' })
      })
      const data = await res.json()
      const entry = { q, text: data.text || t.readFail, images: [], loadingImages: !!(data.images?.length) }
      setReading({ open: true, entries: [...base, entry], loading: false })
      if (data.images?.length) {
        const imgs = await fetchImagesForQueries(data.images)
        setReading(prev => {
          if (!prev) return prev
          const ents = [...prev.entries]
          ents[ents.length - 1] = { ...ents[ents.length - 1], images: imgs, loadingImages: false }
          return { ...prev, entries: ents }
        })
      }
    } catch {
      setReading({ open: true, entries: [...base, { q, text: t.noServer, images: [] }], loading: false })
    }
  }

  const hasText = !!task.trim()

  return (
    <div className="card ck-dock">
      {/* Всплывающая карточка результата — НАД доком, сетка не двигается */}
      <AnimatePresence>
        {status === 'result' && result?.kind === 'message' && (
          <motion.div
            className="ckd-pop card"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.22 }}
          >
            <div className="ckd-pop-scroll">
              <div className="ckd-msg-row"><span>{t.to}</span><input value={result.to} onChange={e => setResult(r => ({ ...r, to: e.target.value }))} /></div>
              <div className="ckd-msg-row"><span>{t.subject}</span><input value={result.subject} onChange={e => setResult(r => ({ ...r, subject: e.target.value }))} /></div>
              <textarea
                className="ckd-msg-body"
                value={result.body}
                rows={6}
                onChange={e => setResult(r => ({ ...r, body: e.target.value }))}
              />
            </div>
            <div className="ckd-pop-actions">
              <button className="ckd-btn primary" onClick={() => { complete(t.done, t.mailDone(result.subject, result.to)) }}><Check size={15} /> {t.approve}</button>
              <button className="ckd-btn ghost" onClick={reset}><X size={15} /> {t.cancel}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <span className="ckd-badge">{t.badge}</span>

      {status === 'done' && doneInfo ? (
        <div className="ckd-done">
          <Check size={16} strokeWidth={2.5} />
          <span className="ckd-done-title">{doneInfo.title}</span>
          {doneInfo.detail && <span className="ckd-done-detail">{doneInfo.detail}</span>}
          <button className="ckd-btn ghost" onClick={reset}>{t.newTask}</button>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            className="ckd-input"
            placeholder={t.placeholder}
            value={task}
            disabled={status === 'processing'}
            onChange={e => setTask(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') processTask() }}
          />
          <MicButton onText={(txt) => setTask(v => (v ? v.trim() + ' ' : '') + txt)} />
          <button className="ckd-btn primary ckd-run" onClick={processTask} disabled={!hasText || status === 'processing'}>
            {status === 'processing' ? <span className="ckd-spin" /> : <ArrowRight size={15} />}
            {status === 'processing' ? t.processing : t.run}
          </button>
        </>
      )}

      <ReadingOverlay
        open={!!reading?.open}
        entries={reading?.entries || []}
        loading={!!reading?.loading}
        onClose={() => setReading(null)}
        onAsk={(question) => askRead(question, reading?.entries || [])}
      />

      <style>{`
        .ck-dock {
          position: relative;
          display: flex; align-items: center; gap: 12px;
          padding: 10px 14px; min-height: 0;
        }
        .ckd-badge {
          flex-shrink: 0;
          font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
          color: var(--on-accent); background: var(--accent);
          padding: 4px 9px; border-radius: 7px;
        }
        .ckd-input {
          flex: 1; min-width: 0;
          background: var(--bg-tile); border: 1px solid var(--border);
          border-radius: 11px; padding: 10px 14px;
          font-family: inherit; font-size: 14px; color: var(--foreground);
          outline: none; transition: border-color var(--dur-fast) var(--ease);
        }
        .ckd-input:focus { border-color: var(--accent); }
        .ckd-input::placeholder { color: var(--muted); }
        .ckd-btn {
          display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0;
          padding: 9px 16px; border-radius: 11px; border: 1px solid transparent;
          font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer;
          transition: filter var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
        }
        .ckd-btn.primary {
          background: linear-gradient(180deg, var(--accent-btn-top), var(--accent-btn-bot));
          color: var(--on-accent);
        }
        .ckd-btn.primary:hover:not(:disabled) { filter: brightness(1.06); }
        .ckd-btn.primary:disabled { background: var(--bg-tile); color: var(--text-faint); border-color: var(--border-med); cursor: not-allowed; }
        .ckd-btn.ghost { background: transparent; border-color: var(--border); color: var(--muted-foreground); }
        .ckd-btn.ghost:hover { color: var(--foreground); border-color: var(--border-hover); }
        .ckd-spin {
          width: 14px; height: 14px; border-radius: 50%;
          border: 2px solid color-mix(in srgb, var(--on-accent) 35%, transparent);
          border-top-color: var(--on-accent);
          animation: ckd-rot 0.8s linear infinite;
        }
        @keyframes ckd-rot { to { transform: rotate(360deg); } }
        .ckd-done { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; color: var(--status-ok); }
        .ckd-done-title { font-size: 14px; font-weight: 700; flex-shrink: 0; }
        .ckd-done-detail { font-size: 13px; color: var(--text-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ckd-done .ckd-btn { margin-left: auto; }

        .ckd-pop {
          position: absolute; left: 0; right: 0; bottom: calc(100% + 10px);
          z-index: 40;
          display: flex; flex-direction: column; gap: 12px;
          padding: 16px; max-height: 52vh;
          box-shadow: inset 0 1px 0 var(--edge-light), 0 24px 60px rgba(0, 0, 0, 0.45);
        }
        .ckd-pop-scroll { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
        .ckd-msg-row { display: flex; align-items: center; gap: 10px; font-size: 13px; }
        .ckd-msg-row span { color: var(--muted-foreground); min-width: 48px; font-weight: 500; flex-shrink: 0; }
        .ckd-msg-row input {
          flex: 1; min-width: 0;
          background: var(--bg-tile); border: 1px solid var(--border); border-radius: 9px;
          padding: 8px 12px; font-family: inherit; font-size: 13.5px; color: var(--foreground); outline: none;
        }
        .ckd-msg-row input:focus { border-color: var(--accent); }
        .ckd-msg-body {
          width: 100%; box-sizing: border-box; resize: vertical; min-height: 110px;
          background: var(--bg-tile); border: 1px solid var(--border); border-radius: 11px;
          padding: 12px; font-family: inherit; font-size: 14px; line-height: 1.6;
          color: var(--foreground); outline: none;
        }
        .ckd-msg-body:focus { border-color: var(--accent); }
        .ckd-pop-actions { display: flex; gap: 10px; flex-shrink: 0; }
      `}</style>
    </div>
  )
}
