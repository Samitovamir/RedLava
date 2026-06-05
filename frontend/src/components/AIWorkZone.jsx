import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReadingOverlay from './ReadingOverlay.jsx'
import { fetchImagesForQueries } from '../utils/wikiImages.js'

/*
  Рабочая зона ИИ на главной.
  Режимы:
   - file: сюда прилетают рабочие файлы; ИИ распределяет их по папкам / делает разбор
   - text: текстовая задача (узнать что-то, написать email/сообщение, создать событие)
  Состояния:
   - idle      → ввод
   - processing→ "Выполняется..."
   - result    → обзор файла с разбором ИЛИ превью сообщения с кнопками Одобрить/Править
*/

export default function AIWorkZone() {
  const [mode, setMode] = useState('file') // 'file' | 'text'
  const [isDragging, setIsDragging] = useState(false)
  const [status, setStatus] = useState('idle') // 'idle' | 'processing' | 'result' | 'done'
  const [file, setFile] = useState(null)
  const [task, setTask] = useState('')
  const [result, setResult] = useState(null)
  const [editingMsg, setEditingMsg] = useState(false)
  const [doneInfo, setDoneInfo] = useState(null) // { title, detail }
  const [reading, setReading] = useState(null) // { open, entries:[{q,text,images,loadingImages}], loading }
  const msgBackup = useRef(null)
  const fileInputRef = useRef(null)

  function handleDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) processFile(dropped)
  }

  function handleFilePick(e) {
    const picked = e.target.files?.[0]
    if (picked) processFile(picked)
  }

  async function processFile(f) {
    setFile(f)
    setStatus('processing')
    // TODO: реальный вызов POST /api/ai/analyze-file
    await new Promise(r => setTimeout(r, 1800))
    setResult({
      kind: 'file',
      title: f.name,
      folder: 'Проекты / Входящие',
      summary: 'Файл проанализирован. Это документ по проекту — предлагаю поместить в папку «Проекты / Входящие». Ключевые пункты: бюджет, сроки, ответственные.'
    })
    setStatus('result')
  }

  // Отправить запрос к ИИ. Письма → превью с одобрением; вопросы/«расскажи» → большое подробное окно.
  async function processTask() {
    const q = task.trim()
    if (!q) return
    setStatus('processing')
    const isMessage = /напиши|письмо|email|сообщени|ответь|ответ /i.test(q)

    if (isMessage) {
      const context =
        'Ты — личный секретарь владельца. Составь готовый текст письма/сообщения по его просьбе. ' +
        'Верни ТОЛЬКО сам текст сообщения, без пояснений и без подписи «от ИИ». Вежливо, тепло, по-деловому. ' +
        'Если уместна подпись — подпиши «С уважением, владелец».'
      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: q, context })
        })
        const data = await res.json()
        setResult({
          kind: 'message',
          to: 'Получатель',
          subject: 'Без темы',
          body: data.reply || 'Не удалось подготовить текст. Проверьте, что backend запущен с ключом ИИ.'
        })
      } catch {
        setResult({ kind: 'message', to: 'Получатель', subject: 'Без темы', body: 'Нет связи с сервером. Запустите backend с ключом ИИ.' })
      }
      setStatus('result')
      return
    }

    // Любознательный/информационный запрос — открываем «режим чтения» с памятью и картинками
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
        body: JSON.stringify({ message: q, history })
      })
      const data = await res.json()
      const entry = { q, text: data.text || 'Не удалось получить ответ.', images: [], loadingImages: !!(data.images?.length) }
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
      setReading({ open: true, entries: [...base, { q, text: 'Нет связи с сервером. Запустите backend с ключом ИИ.', images: [] }], loading: false })
    }
  }

  function reset() {
    setStatus('idle')
    setResult(null)
    setFile(null)
    setTask('')
    setEditingMsg(false)
    setDoneInfo(null)
  }

  // Завершить задачу — показать зелёный экран успеха
  function complete(title, detail) {
    setDoneInfo({ title, detail })
    setEditingMsg(false)
    setStatus('done')
  }

  // Возврат к прошлому этапу — текстовая задача с сохранённым текстом
  function backToTask() {
    setStatus('idle')
    setMode('text')
    setResult(null)
    setEditingMsg(false)
  }

  // Войти в режим правки письма (с бэкапом для отмены)
  function startEditMsg() {
    msgBackup.current = { ...result }
    setEditingMsg(true)
  }

  // Применить правки
  function saveEditMsg() {
    setEditingMsg(false)
  }

  // Отменить правки — восстановить из бэкапа
  function cancelEditMsg() {
    if (msgBackup.current) setResult(msgBackup.current)
    setEditingMsg(false)
  }

  function updateMsg(field, value) {
    setResult(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className={`ai-work-zone card ${status === 'done' ? 'is-done' : ''}`}>
      {/* Шапка с переключателем режимов */}
      <div className="awz-head">
        <div className="awz-title">
          <span className="awz-badge">ИИ</span>
          <span>Рабочая зона</span>
        </div>
        {status === 'idle' && (
          <div className="awz-switch">
            <button
              className={`awz-tab ${mode === 'file' ? 'active' : ''}`}
              onClick={() => setMode('file')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              Файл
            </button>
            <button
              className={`awz-tab ${mode === 'text' ? 'active' : ''}`}
              onClick={() => setMode('text')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="14" y2="18"/>
              </svg>
              Текстовая задача
            </button>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* IDLE: режим файла — пока В РАЗРАБОТКЕ (без фейкового разбора) */}
        {status === 'idle' && mode === 'file' && (
          <motion.div
            key="file"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="awz-dropzone awz-dev"
          >
            <div className="awz-drop-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p>Загрузка и разбор файлов</p>
            <span>ИИ будет распределять файлы по папкам и делать разбор</span>
            <div className="awz-dev-overlay">
              <div className="awz-dev-tape">В РАЗРАБОТКЕ</div>
            </div>
          </motion.div>
        )}

        {/* IDLE: текстовая задача */}
        {status === 'idle' && mode === 'text' && (
          <motion.div
            key="text"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="awz-text-mode"
          >
            <textarea
              className="awz-textarea"
              placeholder="Опишите задачу: написать письмо команде, найти информацию, создать событие в календаре…"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={4}
            />
            <button className="awz-submit" onClick={processTask} disabled={!task.trim()}>
              Выполнить
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
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
            <p>Выполняется…</p>
            <span>{file ? `Анализирую «${file.name}»` : 'Обрабатываю задачу'}</span>
          </motion.div>
        )}

        {/* RESULT: разбор файла */}
        {status === 'result' && result?.kind === 'file' && (
          <motion.div
            key="res-file"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="awz-result"
          >
            <div className="awz-result-head">
              <span className="awz-file-name">{result.title}</span>
              <span className="awz-folder-tag">→ {result.folder}</span>
            </div>
            <p className="awz-result-text">{result.summary}</p>
            <div className="awz-actions">
              <button
                className="awz-btn primary"
                onClick={() => complete('Файл распределён', `«${result.title}» перемещён в папку «${result.folder}».`)}
              >Подтвердить распределение</button>
              <button className="awz-btn ghost" onClick={reset}>Отмена</button>
            </div>
          </motion.div>
        )}

        {/* RESULT: превью сообщения — режим просмотра */}
        {status === 'result' && result?.kind === 'message' && !editingMsg && (
          <motion.div
            key="res-msg"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="awz-result"
          >
            <div className="awz-msg-preview">
              <div className="awz-msg-row"><span className="awz-msg-label">Кому</span><span>{result.to}</span></div>
              <div className="awz-msg-row"><span className="awz-msg-label">Тема</span><span>{result.subject}</span></div>
              <div className="awz-msg-body">{result.body}</div>
            </div>
            <div className="awz-actions">
              <button
                className="awz-btn primary"
                onClick={() => complete('Письмо отправлено', `Сообщение «${result.subject}» отправлено получателю «${result.to}».`)}
              >Одобрить и отправить</button>
              <button className="awz-btn ghost" onClick={startEditMsg}>Править</button>
              <button className="awz-btn ghost" onClick={backToTask}>Отменить</button>
            </div>
          </motion.div>
        )}

        {/* RESULT: превью сообщения — режим редактирования */}
        {status === 'result' && result?.kind === 'message' && editingMsg && (
          <motion.div
            key="edit-msg"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="awz-result"
          >
            <div className="awz-msg-edit">
              <div className="awz-edit-field">
                <span className="awz-msg-label">Кому</span>
                <input
                  className="awz-edit-input"
                  value={result.to}
                  onChange={(e) => updateMsg('to', e.target.value)}
                />
              </div>
              <div className="awz-edit-field">
                <span className="awz-msg-label">Тема</span>
                <input
                  className="awz-edit-input"
                  value={result.subject}
                  onChange={(e) => updateMsg('subject', e.target.value)}
                />
              </div>
              <textarea
                className="awz-edit-body"
                value={result.body}
                onChange={(e) => updateMsg('body', e.target.value)}
                rows={5}
              />
            </div>
            <div className="awz-actions">
              <button className="awz-btn primary" onClick={saveEditMsg}>Готово</button>
              <button className="awz-btn ghost" onClick={cancelEditMsg}>Отменить</button>
            </div>
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
              <p className="awz-done-title">Готово · {doneInfo.title}</p>
              <span className="awz-done-detail">{doneInfo.detail}</span>
            </div>
            <button className="awz-btn green" onClick={reset}>Новая задача</button>
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
          gap: 18px;
          min-height: 280px;
          transition: border-color 0.3s, box-shadow 0.3s;
        }
        /* Зелёное оформление всей карточки после выполнения */
        .ai-work-zone.is-done {
          border-color: rgba(34,197,94,0.5);
          box-shadow: 0 0 0 1px rgba(34,197,94,0.25), 0 8px 32px rgba(34,197,94,0.10);
          background:
            radial-gradient(700px circle at 50% -10%, rgba(34,197,94,0.08), transparent 60%),
            linear-gradient(160deg, var(--card), #29251f);
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
        .awz-switch {
          display: flex;
          gap: 4px;
          background: var(--bg-secondary);
          padding: 4px;
          border-radius: 12px;
        }
        .awz-tab {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 8px 14px;
          border: none;
          background: transparent;
          color: var(--muted-foreground);
          font-family: inherit;
          font-size: 13px;
          font-weight: 500;
          border-radius: 9px;
          cursor: pointer;
          transition: all 0.18s;
        }
        .awz-tab:hover { color: var(--foreground); }
        .awz-tab.active {
          background: var(--card);
          color: var(--primary);
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        }

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
          background: rgba(129,140,248,0.07);
        }
        /* «В разработке» — полупрозрачное окно + жёлтая лента */
        .awz-dropzone.awz-dev { position: relative; cursor: default; }
        .awz-dropzone.awz-dev:hover { border-color: var(--border); }
        .awz-dev-overlay {
          position: absolute; inset: 0; border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(30, 27, 24, 0.62);
          backdrop-filter: blur(1.5px); -webkit-backdrop-filter: blur(1.5px);
        }
        .awz-dev-tape {
          transform: rotate(-5deg);
          background: repeating-linear-gradient(45deg, #f59e0b 0 16px, #161310 16px 32px);
          color: #fff; font-weight: 800; letter-spacing: 0.18em; font-size: 16px;
          padding: 12px 44px; border-radius: 4px;
          border-top: 3px solid #f59e0b; border-bottom: 3px solid #f59e0b;
          text-shadow: 0 1px 4px rgba(0,0,0,0.9);
          box-shadow: 0 8px 24px rgba(0,0,0,0.45);
        }
        .awz-drop-icon {
          width: 60px; height: 60px;
          border-radius: 18px;
          background: rgba(129,140,248,0.12);
          display: flex; align-items: center; justify-content: center;
        }
        .awz-dropzone p { font-size: 15px; font-weight: 600; color: var(--foreground); }
        .awz-dropzone span { font-size: 13px; color: var(--muted-foreground); }

        .awz-text-mode { display: flex; flex-direction: column; gap: 14px; flex: 1; }
        .awz-textarea {
          flex: 1;
          min-height: 150px;
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
          background: rgba(129,140,248,0.12);
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
        .awz-btn.green {
          background: var(--green);
          color: #0c1f12;
        }
        .awz-btn.green:hover { opacity: 0.9; }

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
          background: rgba(34,197,94,0.16);
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
