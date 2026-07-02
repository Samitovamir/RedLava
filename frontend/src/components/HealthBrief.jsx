import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAiSummary } from '../hooks/useAiSummary.js'
import { useAgent } from '../hooks/useAgent.js'
import { useSiteSnapshot } from '../hooks/useSiteSnapshot.js'
import { useLang, useT } from '../context/LanguageContext.jsx'
import MicButton from './MicButton.jsx'
import AiAdvice from './AiAdvice.jsx'
import {
  INITIAL_REPORTS, buildHistory, markerStatus, STATUS_INFO, rangeText, barGeom, fmtDate, resolveMarker
} from '../utils/labs.js'

const STR = {
  ru: {
    badge: 'ИИ', title: 'Коротко о здоровье',
    recalc: 'Пересчитать', show: 'Показать', hide: 'Скрыть',
    loading: 'Смотрю анализы…', run: 'Разобрать здоровье',
    askLabel: 'Есть вопросы по здоровью — спросите:',
    you: 'Вы', ai: 'ИИ', thinking: 'думает…',
    placeholder: 'Например: что попить при низком витамине D?',
    answerFail: 'Не удалось ответить.', noServer: 'Нет связи с сервером.',
    noNorm: 'норма не указана', norm: 'норма', was: 'было', taken: 'сдан',
    status: { ok: 'норма', low: 'понижен', high: 'повышен', unknown: 'нет нормы' }
  },
  en: {
    badge: 'AI', title: 'Health at a glance',
    recalc: 'Recalculate', show: 'Show', hide: 'Hide',
    loading: 'Looking at your results…', run: 'Review my health',
    askLabel: 'Have questions about your health — ask:',
    you: 'You', ai: 'AI', thinking: 'thinking…',
    placeholder: 'For example: what to take for low vitamin D?',
    answerFail: 'Could not answer.', noServer: 'No connection to the server.',
    noNorm: 'no reference range', norm: 'range', was: 'was', taken: 'taken',
    status: { ok: 'normal', low: 'low', high: 'high', unknown: 'no range' }
  }
}

/*
  Большое окно на главной: ИИ коротко и без воды отмечает только важное по анализам
  и здоровью и даёт конкретные советы. Знает даты анализов (могут быть старыми) и
  советует, когда пересдать. Не паникёр. Под текстом — мини-карточки упомянутых
  показателей (шкала нормы, статус, тренд). Снизу — вопросы с полем ввода и диктовкой.
  Выжимка кэшируется по данным здоровья (не по календарю).
*/

function readReports() {
  try { const s = localStorage.getItem('albert-labs'); if (s) return JSON.parse(s) } catch { /* ignore */ }
  return INITIAL_REPORTS
}
function readWhoop() {
  try { const s = localStorage.getItem('albert-whoop-live'); if (s) return JSON.parse(s) } catch { /* ignore */ }
  return null
}
function readGarmin() {
  try { const s = localStorage.getItem('albert-garmin-live'); if (s) return JSON.parse(s) } catch { /* ignore */ }
  return null
}

