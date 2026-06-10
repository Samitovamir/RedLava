import { useState, useRef, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  INITIAL_REPORTS, buildHistory, markerStatus, STATUS_INFO,
  rangeText, barGeom, fmtDate, LABS_STORE_KEY, LABS_STORE_VERSION, buildGroups
} from '../utils/labs.js'
import { isGuest } from '../api/authFetch.js'
import { useLang, useT } from '../context/LanguageContext.jsx'
import Icon from '../ui/Icon.jsx'
import { categoryColor } from '../utils/categoryColor.js'

const STORE_KEY = LABS_STORE_KEY

const STR = {
  ru: {
    aiBadge: 'ИИ',
    title: 'Анализы крови и расшифровка',
    sub: 'Загружайте анализы по мере сдачи — копится история показателей, ИИ расшифровывает простыми словами',
    decodeAll: 'Расшифровать всё',
    decodeHead: 'Расшифровка', decodePrep: 'Готовлю расшифровку…',
    decodeFail: 'Не удалось получить расшифровку.',
    decodeNoServer: 'Нет связи с сервером. Запустите backend с ключом ИИ для расшифровки. Диаграммы и динамика ниже работают и без него.',
    syncing: (done, total) => `Распознаём анализы из Яндекс.Диска: ${done} из ${total}…`,
    recognizing: (name) => `Распознаём «${name}»…`,
    recognizingHint: 'Извлекаем показатели и добавляем в историю',
    dropTitle: 'Перетащите файл или нажмите',
    dropHint: 'PDF, фото · можно по одному, в разные дни',
    files: (n) => `Загруженные файлы (${n})`,
    markersCount: 'показ.',
    outOfNorm: 'Вне нормы:',
    minorHide: 'Скрыть второстепенные', minor: 'Второстепенные', minorShow: 'Показать показатели',
    minorFlags: (n) => ` · ${n} вне нормы`,
    noNorm: 'норма не указана', norm: 'норма', was: 'было', taken: 'сдан', noNormShort: '—',
    status: { ok: 'норма', low: 'понижен', high: 'повышен', unknown: 'нет нормы' },
    fileFail: 'Не удалось загрузить файл. Попробуйте ещё раз или другой файл.',
    parseFail: 'Не удалось распознать показатели в этом файле. Проверьте, что это анализ крови.',
    groups: {}   // ru: показываем названия групп как есть
  },
  en: {
    aiBadge: 'AI',
    title: 'Blood tests and AI decoding',
    sub: 'Upload your tests as you take them — the history builds up and the AI explains them in plain words',
    decodeAll: 'Decode all',
    decodeHead: 'Decoding', decodePrep: 'Preparing the decoding…',
    decodeFail: 'Could not get the decoding.',
    decodeNoServer: 'No connection to the server. Start the backend with an AI key for decoding. The charts and trends below work without it.',
    syncing: (done, total) => `Reading tests from Yandex.Disk: ${done} of ${total}…`,
    recognizing: (name) => `Reading “${name}”…`,
    recognizingHint: 'Extracting markers and adding them to the history',
    dropTitle: 'Drag a file here or click',
    dropHint: 'PDF, photo · one at a time, on different days',
    files: (n) => `Uploaded files (${n})`,
    markersCount: 'markers',
    outOfNorm: 'Out of range:',
    minorHide: 'Hide secondary', minor: 'Secondary', minorShow: 'Show markers',
    minorFlags: (n) => ` · ${n} out of range`,
    noNorm: 'no reference range', norm: 'range', was: 'was', taken: 'taken', noNormShort: '—',
    status: { ok: 'normal', low: 'low', high: 'high', unknown: 'no range' },
    fileFail: 'Could not upload the file. Try again or use a different file.',
    parseFail: 'Could not recognize any markers in this file. Make sure it is a blood test.',
    // Названия групп показателей по их стабильному key (см. buildGroups в labs.js)
    groups: {
      blood: 'Complete blood count', lipids: 'Lipids & heart', metabolic: 'Sugar & metabolism',
      liver: 'Liver', kidney: 'Kidneys', iron: 'Iron metabolism', vitamins: 'Vitamins',
      electrolytes: 'Electrolytes & minerals', thyroid: 'Thyroid', hormones: 'Hormones',
      inflammation: 'Inflammation & immunity', coagulation: 'Coagulation',
      infections: 'Infections & antibodies', other: 'Other markers'
    }
  }
}

