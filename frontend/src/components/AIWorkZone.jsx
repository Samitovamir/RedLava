import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReadingOverlay from './ReadingOverlay.jsx'
import { fetchImagesForQueries } from '../utils/wikiImages.js'
import { useSiteSnapshot } from '../hooks/useSiteSnapshot.js'
import { useEvents } from '../context/EventsContext.jsx'
import { useMemoryFacts } from '../context/MemoryContext.jsx'
import { useHistory } from '../context/HistoryContext.jsx'
import { useLang, useT } from '../context/LanguageContext.jsx'
import VoiceInput from './VoiceInput.jsx'

/*
  Рабочая зона ИИ на главной. Только текстовая задача (узнать что-то, написать
  email/сообщение, создать событие). Файловый режим убран — он был заглушкой
  («в разработке» + фейковый разбор), реальный разбор файлов появится отдельно
  на /api/ai/analyze-file.
  Состояния:
   - idle      → ввод
   - processing→ "Выполняется..."
   - result    → превью сообщения с кнопками Одобрить/Править
*/

export default function AIWorkZone() {
  const [status, setStatus] = useState('idle') // 'idle' | 'processing' | 'result' | 'done'
  const [task, setTask] = useState('')
  const [result, setResult] = useState(null)
  const [doneInfo, setDoneInfo] = useState(null) // { title, detail }
  const [reading, setReading] = useState(null) // { open, entries:[{q,text,images,loadingImages}], loading }

  // Снимок данных (расписание/спорт/здоровье/анализы) и инструменты — чтобы ИИ в рабочей зоне
  // ВИДЕЛ календарь и реально выполнял задачи, как командная строка.
  const { lang } = useLang()
  const t = useT({
    ru: {
      badge: 'ИИ', titleMain: 'Ваш помощник',
      titleSub: 'Скажите или напишите задачу',
      tabText: 'Текстовая задача', tabFile: 'Файл',
      fileTitle: 'Загрузка и разбор файлов',
      fileSub: 'ИИ будет распределять файлы по папкам и делать разбор',
      inDev: 'В РАЗРАБОТКЕ',
      processing: 'Выполняется…',
      analyzing: (name) => `Анализирую «${name}»`,
      processingTask: 'Обрабатываю задачу',
      confirmDistribute: 'Подтвердить распределение', cancel: 'Отмена',
      to: 'Кому', subject: 'Тема',
      approveSend: 'Одобрить и отправить', edit: 'Править', cancelMsg: 'Отменить',
      done: 'Готово', newTask: 'Новая задача',
      // фолбэки/уведомления
      recipient: 'Получатель', noSubject: 'Без темы',
      msgFail: 'Не удалось подготовить текст. Проверьте, что backend запущен с ключом ИИ.',
      noServerMsg: 'Нет связи с сервером. Запустите backend с ключом ИИ.',
      noServer: 'Нет связи с сервером.', startBackend: 'Запустите backend с ключом ИИ.',
      ready: 'Готово.', accepted: 'Принято.',
      readFail: 'Не удалось получить ответ.',
      readNoServer: 'Нет связи с сервером. Запустите backend с ключом ИИ.',
      remembered: (f) => `Запомнил: ${f}`,
      fileSummaryTitle: (name) => name,
      fileFolder: 'Проекты / Входящие',
      fileSummary: 'Файл проанализирован. Это документ по проекту — предлагаю поместить в папку «Проекты / Входящие». Ключевые пункты: бюджет, сроки, ответственные.',
      fileDoneTitle: 'Файл распределён',
      fileDoneDetail: (title, folder) => `«${title}» перемещён в папку «${folder}».`,
      mailDoneTitle: 'Письмо отправлено',
      mailDoneDetail: (subject, to) => `Сообщение «${subject}» отправлено получателю «${to}».`
    },
    en: {
      badge: 'AI', titleMain: 'Your assistant',
      titleSub: 'Say or type a task',
      tabText: 'Text task', tabFile: 'File',
      fileTitle: 'Upload and analyze files',
      fileSub: 'The AI will sort files into folders and analyze them',
      inDev: 'IN DEVELOPMENT',
      processing: 'Working…',
      analyzing: (name) => `Analyzing “${name}”`,
      processingTask: 'Processing the task',
      confirmDistribute: 'Confirm placement', cancel: 'Cancel',
      to: 'To', subject: 'Subject',
      approveSend: 'Approve and send', edit: 'Edit', cancelMsg: 'Cancel',
      done: 'Done', newTask: 'New task',
      recipient: 'Recipient', noSubject: 'No subject',
      msgFail: 'Couldn’t prepare the text. Make sure the backend is running with the AI key.',
      noServerMsg: 'No connection to the server. Start the backend with the AI key.',
      noServer: 'No connection to the server.', startBackend: 'Start the backend with the AI key.',
      ready: 'Done.', accepted: 'Got it.',
      readFail: 'Couldn’t get a response.',
      readNoServer: 'No connection to the server. Start the backend with the AI key.',
      remembered: (f) => `Remembered: ${f}`,
      fileSummaryTitle: (name) => name,
      fileFolder: 'Projects / Inbox',
      fileSummary: 'File analyzed. This is a project document — I suggest placing it in the “Projects / Inbox” folder. Key points: budget, deadlines, owners.',
      fileDoneTitle: 'File sorted',
      fileDoneDetail: (title, folder) => `“${title}” moved to the “${folder}” folder.`,
      mailDoneTitle: 'Email sent',
      mailDoneDetail: (subject, to) => `Message “${subject}” sent to “${to}”.`
    }
  })

  const snapshot = useSiteSnapshot()
  const { applyAiActions } = useEvents()
  const { addFact, updateFact } = useMemoryFacts()
  const { logAction } = useHistory()


  // Отправить запрос к ИИ. Письма → превью с одобрением; вопросы/«расскажи» → большое подробное окно.
  async function processTask() {
    const q = task.trim()
    if (!q) return
    setStatus('processing')
    // Команда на расписание/память — создать/перенести/удалить событие, запомнить факт
    const isCommand = /поставь|запиш|закин|добавь|напомн|назнач|перенес|сдвин|передвин|убер|удал|отмен|запомни|созда/i.test(q)

    if (isCommand) {
      // Команда — идём в /agent (видит снимок, умеет инструменты), затем применяем действия
      try {
        const res = await fetch('/api/ai/agent', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: q, snapshot, context: 'Запрос из рабочей зоны на главном экране.' + (lang === 'en' ? ' Always reply to the user in English.' : '') })
        })
        const data = await res.json()
        const actions = data.actions || []
        const memNames = ['remember_fact', 'update_fact']
        const eventActions = actions.filter(a => !memNames.includes(a.name) && a.name !== 'send_email')
        const memActions = actions.filter(a => a.name === 'remember_fact')
        const updateActions = actions.filter(a => a.name === 'update_fact')
        if (eventActions.length) applyAiActions(eventActions)
        memActions.forEach(a => {
          if (a.input?.fact) { addFact(a.input.fact); logAction({ actor: 'ai', type: 'task', title: t.remembered(a.input.fact) }) }
        })
        updateActions.forEach(a => {
          if (a.input?.old) { updateFact(a.input.old, a.input.new); logAction({ actor: 'ai', type: 'task', title: a.input.new ? t.remembered(a.input.new) : `Забыл устаревшее: ${a.input.old}` }) }
        })
        complete(data.reply || (actions.length ? t.ready : t.accepted), '')
      } catch {
        complete(t.noServer, t.startBackend)
      }
      return
    }

    // Любознательный/информационный запрос (в т.ч. про его данные) — «режим чтения» со снимком
    reset() // рабочая зона за блюром снова чистая
    askRead(q, [])
  }

  // Запрос/уточнение в режиме чтения. existingEntries — уже показанные ответы (для памяти диалога).
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
          const li = ents.length - 1
          ents[li] = { ...ents[li], images: imgs, loadingImages: false }
          return { ...prev, entries: ents }
        })
      }
    } catch {
      setReading({ open: true, entries: [...base, { q, text: t.readNoServer, images: [] }], loading: false })
    }
  }

  function reset() {
    setStatus('idle')
    setResult(null)
    setTask('')
    setDoneInfo(null)
  }

  // Завершить задачу — показать зелёный экран успеха
  function complete(title, detail) {
    setDoneInfo({ title, detail })
    setStatus('done')
  }

  return (
    <div className={`ai-work-zone card ${status === 'done' ? 'is-done' : ''}`}>
      {/* Шапка с переключателем режимов */}
      <div className="awz-head">
        <div className="awz-title">
          <span className="awz-badge">{t.badge}</span>
          <div className="awz-title-text">
            <span className="awz-title-main">{t.titleMain}</span>
            <span className="awz-title-sub">{t.titleSub}</span>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* IDLE: текстовая задача */}
        {status === 'idle' && (
          <motion.div
            key="text"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="awz-text-mode"
          >
            <VoiceInput value={task} onChange={setTask} onSubmit={processTask} busy={status === 'processing'} />
          </motion.div>
        )}

        {/* PROCESSING */}
        {status === 'processing' && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="awz-processing"
          >
            <div className="awz-spinner" />
            <p>{t.processing}</p>
            <span>{t.processingTask}</span>
          </motion.div>
        )}

        {/* DONE: зелёный экран успеха */}
        {status === 'done' && doneInfo && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="awz-done"
          >
            <div className="awz-done-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div className="awz-done-text">
              <p className="awz-done-title">{t.done} · {doneInfo.title}</p>
              <span className="awz-done-detail">{doneInfo.detail}</span>
            </div>
            <button className="awz-btn primary" onClick={reset}>{t.newTask}</button>
          </motion.div>
        )}
      </AnimatePresence>

      <ReadingOverlay
        open={!!reading?.open}
        entries={reading?.entries || []}
        loading={!!reading?.loading}
        onClose={() => setReading(null)}
        onAsk={(question) => askRead(question, reading?.entries || [])}
      />

      <style>{`
        .ai-work-zone {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 12px;
          /* Вертикальные паддинги сокращены ~30% (20→14) — блок ИИ не «съедает»
             пол-экрана при минимуме контента; горизонтальные оставлены. */
          padding: 14px 20px;
          min-height: 168px;
          border: 1px solid var(--border-soft);
          background: var(--bg-surface);
          transition: border-color 0.3s;
        }
        .awz-title-text { display: flex; flex-direction: column; gap: 1px; }
        .awz-title-main { font-size: 16px; font-weight: 700; color: var(--foreground); }
        .awz-title-sub { font-size: 12px; color: var(--muted); }
        /* Зелёное оформление всей карточки после выполнения */
        .ai-work-zone.is-done {
          border-color: color-mix(in srgb, var(--green) 45%, transparent);
          background: var(--bg-surface);
        }
        .ai-work-zone.is-done .awz-badge { background: var(--green); }
        .awz-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .awz-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          font-weight: 600;
          color: var(--foreground);
        }
        .awz-badge {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: var(--primary-foreground);
          background: var(--primary);
          padding: 3px 8px;
          border-radius: 6px;
        }
        /* Единый ghost-ряд: «Текстовая задача» и «Файл» оформлены одинаково —
           иконка+текст, без постоянного фона; активный = акцент, прочий = muted. */
        .awz-switch {
          display: flex;
          gap: 4px;
        }
        .awz-tab {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 8px 12px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-family: inherit;
          font-size: 13px;
          font-weight: 500;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: color 0.18s, background 0.18s;
        }
        .awz-tab:hover { color: var(--accent); }
        .awz-tab.active {
          color: var(--accent);
          background: color-mix(in srgb, var(--accent) 12%, transparent);
        }
        @media (max-width: 640px) { .awz-tab { min-height: 40px; padding: 10px 14px; } }

        .awz-dropzone {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 200px;
          border: 1.5px dashed var(--border);
          border-radius: 14px;
          cursor: pointer;
          text-align: center;
          transition: border-color 0.2s, background 0.2s;
          background: rgba(255,255,255,0.01);
        }
        .awz-dropzone:hover { border-color: var(--border-hover); }
        .awz-dropzone.dragging {
          border-color: var(--primary);
          background: color-mix(in srgb, var(--accent) 7%, transparent);
        }
        /* «В разработке» — полупрозрачное окно + жёлтая лента */
        .awz-dropzone.awz-dev { position: relative; cursor: default; }
        .awz-dropzone.awz-dev:hover { border-color: var(--border); }
        .awz-dev-overlay {
          position: absolute; inset: 0; border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          background: color-mix(in srgb, var(--bg-app) 62%, transparent);
          backdrop-filter: blur(1.5px); -webkit-backdrop-filter: blur(1.5px);
        }
        .awz-dev-tape {
          transform: rotate(-5deg);
          background: repeating-linear-gradient(45deg, var(--status-warn) 0 16px, var(--edge-dark) 16px 32px);
          color: var(--on-accent); font-weight: 800; letter-spacing: 0.18em; font-size: 16px;
          padding: 12px 44px; border-radius: 4px;
          border-top: 3px solid var(--status-warn); border-bottom: 3px solid var(--status-warn);
          text-shadow: 0 1px 4px rgba(0,0,0,0.9);
          box-shadow: 0 8px 24px rgba(0,0,0,0.45);
        }
        .awz-drop-icon {
          width: 60px; height: 60px;
          border-radius: 18px;
          background: color-mix(in srgb, var(--accent) 12%, transparent);
          display: flex; align-items: center; justify-content: center;
        }
        .awz-dropzone p { font-size: 15px; font-weight: 600; color: var(--foreground); }
        .awz-dropzone span { font-size: 13px; color: var(--muted-foreground); }

        .awz-text-mode { display: flex; flex-direction: column; gap: 14px; flex: 1; }
        .awz-text-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .awz-textarea {
          flex: 1;
          min-height: 104px;
          resize: none;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 16px;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.6;
          color: var(--foreground);
          outline: none;
          transition: border-color 0.2s;
        }
        .awz-textarea:focus { border-color: var(--border-hover); }
        .awz-textarea::placeholder { color: var(--muted-foreground); }
        .awz-submit {
          align-self: flex-end;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 11px 22px;
          background: var(--primary);
          color: var(--primary-foreground);
          border: none;
          border-radius: 12px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.18s, transform 0.1s;
        }
        .awz-submit:hover:not(:disabled) { opacity: 0.9; }
        .awz-submit:active:not(:disabled) { transform: scale(0.97); }
        .awz-submit:disabled { opacity: 0.4; cursor: default; }

        .awz-processing {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          min-height: 200px;
        }
        .awz-spinner {
          width: 36px; height: 36px;
          border: 3px solid var(--bg-secondary);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: awz-spin 0.8s linear infinite;
        }
        @keyframes awz-spin { to { transform: rotate(360deg); } }
        .awz-processing p { font-size: 15px; font-weight: 600; color: var(--foreground); }
        .awz-processing span { font-size: 13px; color: var(--muted-foreground); }

        .awz-result { display: flex; flex-direction: column; gap: 14px; flex: 1; }
        .awz-result-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .awz-file-name { font-size: 16px; font-weight: 600; color: var(--foreground); }
        .awz-folder-tag {
          font-size: 12px;
          color: var(--primary);
          background: color-mix(in srgb, var(--accent) 12%, transparent);
          padding: 4px 12px;
          border-radius: 20px;
          font-weight: 500;
        }
        .awz-result-text { font-size: 14px; line-height: 1.65; color: var(--foreground); }

        .awz-msg-preview {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .awz-msg-row { display: flex; gap: 12px; font-size: 13px; }
        .awz-msg-label { color: var(--muted-foreground); min-width: 48px; font-weight: 500; }
        .awz-msg-body {
          margin-top: 6px;
          padding-top: 12px;
          border-top: 1px solid var(--border);
          font-size: 14px;
          line-height: 1.65;
          color: var(--foreground);
        }

        .awz-msg-edit {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .awz-edit-field {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .awz-edit-input {
          flex: 1;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 10px 14px;
          font-family: inherit;
          font-size: 14px;
          color: var(--foreground);
          outline: none;
          transition: border-color 0.2s;
        }
        .awz-edit-input:focus { border-color: var(--border-hover); }
        .awz-edit-body {
          width: 100%;
          resize: vertical;
          min-height: 120px;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.6;
          color: var(--foreground);
          outline: none;
          transition: border-color 0.2s;
        }
        .awz-edit-body:focus { border-color: var(--border-hover); }

        .awz-actions { display: flex; gap: 10px; margin-top: auto; }
        .awz-btn {
          padding: 10px 20px;
          border-radius: 11px;
          font-family: inherit;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.18s;
          border: 1px solid transparent;
        }
        .awz-btn.primary {
          background: var(--primary);
          color: var(--primary-foreground);
        }
        .awz-btn.primary:hover { opacity: 0.9; }
        .awz-btn.ghost {
          background: transparent;
          border-color: var(--border);
          color: var(--muted-foreground);
        }
        .awz-btn.ghost:hover { color: var(--foreground); border-color: var(--border-hover); }
        /* Зелёный экран успеха */
        .awz-done {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          min-height: 200px;
          text-align: center;
          padding: 24px;
        }
        .awz-done-icon {
          width: 56px; height: 56px;
          border-radius: 50%;
          background: color-mix(in srgb, var(--green) 16%, transparent);
          display: flex; align-items: center; justify-content: center;
        }
        .awz-done-text { display: flex; flex-direction: column; gap: 6px; }
        .awz-done-title {
          font-size: 17px;
          font-weight: 700;
          color: var(--green);
        }
        .awz-done-detail {
          font-size: 14px;
          color: var(--foreground);
          line-height: 1.5;
          max-width: 480px;
        }
      `}</style>
    </div>
  )
}