// Сжатая сводка здоровья с ДАТАМИ (и ключ кэша): отклонения + Whoop + тренировки Garmin.
function buildHealthData(reports, whoop, garmin) {
  const hist = buildHistory(reports)
  const flagged = [], normal = []
  // Все показатели из файлов: норму берём из документа, справочник дополняет.
  Object.entries(hist).forEach(([name, h]) => {
    const last = h[h.length - 1]
    const def = resolveMarker(name, last)
    const st = markerStatus(last.value, def.min, def.max)
    const norm = (def.min == null && def.max == null) ? 'норма не указана' : `норма ${rangeText(def.min, def.max)}`
    const line = `${def.name} ${last.value} ${def.unit || ''} (${norm}, сдан ${fmtDate(last.date)})`
    if (st === 'low' || st === 'high') flagged.push(`${line} — ${STATUS_INFO[st].label}`)
    else normal.push(def.name)
  })
  const hasLabs = Object.keys(hist).length > 0
  const labs = !hasLabs
    ? 'Анализы крови пока не загружены.'
    : (flagged.length ? `Вне нормы: ${flagged.join('; ')}. ` : 'Все показатели крови в норме. ') +
      (normal.length ? `В норме: ${normal.join(', ')}.` : '')
  const w = whoop
    ? `Whoop сегодня: восстановление ${whoop.recovery}%, сон ${whoop.sleep?.hoursSlept} ч, HRV ${whoop.hrv} мс, пульс покоя ${whoop.rhr}.`
    : ''
  const bb = garmin?.bodyBattery, str = garmin?.stress
  const g = garmin
    ? `Тренировки (Garmin): за 7 дней ${garmin.weekKm ?? '?'} км, ${garmin.weekCount ?? '?'} тренировок, пульс покоя ${garmin.restingHr ?? '?'}, VO2max ${garmin.vo2Max ?? '?'}.` +
      (bb?.current != null ? ` Body Battery ${bb.current}/100 (остаток энергии на день, меняется в течение дня — не утренний балл).` : '') +
      (str && (str.current ?? str.avg) != null ? ` Стресс ${str.current ?? str.avg}/100.` : '')
    : ''
  return [labs, w, g].filter(Boolean).join(' ')
}

const CONTEXT =
  'Ты — внимательный помощник владельца по здоровью (он пожилой человек без мед. образования). ' +
  'По его анализам крови и данным Whoop дай ОЧЕНЬ короткую выжимку: 2–4 коротких предложения, только важное. ' +
  'Назови показатели вне нормы простыми словами и дай конкретный практичный совет: какой витамин или добавку обсудить с врачом, какой доп. анализ имеет смысл. ' +
  'УЧИТЫВАЙ ДАТЫ анализов: если данные старые, скажи об этом. Если показатель корректируется приёмом (витамин D, железо, B12) — посоветуй пересдать через 2–3 месяца. Если показатель стабильный и не критичный — не гони пересдавать, достаточно планово. ' +
  'НЕ БУДЬ ПАНИКЁРОМ. Если отклонение небольшое, показатель не критичный или мало меняется со временем — спокойно скажи, что это не повод для волнения. Тревожный тон уместен только когда действительно важно. ' +
  'ВАЖНО ПРО ТРЕНИРОВКИ: владелец — триатлет, тренируется интенсивно и очень дорожит спортом. ' +
  'Если показатель влияет на тренировки — дай совет по нагрузке и насколько настоятельно его соблюдать. ' +
  'Из-за мелких или некритичных отклонений менять режим НЕ надо, не паникуй и не отговаривай его от спорта по пустякам. ' +
  'Но если очевидно, что тренировки могут УХУДШИТЬ состояние (например, отклонения по сердцу, сильная анемия, явное воспаление) — прямо и чётко скажи снизить нагрузку или временно прекратить и обратиться к врачу. Калибруй настойчивость по реальной серьёзности. ' +
  'Без вступлений, без воды, без общих лекций, без эмодзи. Ключевые показатели и главный вывод выделяй **жирным** — умеренно, для читаемости (не выделяй всё подряд). Если всё в норме — скажи одним предложением и подбодри. ' +
  'ПРО ВОССТАНОВЛЕНИЕ: показатель Whoop «Восстановление» — это УТРЕННИЙ балл готовности (с ним он проснулся), он фиксирован на день и не убывает к вечеру. Не путай его с «остатком заряда»/Body Battery (энергией, которая тратится за день) — такого показателя в данных нет. ' +
  'Опирайся ТОЛЬКО на данные ниже, ничего не выдумывай. Ты не ставишь диагноз, а даёшь дружеский ориентир.'

// Какие показатели ИИ упомянул в тексте (по основе слова, чтобы ловить склонения)
function norm(s) { return s.toLowerCase().replace(/ё/g, 'е') }
function mentionedMarkers(text, markers) {
  if (!text) return []
  const t = norm(text)
  const hits = []
  markers.forEach(m => {
    const name = norm(m.name)
    const core = name.length > 5 ? name.slice(0, name.length - 2) : name
    if (t.includes(name) || t.includes(core)) hits.push(m)
  })
  return hits
}