// Демо-расшифровка для гостя (английская версия — выбирается по языку интерфейса)
const GUEST_DEMO_DECODE_EN =
  'Overall the picture is calm: the complete blood count, liver enzymes (ALT, AST), ' +
  'kidneys (creatinine), blood sugar and thyroid hormones are all within range. ' +
  'Total cholesterol and “bad” cholesterol (LDL) are slightly above normal, and ' +
  'vitamin D is low — a common story, especially at the end of winter. The ' +
  'inflammation marker CRP was slightly elevated in April, but in the latest retest ' +
  'it is already back to normal — a good sign. Lifestyle-wise, more vegetables and fish, ' +
  'less fatty and sugary food, regular activity and taking vitamin D will help. ' +
  'This is not a diagnosis: if the deviations persist, it is better to show the tests to a doctor.'

// Английские названия демо-файлов гостя (имена показателей-ключей не трогаем)
const GUEST_DEMO_FILE_EN = {
  'ОАК и биохимия.pdf': 'CBC and biochemistry.pdf',
  'Гормоны и витамины.pdf': 'Hormones and vitamins.pdf',
  'Липидограмма (пересдача).pdf': 'Lipid panel (retest).pdf'
}

// Демо-данные для гостя: реальные результаты заблокированы на сервере, поэтому
// показываем правдоподобный пример (несколько отчётов в разные даты + готовую
// расшифровку), чтобы функциональность была видна. Имена показателей — строго
// из справочника labs.js, чтобы нормы и статусы считались правильно. Часть значений
// намеренно вне нормы (Холестерин/ЛПНП/СРБ), остальные — в пределах нормы.
const GUEST_DEMO_REPORTS = [
  {
    id: 'demo-2026-04-12', date: '2026-04-12', fileName: 'ОАК и биохимия.pdf',
    values: {
      'Гемоглобин': 152,
      'Эритроциты': 5.0,
      'Лейкоциты': 6.1,
      'Тромбоциты': 248,
      'Глюкоза': 5.2,
      'Холестерин общий': 5.8,        // повышен (норма до 5.2)
      'ЛПНП («плохой»)': 3.6,         // повышен (норма до 3.0)
      'ЛПВП («хороший»)': 1.2,
      'Креатинин': 92,
      'АЛТ': 28,
      'АСТ': 25
    }
  },
  {
    id: 'demo-2026-05-08', date: '2026-05-08', fileName: 'Гормоны и витамины.pdf',
    values: {
      'ТТГ': 2.1,
      'Тестостерон': 18.4,
      'Витамин D': 24,               // понижен (норма от 30)
      'Витамин B12': 410,
      'СРБ': 7.2                      // повышен (норма до 5.0)
    }
  },
  {
    id: 'demo-2026-05-29', date: '2026-05-29', fileName: 'Липидограмма (пересдача).pdf',
    values: {
      'Холестерин общий': 5.5,        // всё ещё повышен, но динамика вниз
      'ЛПНП («плохой»)': 3.3,
      'ЛПВП («хороший»)': 1.3,
      'Триглицериды': 1.5,
      'Глюкоза': 5.0,
      'СРБ': 4.1                      // вернулся в норму
    }
  }
]

