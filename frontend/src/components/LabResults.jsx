import { useState, useRef, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PANELS, INITIAL_REPORTS, buildHistory, markerStatus, STATUS_INFO,
  rangeText, barGeom, fmtDate, LABS_STORE_KEY
} from '../utils/labs.js'
import MicButton from './MicButton.jsx'

const STORE_KEY = LABS_STORE_KEY

// Мини-тренд значения по истории
function MiniSpark({ points, color }) {
  if (points.length < 2) return null
  const vals = points.map(p => p.value)
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1
  const w = 54, h = 18, pad = 2
  const pts = vals.map((v, i) =>
    `${(pad + (i / (vals.length - 1)) * (w - 2 * pad)).toFixed(1)},${(pad + (1 - (v - min) / range) * (h - 2 * pad)).toFixed(1)}`
  ).join(' ')
  return (
    <svg width={w} height={h} className="lm-spark">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function LabResults() {
  const [reports, setReports] = useState(() => {
    try {
      // Старые демо-данные уже вычищены централизованно при импорте labs.js (по версии).
      const saved = localStorage.getItem(STORE_KEY)
      if (saved) return JSON.parse(saved)
    } catch { /* ignore */ }
    return INITIAL_REPORTS
  })
  const [dragOver, setDragOver] = useState(false)
  const [stage, setStage] = useState('idle')   // idle | analyzing | done
  const [busyName, setBusyName] = useState(null)
  const [aiText, setAiText] = useState('')
  const fileInput = useRef(null)

  // Чат по анализам
  const [chat, setChat] = useState([])         // [{ role:'user'|'assistant', text }]
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const chatEnd = useRef(null)

  // Распознавание анализов из Яндекс.Диска (если подключён)
  const [syncing, setSyncing] = useState(false)
  const [syncTotal, setSyncTotal] = useState(0)
  const [syncDone, setSyncDone] = useState(0)

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(reports)) } catch { /* ignore */ }
  }, [reports])

  // При подключённом Яндекс.Диске: разбираем новые файлы по очереди и подставляем реальные анализы
  useEffect(() => {
    let alive = true
    fetch('/api/labs/status').then(r => r.json()).then(async st => {
      if (!alive || !st.connected) return
      const fr = await fetch('/api/labs/files').then(r => r.json()).catch(() => null)
      const files = fr?.files || []
      if (!files.length) return
      const todo = files.filter(f => !f.parsed)
      if (todo.length) {
        setSyncing(true); setSyncTotal(files.length); setSyncDone(files.length - todo.length)
        for (const f of todo) {
          if (!alive) return
          await fetch('/api/labs/parse', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: f.path, modified: f.modified })
          }).catch(() => {})
          if (!alive) return
          setSyncDone(d => d + 1)
        }
      }
      const rep = await fetch('/api/labs/reports').then(r => r.json()).catch(() => null)
      if (!alive || !rep?.reports?.length) { setSyncing(false); return }
      // Приводим к формату фронта: значения — простые числа по стандартным названиям
      const flat = rep.reports.map(r => ({
        id: r.date, date: r.date, fileName: r.fileName || 'Яндекс.Диск',
        values: Object.fromEntries(Object.entries(r.values).map(([k, val]) => [k, (val && typeof val === 'object') ? val.v : val]))
      }))
      setReports(flat)
      setSyncing(false)
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  const history = useMemo(() => buildHistory(reports), [reports])
  const latestOf = name => history[name]?.[history[name].length - 1]

  // Маркеры вне нормы (по последним значениям)
  const flagged = PANELS.flatMap(p => p.markers)
    .map(m => ({ m, last: latestOf(m.name) }))
    .filter(x => x.last && markerStatus(x.last.value, x.m.min, x.m.max) !== 'ok')

  const reportsByDate = [...reports].sort((a, b) => b.date.localeCompare(a.date))

  // Текстовая выжимка показателей (последние значения) для контекста ИИ
  function labSummaryText(snapshotReports) {
    const hist = buildHistory(snapshotReports)
    return PANELS.map(p => {
      const lines = p.markers.map(m => {
        const h = hist[m.name]; if (!h) return null
        const v = h[h.length - 1].value
        const st = markerStatus(v, m.min, m.max)
        return `${m.name} ${v} ${m.unit} (норма ${rangeText(m.min, m.max)})${st !== 'ok' ? ` — ${STATUS_INFO[st].label}` : ''}`
      }).filter(Boolean)
      return lines.length ? `${p.name}: ${lines.join(', ')}` : null
    }).filter(Boolean).join('. ')
  }

  // Контекст «врача» с актуальными анализами — общий для расшифровки и чата
  function doctorContext(snapshotReports) {
    return (
      `Ты — внимательный врач-терапевт, который объясняет анализы крови владельцу, пожилому человеку без медицинского образования. ` +
      `Вот его последние результаты: ${labSummaryText(snapshotReports)}. ` +
      `Отвечай простыми словами, спокойно и поддерживающе. Опирайся на эти цифры и их динамику. ` +
      `Не ставь диагноз и не назначай лекарства — при отклонениях мягко советуй обратиться к врачу.`
    )
  }

  async function runAi(snapshotReports) {
    const context =
      doctorContext(snapshotReports) +
      ` Сейчас сделай общую расшифровку: что в норме, на что обратить внимание (отклонения и динамика), общие рекомендации по образу жизни.`
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Расшифруй мои анализы крови с учётом динамики', context })
      })
      const data = await res.json()
      setAiText(data.reply || 'Не удалось получить расшифровку.')
    } catch {
      setAiText('Нет связи с сервером. Запустите backend с ключом ИИ для расшифровки. Диаграммы и динамика ниже работают и без него.')
    }
  }

  // Прочитать файл как base64 (без data: префикса)
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result).split(',')[1] || '')
      fr.onerror = reject
      fr.readAsDataURL(file)
    })
  }

  // Реальное распознавание загруженного файла через ИИ (никаких выдуманных значений)
  async function ingest(file) {
    setBusyName(file.name)
    setStage('analyzing')
    setAiText('')
    try {
      const data = await fileToBase64(file)
      const res = await fetch('/api/labs/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, mime: file.type, data })
      })
      const out = await res.json()
      if (!out.ok || !out.report) {
        setStage('done')
        setAiText(out.message || 'Не удалось распознать показатели в этом файле. Проверьте, что это анализ крови.')
        return
      }
      const r = out.report
      const flat = {
        id: r.id, date: r.date, fileName: r.fileName || file.name,
        values: Object.fromEntries(Object.entries(r.values).map(([k, val]) => [k, (val && typeof val === 'object') ? val.v : val]))
      }
      // Заменяем отчёт той же даты, если он уже есть, иначе добавляем
      const next = [...reports.filter(x => x.date !== flat.date), flat]
      setReports(next)
      setStage('done')
      runAi(next)
    } catch {
      setStage('done')
      setAiText('Не удалось загрузить файл. Попробуйте ещё раз или другой файл.')
    }
  }

  function onDrop(e) {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files?.[0]; if (f) ingest(f)
  }
  function onPick(e) {
    const f = e.target.files?.[0]; if (f) ingest(f)
  }
  function analyzeExisting() {
    setStage('done'); setAiText(''); runAi(reports)
  }

  // Чат: задать вопрос ИИ по своим анализам
  async function sendChat(e) {
    e?.preventDefault?.()
    const q = chatInput.trim()
    if (!q || chatBusy) return
    const history = chat.map(m => ({ role: m.role, text: m.text }))
    setChat(prev => [...prev, { role: 'user', text: q }])
    setChatInput('')
    setChatBusy(true)
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, context: doctorContext(reports), history })
      })
      const data = await res.json()
      setChat(prev => [...prev, { role: 'assistant', text: data.reply || 'Не удалось ответить.' }])
    } catch {
      setChat(prev => [...prev, { role: 'assistant', text: 'Нет связи с сервером. Запустите backend с ключом ИИ.' }])
    } finally {
      setChatBusy(false)
    }
  }

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chat, chatBusy])

  return (
    <div className="card lab-block">
      <div className="lab-head">
        <div>
          <div className="lab-title">Анализы крови и расшифровка</div>
          <div className="lab-sub muted">Загружайте анализы по мере сдачи — ИИ копит историю и расшифровывает простыми словами</div>
        </div>
        <button className="lab-ai-btn" onClick={analyzeExisting} disabled={stage === 'analyzing'}>
          Расшифровать всё
        </button>
      </div>

      {syncing && (
        <div className="lab-sync">
          <div className="lab-sync-row">
            <div className="lab-spinner" />
            <span>ИИ распознаёт анализы из Яндекс.Диска: {syncDone} из {syncTotal}…</span>
          </div>
          <div className="lab-sync-bar"><div className="lab-sync-fill" style={{ width: `${syncTotal ? (syncDone / syncTotal) * 100 : 0}%` }} /></div>
        </div>
      )}

      {/* Зона загрузки */}
      <div
        className={`lab-drop ${dragOver ? 'over' : ''} ${stage === 'analyzing' ? 'busy' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => stage !== 'analyzing' && fileInput.current?.click()}
      >
        <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" hidden onChange={onPick} />
        {stage === 'analyzing' ? (
          <>
            <div className="lab-spinner" />
            <span className="lab-drop-title">ИИ распознаёт «{busyName}»…</span>
            <span className="lab-drop-hint muted">Извлекаем показатели и добавляем в историю</span>
          </>
        ) : (
          <>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span className="lab-drop-title">Перетащите файл или нажмите</span>
            <span className="lab-drop-hint muted">PDF, фото · можно по одному, в разные дни</span>
          </>
        )}
      </div>

      {/* Журнал загруженных отчётов */}
      <div className="lab-timeline">
        <span className="lab-tl-lbl muted">Загружено:</span>
        <div className="lab-tl-list">
          {reportsByDate.map(r => (
            <div key={r.id} className="lab-tl-item" title={r.fileName}>
              <span className="lab-tl-date">{fmtDate(r.date)}</span>
              <span className="lab-tl-name">{r.fileName}</span>
              <span className="lab-tl-count muted">{Object.keys(r.values).length} показ.</span>
            </div>
          ))}
        </div>
      </div>

      {/* Расшифровка от ИИ */}
      <AnimatePresence>
        {stage === 'done' && (
          <motion.div className="lab-ai"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="summary-head">
              <span className="summary-badge">ИИ</span>
              <div className="card-title" style={{ margin: 0 }}>Расшифровка</div>
            </div>
            <p className="lab-ai-text">{aiText || 'Готовлю расшифровку…'}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Чат по анализам — можно спросить ИИ что угодно про свои показатели */}
      <div className="lab-chat">
        <div className="lab-chat-head muted">Спросите ИИ про ваши анализы</div>
        {chat.length > 0 && (
          <div className="lab-chat-thread">
            {chat.map((m, i) => (
              <div key={i} className={`lab-msg ${m.role}`}>
                <span className="lab-msg-text">{m.text}</span>
              </div>
            ))}
            {chatBusy && (
              <div className="lab-msg assistant">
                <span className="lab-msg-text lab-typing">ИИ печатает…</span>
              </div>
            )}
            <div ref={chatEnd} />
          </div>
        )}
        <form className="lab-chat-bar" onSubmit={sendChat}>
          <MicButton primary onText={t => setChatInput(prev => (prev ? prev.trim() + ' ' : '') + t)} />
          <input
            className="lab-chat-input"
            placeholder="Скажите или спросите: почему повышен холестерин? что есть, чтобы снизить сахар?"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            disabled={chatBusy}
          />
          <button className="lab-chat-send" type="submit" disabled={!chatInput.trim() || chatBusy}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </form>
      </div>

      {/* Сводка отклонений */}
      {flagged.length > 0 && (
        <div className="lab-flags">
          <span className="lab-flags-lbl muted">Вне нормы:</span>
          {flagged.map(({ m, last }) => {
            const st = markerStatus(last.value, m.min, m.max)
            return (
              <span key={m.name} className="lab-flag" style={{ color: STATUS_INFO[st].color, borderColor: STATUS_INFO[st].color }}>
                {m.name} {st === 'high' ? '↑' : '↓'}
              </span>
            )
          })}
        </div>
      )}

      {/* Панели с диаграммами */}
      <div className="lab-panels">
        {PANELS.map(panel => {
          const hasAny = panel.markers.some(m => latestOf(m.name))
          return (
            <div key={panel.name} className="lab-panel">
              <div className="lab-panel-title">
                <span className="lab-panel-icon">{panel.icon}</span>{panel.name}
                {!hasAny && <span className="lab-panel-wait muted">ещё не загружен</span>}
              </div>
              <div className="lab-markers">
                {panel.markers.map(m => {
                  const h = history[m.name]
                  if (!h) return (
                    <div key={m.name} className="lab-marker pending">
                      <div className="lm-top">
                        <span className="lm-name">{m.name}</span>
                        <span className="lm-await muted">ожидается</span>
                      </div>
                    </div>
                  )
                  const last = h[h.length - 1]
                  const prev = h.length >= 2 ? h[h.length - 2] : null
                  const st = markerStatus(last.value, m.min, m.max)
                  const c = STATUS_INFO[st].color
                  const g = barGeom(last.value, m.min, m.max)
                  return (
                    <div key={m.name} className="lab-marker">
                      <div className="lm-top">
                        <span className="lm-name">{m.name}</span>
                        <span className="lm-value" style={{ color: c }}>{last.value} <span className="lm-unit muted">{m.unit}</span></span>
                      </div>
                      <div className="lm-bar">
                        <div className="lm-band" style={{ left: `${g.bandLeft}%`, width: `${g.bandRight - g.bandLeft}%` }} />
                        <div className="lm-marker-dot" style={{ left: `${g.valuePos}%`, background: c }} />
                      </div>
                      <div className="lm-bottom">
                        <span className="lm-range muted">норма {rangeText(m.min, m.max)}</span>
                        <span className="lm-status" style={{ color: c }}>{STATUS_INFO[st].label}</span>
                      </div>
                      {prev && (
                        <div className="lm-trend">
                          <MiniSpark points={h} color="var(--muted-foreground)" />
                          <span className="lm-trend-txt muted">
                            {last.value > prev.value ? '↑' : last.value < prev.value ? '↓' : '→'} было {prev.value} · {fmtDate(prev.date)}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        .lab-block { display: flex; flex-direction: column; gap: 18px; }
        .lab-sync { display: flex; flex-direction: column; gap: 8px; background: var(--bg-secondary); border-radius: 12px; padding: 14px 16px; }
        .lab-sync-row { display: flex; align-items: center; gap: 12px; font-size: 14px; color: var(--foreground); }
        .lab-sync-bar { height: 6px; background: var(--bg-primary); border-radius: 3px; overflow: hidden; }
        .lab-sync-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.3s; }
        .lab-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .lab-title { font-size: 17px; font-weight: 700; color: var(--foreground); }
        .lab-sub { font-size: 13px; margin-top: 3px; max-width: 560px; }
        .lab-ai-btn {
          flex-shrink: 0; padding: 8px 14px; border-radius: 10px;
          border: 1px solid var(--primary); background: transparent; color: var(--primary);
          font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s;
        }
        .lab-ai-btn:hover:not(:disabled) { background: rgba(129,140,248,0.12); }
        .lab-ai-btn:disabled { opacity: 0.4; cursor: default; }

        .lab-drop {
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px;
          padding: 26px 20px; border-radius: 14px;
          border: 2px dashed var(--border); background: var(--bg-secondary);
          color: var(--muted-foreground); cursor: pointer; text-align: center; transition: all 0.18s;
        }
        .lab-drop:hover { border-color: var(--primary); color: var(--primary); }
        .lab-drop.over { border-color: var(--primary); background: rgba(129,140,248,0.08); color: var(--primary); }
        .lab-drop.busy { cursor: default; border-style: solid; }
        .lab-drop-title { font-size: 14px; font-weight: 600; color: var(--foreground); }
        .lab-drop-hint { font-size: 12px; }
        .lab-spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--border); border-top-color: var(--primary); animation: lab-spin 0.8s linear infinite; }
        @keyframes lab-spin { to { transform: rotate(360deg); } }

        .lab-timeline { display: flex; align-items: center; gap: 10px; }
        .lab-tl-lbl { font-size: 13px; flex-shrink: 0; }
        .lab-tl-list { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
        .lab-tl-item {
          display: flex; align-items: center; gap: 8px; flex-shrink: 0;
          background: var(--bg-secondary); border: 1px solid var(--border);
          border-radius: 20px; padding: 5px 12px; font-size: 12px;
        }
        .lab-tl-date { font-weight: 700; color: var(--primary); }
        .lab-tl-name { color: var(--foreground); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .lab-tl-count { font-size: 11px; }

        .lab-ai { display: flex; flex-direction: column; gap: 10px; background: rgba(129,140,248,0.07); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
        .summary-head { display: flex; align-items: center; gap: 10px; }
        .summary-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: var(--primary-foreground); background: var(--primary); padding: 3px 8px; border-radius: 6px; }
        .lab-ai-text { font-size: 17.5px; line-height: 1.7; color: var(--foreground); white-space: pre-wrap; }

        .lab-chat { display: flex; flex-direction: column; gap: 10px; }
        .lab-chat-head { font-size: 13px; font-weight: 500; }
        .lab-chat-thread {
          display: flex; flex-direction: column; gap: 8px;
          max-height: 280px; overflow-y: auto; padding: 4px 2px;
        }
        .lab-chat-thread::-webkit-scrollbar { width: 7px; }
        .lab-chat-thread::-webkit-scrollbar-thumb { background: var(--bg-secondary); border-radius: 8px; }
        .lab-msg { display: flex; max-width: 85%; }
        .lab-msg.user { align-self: flex-end; }
        .lab-msg.assistant { align-self: flex-start; }
        .lab-msg-text {
          font-size: 16.5px; line-height: 1.65; padding: 12px 16px; border-radius: 14px; white-space: pre-wrap;
        }
        .lab-msg.user .lab-msg-text { background: var(--primary); color: var(--primary-foreground); border-bottom-right-radius: 4px; }
        .lab-msg.assistant .lab-msg-text { background: var(--bg-secondary); color: var(--foreground); border-bottom-left-radius: 4px; }
        .lab-typing { color: var(--muted-foreground); font-style: italic; }
        .lab-chat-bar { display: flex; gap: 8px; align-items: center; }
        .lab-chat-input {
          flex: 1; background: var(--bg-secondary); border: 1px solid var(--border);
          border-radius: 12px; padding: 12px 14px; font-family: inherit; font-size: 14px;
          color: var(--foreground); outline: none; transition: border-color 0.15s;
        }
        .lab-chat-input:focus { border-color: var(--primary); }
        .lab-chat-input::placeholder { color: var(--muted-foreground); }
        .lab-chat-send {
          flex-shrink: 0; width: 42px; height: 42px; border-radius: 12px; border: none;
          background: var(--primary); color: var(--primary-foreground);
          display: flex; align-items: center; justify-content: center; cursor: pointer; transition: opacity 0.15s;
        }
        .lab-chat-send:hover:not(:disabled) { opacity: 0.9; }
        .lab-chat-send:disabled { opacity: 0.4; cursor: default; }

        .lab-flags { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .lab-flags-lbl { font-size: 13px; }
        .lab-flag { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 20px; border: 1px solid; background: transparent; }

        .lab-panels { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; align-items: start; }
        .lab-panel { background: var(--bg-secondary); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
        .lab-panel-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: var(--foreground); }
        .lab-panel-icon { font-size: 16px; }
        .lab-panel-wait { font-size: 11px; font-weight: 400; margin-left: auto; }
        .lab-markers { display: flex; flex-direction: column; gap: 15px; }
        .lab-marker { display: flex; flex-direction: column; gap: 6px; }
        .lab-marker.pending { opacity: 0.5; }
        .lm-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .lm-name { font-size: 13px; color: var(--foreground); }
        .lm-value { font-size: 14px; font-weight: 700; }
        .lm-unit { font-size: 11px; font-weight: 400; }
        .lm-await { font-size: 11px; font-style: italic; }
        .lm-bar { position: relative; height: 8px; border-radius: 4px; background: var(--bg-primary); }
        .lm-band { position: absolute; top: 0; height: 100%; background: rgba(34,197,94,0.28); border-radius: 4px; }
        .lm-marker-dot { position: absolute; top: 50%; width: 12px; height: 12px; border-radius: 50%; transform: translate(-50%, -50%); border: 2px solid var(--card); }
        .lm-bottom { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .lm-range { font-size: 11px; }
        .lm-status { font-size: 11px; font-weight: 600; }
        .lm-trend { display: flex; align-items: center; gap: 8px; }
        .lm-spark { flex-shrink: 0; }
        .lm-trend-txt { font-size: 11px; }

        @media (max-width: 1100px) { .lab-panels { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  )
}