function MiniSpark({ values, color }) {
  if (!values || values.length < 2) return null
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1
  const w = 54, h = 18, pad = 2
  const pts = values.map((v, i) =>
    `${(pad + (i / (values.length - 1)) * (w - 2 * pad)).toFixed(1)},${(pad + (1 - (v - min) / range) * (h - 2 * pad)).toFixed(1)}`
  ).join(' ')
  return <svg width={w} height={h} className="hb-spark"><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function MarkerMini({ marker, hist, t }) {
  const h = hist?.[marker._key]
  if (!h?.length) return null
  const last = h[h.length - 1]
  const prev = h.length > 1 ? h[h.length - 2] : null
  const st = markerStatus(last.value, marker.min, marker.max)
  const c = STATUS_INFO[st].color
  const g = barGeom(last.value, marker.min, marker.max)
  return (
    <div className="hb-marker">
      <div className="hb-mk-top">
        <span className="hb-mk-name">{marker.name}</span>
        <span className="hb-mk-value" style={{ color: c }}>{last.value} <span className="hb-mk-unit muted">{marker.unit}</span></span>
      </div>
      <div className="hb-mk-bar">
        {st !== 'unknown' && <div className="hb-mk-band" style={{ left: `${g.bandLeft}%`, width: `${g.bandRight - g.bandLeft}%` }} />}
        <div className="hb-mk-dot" style={{ left: `${st === 'unknown' ? 50 : g.valuePos}%`, background: c }} />
      </div>
      <div className="hb-mk-bottom">
        <span className="muted">{st === 'unknown' ? t.noNorm : `${t.norm} ${rangeText(marker.min, marker.max)}`} · {t.taken} {fmtDate(last.date)}</span>
        <span style={{ color: c }}>{t.status[st]}</span>
      </div>
      {prev && (
        <div className="hb-mk-trend">
          <MiniSpark values={h.map(x => x.value)} color="var(--muted-foreground)" />
          <span className="muted">{last.value > prev.value ? '↑' : last.value < prev.value ? '↓' : '→'} {t.was} {prev.value} · {fmtDate(prev.date)}</span>
        </div>
      )}
    </div>
  )
}

export default function HealthBrief() {
  const { lang } = useLang()
  const t = useT(STR)
  const reports = readReports()
  const whoop = readWhoop()
  const garmin = readGarmin()
  const hist = buildHistory(reports)
  const healthData = buildHealthData(reports, whoop, garmin)

  const { text, loading, refresh, run } = useAiSummary({
    id: 'health-brief',
    context: CONTEXT + (lang === 'en' ? ' Always reply to the user in English.' : ''),
    message: 'Дай короткую выжимку по моим анализам и здоровью: что важно и что делать.',
    fallback: lang === 'en'
      ? 'A short AI summary of your results will appear once an AI key is connected. The results and trends themselves are on the “Health” tab.'
      : 'Короткая ИИ-выжимка по анализам появится, когда подключён ключ ИИ. Сами анализы и динамика — на вкладке «Здоровье».',
    snapshot: healthData,
    manual: true          // не грузим автоматически — только по кнопке
  })

  // Все показатели, реально присутствующие в файлах (с нормой из документа/справочника)
  const allMarkers = Object.keys(hist).map(name => ({ ...resolveMarker(name, hist[name][hist[name].length - 1]), _key: name }))
  // показатели, упомянутые в выжимке (или, если ни один не назван, — те что вне нормы)
  let markers = mentionedMarkers(text, allMarkers)
  if (!markers.length) {
    allMarkers.forEach(m => {
      const h = hist[m._key]; if (!h) return
      if (['low', 'high'].includes(markerStatus(h[h.length - 1].value, m.min, m.max))) markers.push(m)
    })
  }
  // уникальные, максимум 4
  markers = markers.filter((m, i, arr) => arr.findIndex(x => x.name === m.name) === i).slice(0, 4)

  const [collapsed, setCollapsed] = useState(false)   // свернуть карточку целиком

  // Вопросы по здоровью
  const [chat, setChat] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)
  const { ask: askAgent } = useAgent()
  const fullSnapshot = useSiteSnapshot()
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat])

  async function ask() {
    const q = input.trim()
    if (!q || busy) return
    const prior = chat
    setInput(''); setChat(prev => [...prev, { role: 'user', text: q }]); setBusy(true)
    const context =
      'Ты — внимательный помощник владельца по здоровью, спокойный и без паники. владелец — триатлет, тренируется интенсивно. ' +
      'Отвечай кратко и по делу на русском, простыми словами. Не ставь диагноз; при необходимости советуй обратиться к врачу. ' +
      'Если вопрос касается тренировок — учитывай его данные и здоровье: по мелочам не отговаривай от спорта, но при реально опасных отклонениях (сердце, сильная анемия, воспаление) чётко советуй снизить нагрузку. ' +
      'Не нагнетай: мелкие или некритичные отклонения объясняй спокойно. Опирайся на данные ниже.' +
      (lang === 'en' ? ' Always reply to the user in English.' : '')
    // Единый агент: видит ВЕСЬ сайт, копит память, умеет инструменты. Контекст — фокус на здоровье.
    const { reply, error } = await askAgent({ message: q, snapshot: fullSnapshot, history: prior, context })
    setChat(prev => [...prev, { role: 'assistant', text: error ? t.noServer : (reply || t.answerFail) }])
    setBusy(false)
  }

  return (
    <motion.div className="card health-brief">
      <div className="hb-head">
        <div className="hb-title"><span className="hb-badge">{t.badge}</span><span>{t.title}</span></div>
        <div className="hb-head-actions">
          {text && !collapsed && (
            <button className="hb-refresh" onClick={refresh} disabled={loading} title={t.recalc}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
            </button>
          )}
          <button className="hb-refresh" onClick={() => setCollapsed(c => !c)} title={collapsed ? t.show : t.hide}>
            <svg className={`hb-chev ${collapsed ? '' : 'open'}`} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
      </div>

      {!collapsed && (<>
      {loading
        ? <div className="hb-loading">{t.loading}</div>
        : text
          ? <AiAdvice glow="mid" showLabel={false} className="hb-ai">{text}</AiAdvice>
          : <button className="hb-run" onClick={run}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              {t.run}
            </button>}

      {!loading && text && markers.length > 0 && (
        <div className="hb-markers">
          {markers.map(m => <MarkerMini key={m.name} marker={m} hist={hist} t={t} />)}
        </div>
      )}

      <div className="hb-ask">
        <div className="hb-ask-label">{t.askLabel}</div>
        {chat.length > 0 && (
          <div className="hb-chat">
            {chat.map((m, i) => (
              <div key={i} className={`hb-msg ${m.role}`}>
                <span className="hb-msg-role">{m.role === 'user' ? t.you : t.ai}</span>
                <span className="hb-msg-text">{m.text}</span>
              </div>
            ))}
            {busy && <div className="hb-msg assistant"><span className="hb-msg-role">{t.ai}</span><span className="hb-msg-text muted">{t.thinking}</span></div>}
            <div ref={endRef} />
          </div>
        )}
        <div className="hb-ask-row">
          <input
            className="hb-input"
            placeholder={t.placeholder}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') ask() }}
          />
          <MicButton primary onText={txt => setInput(prev => (prev ? prev.trim() + ' ' : '') + txt)} />
          <button className="hb-send" onClick={ask} disabled={busy || !input.trim()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
      </>)}

      <style>{`
        .health-brief { position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 14px; padding: 20px 22px; }
        .hb-head-actions { display: flex; align-items: center; gap: 8px; }
        .hb-chev { transition: transform 0.2s; }
        .hb-chev.open { transform: rotate(180deg); }
        .health-brief::before { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: var(--accent); }
        .hb-head { display: flex; align-items: center; justify-content: space-between; }
        .hb-title { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; color: var(--foreground); }
        .hb-badge { font-size: 11px; font-weight: 700; color: var(--accent-foreground); background: var(--accent); padding: 2px 8px; border-radius: 8px; }
        .hb-refresh { width: 32px; height: 32px; border-radius: 9px; background: var(--bg-secondary); border: 1px solid var(--border); color: var(--muted); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
        .hb-refresh:hover:not(:disabled) { color: var(--accent); border-color: var(--border-hover); }
        .hb-refresh:disabled { opacity: 0.5; cursor: default; }
        .hb-loading { font-size: 15px; color: var(--muted); }
        .hb-run {
          display: inline-flex; align-items: center; gap: 9px; align-self: flex-start;
          padding: 11px 18px; border-radius: 12px; border: 1px solid var(--accent);
          background: color-mix(in srgb, var(--accent) 10%, transparent); color: var(--accent);
          font-family: inherit; font-size: 14.5px; font-weight: 600; cursor: pointer; transition: background 0.15s;
        }
        .hb-run:hover { background: color-mix(in srgb, var(--accent) 18%, transparent); }
        .hb-text { font-size: 17px; line-height: 1.6; color: var(--foreground); white-space: pre-wrap; }
        .hb-ai .ai-advice-body { font-size: 16px; line-height: 1.6; color: var(--foreground); }

        .hb-markers { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; padding-top: 4px; }
        .hb-marker { display: flex; flex-direction: column; gap: 6px; background: var(--bg-secondary); border-radius: 12px; padding: 12px 14px; }
        .hb-mk-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .hb-mk-name { font-size: 13.5px; font-weight: 600; color: var(--foreground); }
        .hb-mk-value { font-size: 16px; font-weight: 700; }
        .hb-mk-unit { font-size: 11px; font-weight: 500; }
        .hb-mk-bar { position: relative; height: 7px; background: var(--bg-primary); border-radius: 4px; }
        .hb-mk-band { position: absolute; top: 0; height: 100%; background: color-mix(in srgb, var(--green) 30%, transparent); border-radius: 4px; }
        .hb-mk-dot { position: absolute; top: 50%; width: 11px; height: 11px; border-radius: 50%; transform: translate(-50%, -50%); border: 2px solid var(--bg-secondary); }
        .hb-mk-bottom { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; }
        .hb-mk-trend { display: flex; align-items: center; gap: 8px; font-size: 11px; }

        .hb-ask { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--border); padding-top: 14px; }
        .hb-ask-label { font-size: 13px; color: var(--muted); }
        .hb-chat { display: flex; flex-direction: column; gap: 10px; max-height: 260px; overflow-y: auto; }
        .hb-msg { display: flex; gap: 10px; align-items: flex-start; }
        .hb-msg-role { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; min-width: 26px; color: var(--muted); padding-top: 3px; }
        .hb-msg.assistant .hb-msg-role { color: var(--accent); }
        .hb-msg-text { font-size: 16px; line-height: 1.55; color: var(--foreground); white-space: pre-wrap; }
        .hb-ask-row { display: flex; align-items: center; gap: 10px; }
        .hb-input { flex: 1; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; padding: 11px 14px; font-family: inherit; font-size: 15px; color: var(--foreground); outline: none; transition: border-color 0.15s; }
        .hb-input:focus { border-color: var(--accent); }
        .hb-input::placeholder { color: var(--muted); }
        .hb-send { width: 38px; height: 38px; flex-shrink: 0; border-radius: 11px; background: var(--accent); color: var(--accent-foreground); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: opacity 0.15s; }
        .hb-send:hover:not(:disabled) { opacity: 0.9; }
        .hb-send:disabled { opacity: 0.4; cursor: default; }

        @media (max-width: 620px) { .hb-markers { grid-template-columns: 1fr; } }
      `}</style>
    </motion.div>
  )
}