const GUEST_DEMO_DECODE =
  'В целом картина спокойная: общий анализ крови, печёночные пробы (АЛТ, АСТ), ' +
  'почки (креатинин), сахар и гормоны щитовидной железы — в пределах нормы. ' +
  'Немного выше нормы общий холестерин и «плохой» холестерин (ЛПНП), а ещё ' +
  'снижен витамин D — это частая история, особенно к концу зимы. Маркер ' +
  'воспаления СРБ в апреле был слегка повышен, но в последней пересдаче уже ' +
  'пришёл в норму — хороший знак. По образу жизни помогут больше овощей и рыбы, ' +
  'меньше жирного и сладкого, регулярная активность и приём витамина D. ' +
  'Это не диагноз: при сохраняющихся отклонениях лучше показать анализы врачу.'

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
  const { lang } = useLang()
  const t = useT(STR)
  const [reports, setReports] = useState(() => {
    try {
      // Старые демо-данные уже вычищены централизованно при импорте labs.js (по версии).
      const saved = localStorage.getItem(STORE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length) return parsed
      }
      // Гость: реальные анализы заблокированы на сервере — показываем демо-пример,
      // чтобы функциональность (история, нормы, отклонения, расшифровка) была видна.
      if (isGuest()) {
        localStorage.setItem(STORE_KEY, JSON.stringify(GUEST_DEMO_REPORTS))
        localStorage.setItem('albert-labs-ver', LABS_STORE_VERSION)
        return GUEST_DEMO_REPORTS
      }
    } catch { /* ignore */ }
    return INITIAL_REPORTS
  })
  const [dragOver, setDragOver] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)   // идёт распознавание загруженного файла
  const [busyName, setBusyName] = useState(null)
  const fileInput = useRef(null)
  // Полная расшифровка от ИИ (гостю — готовый демо-текст)
  const [aiText, setAiText] = useState(() => (isGuest() ? (lang === 'en' ? GUEST_DEMO_DECODE_EN : GUEST_DEMO_DECODE) : ''))
  const [decoding, setDecoding] = useState(false)

  // Гость + смена языка интерфейса → переключаем язык демо-расшифровки
  useEffect(() => {
    if (!isGuest()) return
    setAiText(prev => (prev === GUEST_DEMO_DECODE || prev === GUEST_DEMO_DECODE_EN || !prev)
      ? (lang === 'en' ? GUEST_DEMO_DECODE_EN : GUEST_DEMO_DECODE)
      : prev)
  }, [lang])

  // Распознавание анализов из Яндекс.Диска (если подключён)
  const [syncing, setSyncing] = useState(false)
  const [syncTotal, setSyncTotal] = useState(0)
  const [syncDone, setSyncDone] = useState(0)
  const [filesOpen, setFilesOpen] = useState(false)   // список загруженных файлов по умолчанию скрыт

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
      // Сохраняем значения как есть ({v, unit, min, max}) — чтобы знать единицы и нормы
      // даже для показателей вне нашего справочника.
      const flat = rep.reports.map(r => ({
        id: r.date, date: r.date, fileName: r.fileName || 'Яндекс.Диск', values: r.values
      }))
      setReports(flat)
      setSyncing(false)
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  const history = useMemo(() => buildHistory(reports), [reports])

  // Все показатели, разложенные по системам организма (важные + второстепенные)
  const groups = useMemo(() => buildGroups(history), [history])
  // Какие группы «второстепенных» развёрнуты пользователем
  const [openMinor, setOpenMinor] = useState({})

  // Сводка сверху — ТОЛЬКО важные показатели вне нормы (второстепенные/профильные
  // живут в своих свёрнутых группах, иначе лента превращается в стену из чипов)
  const flagged = groups.flatMap(g => g.major)
    .filter(it => ['low', 'high'].includes(markerStatus(it.last.value, it.def.min, it.def.max)))

  // Полная карточка показателя (для важных и для одиночных групп)
  function renderMarker({ key, def, h, last }) {
    const prev = h.length >= 2 ? h[h.length - 2] : null
    const st = markerStatus(last.value, def.min, def.max)
    const c = STATUS_INFO[st].color
    const g = barGeom(last.value, def.min, def.max)
    return (
      <div key={key} className="lab-marker">
        <div className="lm-top">
          <span className="lm-name">{def.name}</span>
          <span className="lm-value" style={{ color: c }}>{last.value} <span className="lm-unit muted">{def.unit}</span></span>
        </div>
        <div className="lm-bar">
          {st !== 'unknown' && <div className="lm-band" style={{ left: `${g.bandLeft}%`, width: `${g.bandRight - g.bandLeft}%` }} />}
          <div className="lm-marker-dot" style={{ left: `${st === 'unknown' ? 50 : g.valuePos}%`, background: c }} />
        </div>
        <div className="lm-bottom">
          <span className="lm-range muted">{st === 'unknown' ? t.noNorm : `${t.norm} ${rangeText(def.min, def.max)}`}</span>
          <span className="lm-status" style={{ color: c }}>{t.status[st]}</span>
        </div>
        {prev && (
          <div className="lm-trend">
            <MiniSpark points={h} color="var(--muted-foreground)" />
            <span className="lm-trend-txt muted">
              {last.value > prev.value ? '↑' : last.value < prev.value ? '↓' : '→'} {t.was} {prev.value} · {fmtDate(prev.date)}
            </span>
          </div>
        )}
      </div>
    )
  }

  // Компактная строка второстепенного показателя
  function renderMinorRow({ key, def, last }) {
    const st = markerStatus(last.value, def.min, def.max)
    const c = STATUS_INFO[st].color
    return (
      <div key={key} className="lab-mini">
        <span className="lab-mini-name">{def.name}</span>
        <span className="lab-mini-val" style={{ color: c }}>{last.value}<span className="muted"> {def.unit}</span></span>
        <span className="lab-mini-norm muted">{st === 'unknown' ? t.noNormShort : rangeText(def.min, def.max)}</span>
        <span className="lab-mini-dot" style={{ background: c }} title={t.status[st]} />
      </div>
    )
  }

  const reportsByDate = [...reports].sort((a, b) => b.date.localeCompare(a.date))

  // Текстовая выжимка показателей (последние значения) для контекста ИИ
  function labSummaryText(snapshotReports) {
    const hist = buildHistory(snapshotReports)
    return buildGroups(hist).map(g => {
      const lines = [...g.major, ...g.minor].map(({ def, last }) => {
        const st = markerStatus(last.value, def.min, def.max)
        const norm = (def.min == null && def.max == null) ? 'норма не указана' : `норма ${rangeText(def.min, def.max)}`
        const flag = (st === 'low' || st === 'high') ? ` — ${STATUS_INFO[st].label}` : ''
        return `${def.name} ${last.value} ${def.unit || ''} (${norm})${flag}`
      })
      return lines.length ? `${g.name}: ${lines.join(', ')}` : null
    }).filter(Boolean).join('. ')
  }

  function doctorContext(snapshotReports) {
    return (
      `Ты — внимательный врач-терапевт, который объясняет анализы крови владельцу, пожилому человеку без медицинского образования. ` +
      `Вот его последние результаты: ${labSummaryText(snapshotReports)}. ` +
      `Отвечай простыми словами, спокойно и поддерживающе. Опирайся на эти цифры и их динамику. ` +
      `Не ставь диагноз и не назначай лекарства — при отклонениях мягко советуй обратиться к врачу.` +
      (lang === 'en' ? ' Always reply to the user in English.' : '')
    )
  }

  async function runAi(snapshotReports) {
    setDecoding(true)
    setAiText('')
    const context = doctorContext(snapshotReports) +
      ` Сейчас сделай общую расшифровку: что в норме, на что обратить внимание (отклонения и динамика), общие рекомендации по образу жизни.`
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // Полная расшифровка — длинный многораздельный текст, поэтому просим больший
        // лимит вывода, чтобы ответ не обрывался на полуслове.
        body: JSON.stringify({ message: 'Расшифруй мои анализы крови с учётом динамики', context, maxTokens: 4096 })
      })
      const data = await res.json()
      setAiText(data.reply || t.decodeFail)
    } catch {
      setAiText(t.decodeNoServer)
    } finally {
      setDecoding(false)
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
  const [notice, setNotice] = useState('')

  async function ingest(file) {
    setBusyName(file.name)
    setAnalyzing(true)
    setNotice('')
    try {
      const data = await fileToBase64(file)
      const res = await fetch('/api/labs/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, mime: file.type, data })
      })
      const out = await res.json()
      if (!out.ok || !out.report) {
        setNotice(out.message || t.parseFail)
        return
      }
      const r = out.report
      const flat = { id: r.id, date: r.date, fileName: r.fileName || file.name, values: r.values }
      // Заменяем отчёт той же даты, если он уже есть, иначе добавляем
      const next = [...reports.filter(x => x.date !== flat.date), flat]
      setReports(next)
      runAi(next)   // сразу даём полную расшифровку с учётом нового файла
    } catch {
      setNotice(t.fileFail)
    } finally {
      setAnalyzing(false)
    }
  }

  function onDrop(e) {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files?.[0]; if (f) ingest(f)
  }
  function onPick(e) {
    const f = e.target.files?.[0]; if (f) ingest(f)
  }
  function analyzeExisting() { runAi(reports) }

  return (
    <div className="card lab-block">
      <div className="lab-head">
        <div>
          <div className="lab-title">{t.title}</div>
          <div className="lab-sub muted">{t.sub}</div>
        </div>
        <button className="lab-ai-btn" onClick={analyzeExisting} disabled={decoding || reports.length === 0}>
          {t.decodeAll}
        </button>
      </div>

      {syncing && (
        <div className="lab-sync">
          <div className="lab-sync-row">
            <div className="lab-spinner" />
            <span>{t.syncing(syncDone, syncTotal)}</span>
          </div>
          <div className="lab-sync-bar"><div className="lab-sync-fill" style={{ width: `${syncTotal ? (syncDone / syncTotal) * 100 : 0}%` }} /></div>
        </div>
      )}

      {/* Зона загрузки */}
      <div
        className={`lab-drop ${dragOver ? 'over' : ''} ${analyzing ? 'busy' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !analyzing && fileInput.current?.click()}
      >
        <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" hidden onChange={onPick} />
        {analyzing ? (
          <>
            <div className="lab-spinner" />
            <span className="lab-drop-title">{t.recognizing(busyName)}</span>
            <span className="lab-drop-hint muted">{t.recognizingHint}</span>
          </>
        ) : (
          <>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span className="lab-drop-title">{t.dropTitle}</span>
            <span className="lab-drop-hint muted">{t.dropHint}</span>
          </>
        )}
      </div>

      {/* Журнал загруженных отчётов — по умолчанию скрыт, открывается по кнопке */}
      {reportsByDate.length > 0 && (
        <div className="lab-timeline">
          <button className="lab-tl-toggle" onClick={() => setFilesOpen(o => !o)} aria-expanded={filesOpen}>
            <span className={`lab-tl-chev ${filesOpen ? 'open' : ''}`}>▸</span>
            {t.files(reportsByDate.length)}
          </button>
          <AnimatePresence initial={false}>
            {filesOpen && (
              <motion.div className="lab-tl-list"
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}>
                {reportsByDate.map(r => {
                  const fname = (lang === 'en' && GUEST_DEMO_FILE_EN[r.fileName]) || r.fileName
                  return (
                  <div key={r.id} className="lab-tl-item" title={fname}>
                    <span className="lab-tl-date">{fmtDate(r.date)}</span>
                    <span className="lab-tl-name">{fname}</span>
                    <span className="lab-tl-count muted">{Object.keys(r.values).length} {t.markersCount}</span>
                  </div>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {notice && <div className="lab-notice">{notice}</div>}

      {/* Полная расшифровка от ИИ (по кнопке / после загрузки) */}
      <AnimatePresence>
        {(decoding || aiText) && (
          <motion.div className="lab-ai"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="lab-ai-head">
              <span className="lab-ai-badge">{t.aiBadge}</span>
              <div className="card-title" style={{ margin: 0 }}>{t.decodeHead}</div>
            </div>
            <p className="lab-ai-text">{aiText || t.decodePrep}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Сводка отклонений */}
      {flagged.length > 0 && (
        <div className="lab-flags">
          <span className="lab-flags-lbl muted">{t.outOfNorm}</span>
          {flagged.map(({ def, last }) => {
            const st = markerStatus(last.value, def.min, def.max)
            return (
              <span key={def.name} className="lab-flag" style={{ color: STATUS_INFO[st].color, borderColor: STATUS_INFO[st].color }}>
                {def.name} {st === 'high' ? '↑' : '↓'}
              </span>
            )
          })}
        </div>
      )}

      {/* Панели по системам организма: важные показатели на виду, второстепенные сворачиваются */}
      <div className="lab-panels">
        {groups.map(group => {
          const hasMajor = group.major.length > 0
          const open = openMinor[group.key]
          const minorFlags = group.minor.filter(i => ['low', 'high'].includes(markerStatus(i.last.value, i.def.min, i.def.max))).length
          return (
            <div key={group.key} className="lab-panel">
              <div className="lab-panel-title">
                <span className="lab-panel-icon"><Icon name={`lab-${group.key}`} size={16} color={categoryColor(`lab-${group.key}`)} /></span>{t.groups?.[group.key] || group.name}
                <span className="lab-panel-wait muted">{group.major.length + group.minor.length}</span>
              </div>

              {hasMajor && <div className="lab-markers">{group.major.map(renderMarker)}</div>}

              {group.minor.length > 0 && (!hasMajor && group.minor.length <= 6 ? (
                // Небольшая группа без важных — показываем компактные строки сразу
                <div className="lab-minor-list">{group.minor.map(renderMinorRow)}</div>
              ) : (
                // Иначе — прячем под кнопку (важно для огромных профилей: микробиом и т.п.)
                <div className="lab-minor">
                  <button className="lab-minor-toggle" onClick={() => setOpenMinor(s => ({ ...s, [group.key]: !s[group.key] }))}>
                    <span>{open ? t.minorHide : (hasMajor ? t.minor : t.minorShow)} ({group.minor.length}){!open && minorFlags > 0 ? t.minorFlags(minorFlags) : ''}</span>
                    <span className={`lab-minor-caret ${open ? 'open' : ''}`}>▾</span>
                  </button>
                  {open && <div className="lab-minor-list">{group.minor.map(renderMinorRow)}</div>}
                </div>
              ))}
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
        .lab-notice { font-size: 13.5px; color: var(--yellow); background: color-mix(in srgb, var(--yellow) 12%, transparent); border-radius: 10px; padding: 10px 14px; }
        .lab-ai-btn {
          flex-shrink: 0; padding: 8px 14px; border-radius: 10px;
          border: 1px solid var(--accent); background: transparent; color: var(--accent);
          font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s;
        }
        .lab-ai-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 12%, transparent); }
        .lab-ai-btn:disabled { opacity: 0.4; cursor: default; }
        .lab-ai { display: flex; flex-direction: column; gap: 10px; background: color-mix(in srgb, var(--accent) 7%, transparent); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
        .lab-ai-head { display: flex; align-items: center; gap: 10px; }
        .lab-ai-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: var(--accent-foreground); background: var(--accent); padding: 3px 8px; border-radius: 6px; }
        .lab-ai-text { font-size: 17px; line-height: 1.7; color: var(--foreground); white-space: pre-wrap; }

        .lab-drop {
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px;
          padding: 26px 20px; border-radius: 14px;
          border: 2px dashed var(--border); background: var(--bg-secondary);
          color: var(--muted-foreground); cursor: pointer; text-align: center; transition: all 0.18s;
        }
        .lab-drop:hover { border-color: var(--primary); color: var(--primary); }
        .lab-drop.over { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); color: var(--accent); }
        .lab-drop.busy { cursor: default; border-style: solid; }
        .lab-drop-title { font-size: 14px; font-weight: 600; color: var(--foreground); }
        .lab-drop-hint { font-size: 12px; }
        .lab-spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--border); border-top-color: var(--primary); animation: lab-spin 0.8s linear infinite; }
        @keyframes lab-spin { to { transform: rotate(360deg); } }

        .lab-timeline { display: flex; flex-direction: column; gap: 10px; }
        .lab-tl-toggle { align-self: flex-start; display: flex; align-items: center; gap: 7px; background: transparent; border: none; padding: 0; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 600; color: var(--muted-foreground); transition: color .15s; }
        .lab-tl-toggle:hover { color: var(--foreground); }
        .lab-tl-chev { display: inline-block; transition: transform .2s; font-size: 11px; }
        .lab-tl-chev.open { transform: rotate(90deg); }
        .lab-tl-list { display: flex; flex-wrap: wrap; gap: 8px; overflow: hidden; }
        .lab-tl-item {
          display: flex; align-items: center; gap: 8px; flex-shrink: 0;
          background: var(--bg-secondary); border: 1px solid var(--border);
          border-radius: 20px; padding: 5px 12px; font-size: 12px;
        }
        .lab-tl-date { font-weight: 700; color: var(--primary); }
        .lab-tl-name { color: var(--foreground); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .lab-tl-count { font-size: 11px; }

        .lab-flags { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .lab-flags-lbl { font-size: 13px; }
        .lab-flag { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 20px; border: 1px solid; background: transparent; }

        .lab-panels { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; align-items: start; }

        .lab-minor { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 8px; }
        .lab-minor-toggle { width: 100%; display: flex; align-items: center; gap: 8px; background: none; border: none; color: var(--muted); font-family: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer; padding: 4px 0; text-align: left; }
        .lab-minor-toggle:hover { color: var(--foreground); }
        .lab-minor-caret { margin-left: auto; transition: transform 0.15s; }
        .lab-minor-caret.open { transform: rotate(180deg); }
        .lab-minor-list { display: flex; flex-direction: column; margin-top: 6px; }
        .lab-mini { display: grid; grid-template-columns: 1fr auto auto 10px; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--bg-primary); font-size: 12.5px; }
        .lab-mini:last-child { border-bottom: none; }
        .lab-mini-name { color: var(--foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .lab-mini-val { font-weight: 700; white-space: nowrap; }
        .lab-mini-norm { font-size: 11px; white-space: nowrap; }
        .lab-mini-dot { width: 9px; height: 9px; border-radius: 50%; }
        .lab-panel { background: var(--bg-secondary); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
        .lab-panel-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: var(--foreground); }
        .lab-panel-icon { display: inline-flex; align-items: center; }
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
        .lm-band { position: absolute; top: 0; height: 100%; background: color-mix(in srgb, var(--status-ok, var(--green)) 28%, transparent); border-radius: 4px; }
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
