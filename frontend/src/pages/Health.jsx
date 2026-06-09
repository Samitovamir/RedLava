import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CircularChart from '../components/CircularChart.jsx'
import WhoopRings from '../components/WhoopRings.jsx'
import SleepHypnogram from '../components/SleepHypnogram.jsx'
import LabResults from '../components/LabResults.jsx'
import ConnectPrompt from '../components/ConnectPrompt.jsx'
import AiRefreshButton from '../components/AiRefreshButton.jsx'
import MicButton from '../components/MicButton.jsx'
import { useAiSummary } from '../hooks/useAiSummary.js'
import { useSiteSnapshot } from '../hooks/useSiteSnapshot.js'
import { useLang, useT } from '../context/LanguageContext.jsx'
import {
  WHOOP, WHOOP_DAYS, SLEEP_STAGES, recoveryColor, fmtHm
} from '../utils/whoop.js'

const STR = {
  ru: {
    heading: 'Здоровье',
    // кольца / стадии сна
    stages: { awake: 'Бодрствование', light: 'Лёгкий сон', rem: 'REM (быстрый)', deep: 'Глубокий сон' },
    recHigh: 'Высокое', recMid: 'Среднее', recLow: 'Низкое',
    // совет по восстановлению (верх карточки)
    recTextHigh: 'Тело хорошо восстановилось — можно давать высокую нагрузку.',
    recTextMid: 'Среднее восстановление — умеренная нагрузка, следи за самочувствием.',
    recTextLow: 'Низкое восстановление — день отдыха или лёгкая активность.',
    // мини-метрики под кольцами
    hrvShort: 'HRV, мс', rhrShort: 'пульс покоя', respShort: 'дыхание',
    // консультант
    aiBadge: 'ИИ', consultant: 'Консультант',
    analyzing: 'ИИ анализирует показатели…', thinking: 'думает…',
    s1: 'Можно ли тренироваться сегодня?', s2: 'Как улучшить сон?', s3: 'Почему низкое HRV?',
    chatPlaceholder: 'Скажите или спросите про здоровье…',
    replyError: 'Ошибка ответа', noServer: 'Нет связи с сервером. Запустите backend.',
    // сон
    sleep: 'Сон', sleepHoursOf: (need) => `из ${need} нужных`, sleepQuality: 'Качество сна',
    collapse: 'Свернуть', sleepMore: 'Подробнее — сон по часам',
    // тренд
    weekRecovery: 'Восстановление за неделю',
    daySumHigh: 'Организм хорошо восстановился. Хороший день для интенсивной тренировки.',
    daySumMid: 'Среднее восстановление. Лучше умеренная нагрузка, без рекордов.',
    daySumLow: 'Низкое восстановление. День для отдыха или лёгкой активности, дайте телу прийти в себя.',
    dayFull: { 'Пн': 'Понедельник', 'Вт': 'Вторник', 'Ср': 'Среда', 'Чт': 'Четверг', 'Пт': 'Пятница', 'Сб': 'Суббота', 'Вс': 'Воскресенье' },
    dayShort: { 'Пн': 'Пн', 'Вт': 'Вт', 'Ср': 'Ср', 'Чт': 'Чт', 'Пт': 'Пт', 'Сб': 'Сб', 'Вс': 'Вс' },
    // карточки показателей
    metrics: {
      hrv: { lbl: 'HRV', desc: 'вариабельность сердечного ритма, главный показатель восстановления и стресса' },
      rhr: { lbl: 'Пульс покоя', sub: 'уд/мин', desc: 'частота пульса в полном покое, ниже — тренированнее сердце' },
      resp: { lbl: 'Дыхание во сне', sub: 'вдох/мин', desc: 'частота дыхания во сне, стабильность — признак здоровья' },
      spo2: { lbl: 'SpO₂', sub: 'кислород в крови', desc: 'насыщение крови кислородом во сне' },
      skin: { lbl: 'Температура кожи', desc: 'температура кожи во сне, отклонение может намекать на болезнь' },
      eff: { lbl: 'Эффективность сна', sub: 'времени в постели спал', desc: 'доля времени в постели, проведённая во сне' }
    },
    skinSub: (d) => `${d > 0 ? '+' : ''}${d}° от нормы`,
    help: 'Что это значит?',
    // модалка пояснения
    explainLoading: 'ИИ разбирается в показателе…', explainOk: 'Понятно',
    explainFail: 'Не удалось получить пояснение.',
    explainNoServer: 'Нет связи с сервером. Запустите backend, чтобы получить пояснение от ИИ.',
    // connect prompt
    cpSub: 'Whoop', cpTitle: 'Whoop не подключён',
    cpText: 'Подключите Whoop, чтобы видеть восстановление, сон, HRV и пульс. Анализы крови доступны ниже.',
    // фолбэк консультанта
    fbHigh: (rec, hrs, perf) => `Восстановление ${rec}% — отличное. Сон ${hrs} ч (${perf}% нормы). Хороший день для интенсивной тренировки.`,
    fbLow: (rec, hrs, need) => `Восстановление ${rec}%. Сон ${hrs} ч из ${need}. Рекомендую снизить нагрузку и лечь раньше.`
  },
  en: {
    heading: 'Health',
    stages: { awake: 'Awake', light: 'Light', rem: 'REM', deep: 'Deep' },
    recHigh: 'High', recMid: 'Medium', recLow: 'Low',
    recTextHigh: 'Your body has recovered well — you can take on a heavy load today.',
    recTextMid: 'Medium recovery — keep the load moderate and watch how you feel.',
    recTextLow: 'Low recovery — make it a rest day or light activity.',
    hrvShort: 'HRV, ms', rhrShort: 'resting HR', respShort: 'respiration',
    aiBadge: 'AI', consultant: 'Consultant',
    analyzing: 'AI is analyzing your metrics…', thinking: 'thinking…',
    s1: 'Can I train today?', s2: 'How can I improve my sleep?', s3: 'Why is my HRV low?',
    chatPlaceholder: 'Say or ask something about your health…',
    replyError: 'Response error', noServer: 'No connection to the server. Start the backend.',
    sleep: 'Sleep', sleepHoursOf: (need) => `of ${need} needed`, sleepQuality: 'Sleep quality',
    collapse: 'Collapse', sleepMore: 'Details — sleep by the hour',
    weekRecovery: 'Recovery this week',
    daySumHigh: 'Your body has recovered well. A good day for an intense workout.',
    daySumMid: 'Medium recovery. Better to keep it moderate, no personal records.',
    daySumLow: 'Low recovery. A day for rest or light activity — let your body bounce back.',
    dayFull: { 'Пн': 'Monday', 'Вт': 'Tuesday', 'Ср': 'Wednesday', 'Чт': 'Thursday', 'Пт': 'Friday', 'Сб': 'Saturday', 'Вс': 'Sunday' },
    dayShort: { 'Пн': 'Mon', 'Вт': 'Tue', 'Ср': 'Wed', 'Чт': 'Thu', 'Пт': 'Fri', 'Сб': 'Sat', 'Вс': 'Sun' },
    metrics: {
      hrv: { lbl: 'HRV', desc: 'heart rate variability, the main indicator of recovery and stress' },
      rhr: { lbl: 'Resting heart rate', sub: 'bpm', desc: 'heart rate at full rest, lower means a more trained heart' },
      resp: { lbl: 'Respiratory rate in sleep', sub: 'breaths/min', desc: 'breathing rate during sleep, stability is a sign of health' },
      spo2: { lbl: 'SpO₂', sub: 'blood oxygen', desc: 'blood oxygen saturation during sleep' },
      skin: { lbl: 'Skin temperature', desc: 'skin temperature during sleep, a deviation may hint at illness' },
      eff: { lbl: 'Sleep efficiency', sub: 'of time in bed asleep', desc: 'share of time in bed spent asleep' }
    },
    skinSub: (d) => `${d > 0 ? '+' : ''}${d}° from normal`,
    help: 'What does this mean?',
    explainLoading: 'AI is working out this metric…', explainOk: 'Got it',
    explainFail: 'Could not get an explanation.',
    explainNoServer: 'No connection to the server. Start the backend to get an AI explanation.',
    cpSub: 'Whoop', cpTitle: 'Whoop is not connected',
    cpText: 'Connect Whoop to see recovery, sleep, HRV and heart rate. Blood test results are available below.',
    fbHigh: (rec, hrs, perf) => `Recovery ${rec}% — excellent. Sleep ${hrs} h (${perf}% of need). A good day for an intense workout.`,
    fbLow: (rec, hrs, need) => `Recovery ${rec}%. Sleep ${hrs} h of ${need}. I recommend easing the load and going to bed earlier.`
  }
}

function recoveryLevel(r) {
  if (r >= 67) return 'high'
  if (r >= 34) return 'mid'
  return 'low'
}

export default function Health() {
  const { lang } = useLang()
  const t = useT(STR)
  const recLabel = { high: t.recHigh, mid: t.recMid, low: t.recLow }
  // Живые данные Whoop (если подключён) — иначе демо WHOOP
  const [live, setLive] = useState(() => {
    try { const s = localStorage.getItem('albert-whoop-live'); return s ? JSON.parse(s) : null } catch { return null }
  })
  useEffect(() => {
    fetch('/api/whoop/data').then(r => r.json()).then(d => {
      if (d.connected && d.whoop) {
        setLive(d.whoop)
        try { localStorage.setItem('albert-whoop-live', JSON.stringify(d.whoop)) } catch { /* ignore */ }
      }
    }).catch(() => {})
  }, [])
  const w = live ? { ...WHOOP, ...live, sleep: { ...WHOOP.sleep, ...live.sleep } } : WHOOP
  const recColor = recoveryColor(w.recovery)

  // Живые данные Garmin (для колец «Заряд тела» и «Стресс»)
  const [garmin, setGarmin] = useState(() => {
    try { const s = localStorage.getItem('albert-garmin-live'); return s ? JSON.parse(s) : null } catch { return null }
  })
  useEffect(() => {
    fetch('/api/garmin/data').then(r => r.json()).then(d => {
      if (d.connected && d.garmin) {
        setGarmin(d.garmin)
        try { localStorage.setItem('albert-garmin-live', JSON.stringify(d.garmin)) } catch { /* ignore */ }
      }
    }).catch(() => {})
  }, [])
  const [openDetail, setOpenDetail] = useState(null)
  const [selDay, setSelDay] = useState(null)   // выбранный день в «Восстановление за неделю»
  const [sleepOpen, setSleepOpen] = useState(false)  // развёрнутая почасовая диаграмма сна

  // Короткая сводка по дню недели (восстановление → совет по тренировкам)
  function daySummary(d) {
    const r = d.recovery
    if (r >= 67) return t.daySumHigh
    if (r >= 34) return t.daySumMid
    return t.daySumLow
  }
  const DAY_FULL = t.dayFull

  // Пояснение показателя от ИИ
  const [explain, setExplain] = useState(null)
  const [explainText, setExplainText] = useState('')
  const [explainLoading, setExplainLoading] = useState(false)

  // Чат с ИИ-консультантом здоровья
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const msgsRef = useRef(null)

  const snapshot = useSiteSnapshot()
  const HEALTH_CONTEXT =
    `Ты личный консультант владельца по здоровью, сну и восстановлению. Твоя зона — Whoop, восстановление, сон, самочувствие, анализы крови. ` +
    `ФОКУСИРУЙСЯ на здоровье и не уходи в чужие темы, но ты ВИДИШЬ весь контекст (тренировки, расписание) и учитываешь его для связных советов. ` +
    `Объясняй простыми словами, давай краткие дельные советы на русском. При тревожных отклонениях советуй обратиться к врачу. Учитывай память. ` +
    `ВАЖНО: «Восстановление» (Whoop) — утренний балл готовности, с ним владелец проснулся; он фиксирован на день и не убывает к вечеру. Не путай с «остатком заряда»/Body Battery (этого показателя в данных нет).` +
    (lang === 'en' ? ' Always reply to the user in English.' : '')

  // ИИ-сводка консультанта (с кэшем; шаблон — фолбэк без backend)
  const fallbackConsult = w.recovery >= 67
    ? t.fbHigh(w.recovery, w.sleep.hoursSlept, w.sleep.performance)
    : t.fbLow(w.recovery, w.sleep.hoursSlept, w.sleep.hoursNeeded)
  const consultSummary = useAiSummary({
    id: 'consultant',
    context: HEALTH_CONTEXT,
    snapshot,
    message: 'Дай короткую сводку по здоровью (2–3 предложения): состояние восстановления и сна, можно ли сегодня нагружаться, один совет. Без приветствия.',
    fallback: fallbackConsult
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
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, context: HEALTH_CONTEXT, snapshot, history: priorHistory })
      })
      const data = await res.json()
      setMessages(m => [...m, { role: 'assistant', text: data.reply || t.replyError }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: t.noServer }])
    }
    setLoading(false)
  }

  async function askExplain(m) {
    setExplain({ title: m.lbl, value: m.val })
    setExplainText('')
    setExplainLoading(true)
    const context =
      `Ты консультант по здоровью. Объясни простыми словами для 50-летнего человека без подготовки. ` +
      `Показатель «${m.lbl}» = ${m.val} (${m.desc}). ` +
      `Разбей ответ на короткие абзацы по смыслу: 1) что это такое простыми словами; 2) твоё значение это хорошо или нет; 3) что конкретно делать. ` +
      `Между абзацами пустая строка. Если есть советы — каждый с новой строки.` +
      (lang === 'en' ? ' Always reply to the user in English.' : '')
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Объясни показатель ${m.lbl} = ${m.val}`, context })
      })
      const data = await res.json()
      setExplainText(data.reply || t.explainFail)
    } catch {
      setExplainText(t.explainNoServer)
    }
    setExplainLoading(false)
  }

  // Показатели здоровья — для рендера и пояснений
  const M = t.metrics
  const HEALTH_METRICS = [
    { key: 'hrv', val: `${w.hrv} ${lang === 'en' ? 'ms' : 'мс'}`, lbl: M.hrv.lbl, desc: M.hrv.desc },
    { key: 'rhr', val: `${w.rhr}`, lbl: M.rhr.lbl, sub: M.rhr.sub, desc: M.rhr.desc },
    { key: 'resp', val: w.respiratoryRate, lbl: M.resp.lbl, sub: M.resp.sub, desc: M.resp.desc },
    { key: 'spo2', val: `${w.spo2}%`, lbl: M.spo2.lbl, sub: M.spo2.sub, desc: M.spo2.desc },
    { key: 'skin', val: `${w.skinTemp}°`, lbl: M.skin.lbl, sub: t.skinSub(w.skinTempDelta), desc: M.skin.desc },
    { key: 'eff', val: `${w.sleep.efficiency}%`, lbl: M.eff.lbl, sub: M.eff.sub, desc: M.eff.desc }
  ]

  // Фазы сна для полосы
  const stages = SLEEP_STAGES.map(s => ({ ...s, label: t.stages[s.key] || s.label, min: w.sleep.stages[s.key] }))
  const totalSleepMin = stages.reduce((a, s) => a + s.min, 0)

  // Whoop не подключён → без выдуманных данных, но анализы крови оставляем
  if (!live) {
    return (
      <ConnectPrompt
        heading={t.heading}
        sub={t.cpSub}
        title={t.cpTitle}
        text={t.cpText}
      >
        <LabResults />
      </ConnectPrompt>
    )
  }

  return (
    <div className="health-page">
      <div className="page-header">
        <h2>{t.heading}</h2>
        <span className="muted">Whoop</span>
      </div>

      {/* Верх: восстановление + ИИ-консультант */}
      <div className="health-top">
        <motion.div className="card recovery-card"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <WhoopRings w={w} garmin={garmin} />

          <p className="rc-text">
            {w.recovery >= 67
              ? t.recTextHigh
              : w.recovery >= 34
                ? t.recTextMid
                : t.recTextLow}
          </p>

          <div className="rc-metrics">
            <div className="rc-metric"><span className="rc-m-val">{w.hrv}</span><span className="rc-m-lbl">{t.hrvShort}</span></div>
            <div className="rc-metric"><span className="rc-m-val">{w.rhr}</span><span className="rc-m-lbl">{t.rhrShort}</span></div>
            <div className="rc-metric"><span className="rc-m-val">{w.respiratoryRate}</span><span className="rc-m-lbl">{t.respShort}</span></div>
            <div className="rc-metric"><span className="rc-m-val">{w.spo2}%</span><span className="rc-m-lbl">SpO₂</span></div>
          </div>
        </motion.div>

        <motion.div className="card ai-health"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08 }}>
          <div className="summary-head">
            <span className="summary-badge">{t.aiBadge}</span>
            <div className="card-title" style={{ margin: 0 }}>{t.consultant}</div>
            <AiRefreshButton onClick={consultSummary.refresh} loading={consultSummary.loading} />
          </div>
          <p className="health-text">
            {consultSummary.loading ? t.analyzing : consultSummary.text}
          </p>

          <div className="health-chat">
            {messages.length > 0 && (
              <div className="hc-msgs" ref={msgsRef}>
                {messages.map((m, i) => <div key={i} className={`hc-msg ${m.role}`}>{m.text}</div>)}
                {loading && <div className="hc-msg assistant thinking">{t.thinking}</div>}
              </div>
            )}
            {messages.length === 0 && (
              <div className="hc-suggests">
                {[t.s1, t.s2, t.s3].map(s => (
                  <button key={s} className="hc-suggest" onClick={() => setInput(s)}>{s}</button>
                ))}
              </div>
            )}
            <div className="hc-input-row">
              <MicButton primary onText={txt => setInput(prev => (prev ? prev.trim() + ' ' : '') + txt)} />
              <input className="hc-input" placeholder={t.chatPlaceholder} value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send() } }} />
              <button className="hc-send" onClick={send} disabled={loading || !input.trim()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Сон: производительность + фазы */}
      <div className="card sleep-card">
        <div className="sleep-head">
          <div className="card-title" style={{ margin: 0 }}>{t.sleep}</div>
          <span className="sleep-hours">{w.sleep.hoursSlept} {lang === 'en' ? 'h' : 'ч'} <span className="muted">{t.sleepHoursOf(w.sleep.hoursNeeded)}</span></span>
        </div>
        <div className="sleep-body">
          <CircularChart value={w.sleep.performance} label={t.sleepQuality} color="var(--accent)" size={130} />
          <div className="sleep-stages">
            <div className="stage-bar">
              {stages.map(s => s.min > 0 && (
                <div key={s.key} className="stage-seg" style={{ width: `${s.min / totalSleepMin * 100}%`, background: s.color }}
                  title={`${s.label} — ${fmtHm(s.min)}`} />
              ))}
            </div>
            <div className="stage-legend">
              {stages.map(s => (
                <div key={s.key} className="stage-leg">
                  <span className="stage-dot" style={{ background: s.color }} />
                  <span className="stage-leg-lbl">{s.label}</span>
                  <span className="stage-leg-val">{fmtHm(s.min)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <button className="sleep-more" onClick={() => setSleepOpen(o => !o)} aria-expanded={sleepOpen}>
          <span className={`sleep-chev ${sleepOpen ? 'open' : ''}`}>▸</span>
          {sleepOpen ? t.collapse : t.sleepMore}
        </button>
        <AnimatePresence initial={false}>
          {sleepOpen && (
            <motion.div className="sleep-detail"
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}>
              <SleepHypnogram stages={w.sleep.stages} start={w.sleep.start} end={w.sleep.end} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Тренд восстановления за неделю */}
      <div className="card trend-card">
        <div className="card-title">{t.weekRecovery}</div>
        <div className="trend-bars">
          {(live?.week?.length ? live.week : WHOOP_DAYS).map((d, i) => {
            const active = selDay?.day === d.day
            return (
              <button key={i} type="button"
                className={`trend-col ${active ? 'active' : ''}`}
                onClick={() => setSelDay(active ? null : d)}>
                <div className="trend-bar-wrap">
                  <motion.div className="trend-bar"
                    style={{ background: recoveryColor(d.recovery) }}
                    initial={{ height: 0 }} animate={{ height: `${d.recovery}%` }}
                    transition={{ duration: 0.5, delay: 0.05 * i }} />
                </div>
                <span className="trend-val">{d.recovery}</span>
                <span className="trend-day muted">{t.dayShort[d.day] || d.day}</span>
              </button>
            )
          })}
        </div>

        {selDay && (
          <motion.div className="trend-summary"
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            style={{ borderColor: recoveryColor(selDay.recovery) }}>
            <div className="trend-summary-head">
              <span className="trend-summary-day">{DAY_FULL[selDay.day] || selDay.day}</span>
              <span className="trend-summary-rec" style={{ color: recoveryColor(selDay.recovery) }}>
                {selDay.recovery}% · {recLabel[recoveryLevel(selDay.recovery)]}
              </span>
            </div>
            <p className="trend-summary-text">{daySummary(selDay)}</p>
          </motion.div>
        )}
      </div>

      {/* Карточки показателей с пояснением ИИ */}
      <div className="health-metrics">
        {HEALTH_METRICS.map(m => (
          <div key={m.key} className="card hm-card">
            <button className="gm-help" onClick={() => askExplain(m)} title={t.help}>?</button>
            <span className="hm-val">{m.val}</span>
            <span className="hm-lbl">{m.lbl}</span>
            {m.sub && <span className="hm-sub muted">{m.sub}</span>}
          </div>
        ))}
      </div>

      {/* Анализы крови — загрузка файлов, расшифровка ИИ, динамика */}
      <LabResults />

      {/* Окно пояснения показателя от ИИ */}
      {explain && (
        <div className="detail-backdrop" onClick={() => setExplain(null)}>
          <motion.div className="card detail-modal" onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="summary-head">
              <span className="summary-badge">{t.aiBadge}</span>
              <h3 style={{ margin: 0 }}>{explain.title} · {explain.value}</h3>
            </div>
            <p className="health-text">{explainLoading ? t.explainLoading : explainText}</p>
            <button className="detail-btn primary" onClick={() => setExplain(null)}>{t.explainOk}</button>
          </motion.div>
        </div>
      )}

      <style>{`
        .health-page { display: flex; flex-direction: column; gap: 24px; max-width: 1400px; padding-bottom: 20px; }
        .page-header { display: flex; align-items: baseline; gap: 12px; }
        .page-header h2 { font-size: 24px; font-weight: 700; }
        .muted { color: var(--muted-foreground); }

        .health-top { display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; align-items: start; }
        .recovery-card { display: flex; flex-direction: column; gap: 20px; }
        .rc-main { display: flex; align-items: center; gap: 24px; }
        .rc-side { flex: 1; display: flex; flex-direction: column; gap: 16px; }
        .rc-text { font-size: 14px; line-height: 1.6; color: var(--foreground); }
        .rc-strain { display: flex; flex-direction: column; gap: 6px; }
        .rc-strain-lbl { font-size: 12px; color: var(--muted-foreground); }
        .strain-bar { height: 8px; border-radius: 4px; background: var(--bg-secondary); overflow: hidden; }
        .strain-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, #6E8CA8, #B07B52); }
        .rc-strain-val { font-size: 15px; font-weight: 700; color: var(--foreground); }

        .rc-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .rc-metric { display: flex; flex-direction: column; gap: 3px; background: var(--bg-secondary); border-radius: 12px; padding: 12px; }
        .rc-m-val { font-size: 20px; font-weight: 700; color: var(--foreground); }
        .rc-m-lbl { font-size: 11px; color: var(--muted-foreground); }

        .ai-health { display: flex; flex-direction: column; gap: 14px; }
        .summary-head { display: flex; align-items: center; gap: 10px; }
        .summary-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: var(--primary-foreground); background: var(--primary); padding: 3px 8px; border-radius: 6px; }
        .health-text { font-size: 16.5px; line-height: 1.7; color: var(--foreground); white-space: pre-wrap; }

        .health-chat { margin-top: auto; display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--border); padding-top: 14px; }
        .hc-msgs { display: flex; flex-direction: column; gap: 8px; max-height: 200px; overflow-y: auto; }
        .hc-msg { font-size: 13.5px; line-height: 1.5; padding: 9px 12px; border-radius: 12px; max-width: 90%; }
        .hc-msg.user { align-self: flex-end; background: var(--primary); color: var(--primary-foreground); border-bottom-right-radius: 4px; }
        .hc-msg.assistant { align-self: flex-start; background: var(--bg-secondary); color: var(--foreground); border-bottom-left-radius: 4px; }
        .hc-msg.thinking { color: var(--muted-foreground); font-style: italic; }
        .hc-suggests { display: flex; flex-wrap: wrap; gap: 6px; }
        .hc-suggest { font-size: 12px; padding: 6px 11px; border: 1px solid var(--border); background: transparent; color: var(--muted-foreground); border-radius: 16px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
        .hc-suggest:hover { color: var(--primary); border-color: var(--border-hover); }
        .hc-input-row { display: flex; align-items: center; gap: 8px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; padding: 6px 6px 6px 14px; transition: border-color 0.2s; }
        .hc-input-row:focus-within { border-color: var(--border-hover); }
        .hc-input { flex: 1; border: none; background: transparent; outline: none; font-family: inherit; font-size: 13.5px; color: var(--foreground); }
        .hc-input::placeholder { color: var(--muted-foreground); }
        .hc-send { width: 32px; height: 32px; flex-shrink: 0; border: none; border-radius: 9px; background: var(--primary); color: var(--primary-foreground); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: opacity 0.15s; }
        .hc-send:hover:not(:disabled) { opacity: 0.9; }
        .hc-send:disabled { opacity: 0.4; cursor: default; }

        /* Сон */
        .sleep-card { display: flex; flex-direction: column; gap: 16px; }
        .sleep-head { display: flex; align-items: baseline; justify-content: space-between; }
        .sleep-hours { font-size: 16px; font-weight: 700; color: var(--foreground); }
        .sleep-body { display: flex; align-items: center; gap: 28px; }
        .sleep-stages { flex: 1; display: flex; flex-direction: column; gap: 14px; }
        .stage-bar { display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: var(--bg-secondary); }
        .stage-seg { height: 100%; transition: width 0.4s; }
        .stage-legend { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 20px; }
        .stage-leg { display: flex; align-items: center; gap: 8px; font-size: 13px; }
        .stage-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .stage-leg-lbl { color: var(--muted-foreground); }
        .stage-leg-val { margin-left: auto; color: var(--foreground); font-weight: 600; }
        .sleep-more { align-self: flex-start; display: flex; align-items: center; gap: 8px; background: transparent; border: none; padding: 4px 0; cursor: pointer; font-family: inherit; font-size: 13.5px; font-weight: 600; color: var(--primary); transition: opacity .15s; }
        .sleep-more:hover { opacity: 0.8; }
        .sleep-chev { display: inline-block; transition: transform .2s; font-size: 11px; }
        .sleep-chev.open { transform: rotate(90deg); }
        .sleep-detail { overflow: hidden; }

        /* Тренд недели */
        .trend-card { display: flex; flex-direction: column; gap: 16px; }
        .trend-bars { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; height: 160px; }
        .trend-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; background: transparent; border: none; font-family: inherit; cursor: pointer; padding: 6px 2px 0; border-radius: 10px; transition: background 0.15s; }
        .trend-col:hover { background: var(--bg-secondary); }
        .trend-col.active { background: var(--bg-secondary); }
        .trend-summary { margin-top: 16px; padding: 14px 16px; background: var(--bg-secondary); border-left: 3px solid var(--border); border-radius: 12px; display: flex; flex-direction: column; gap: 6px; }
        .trend-summary-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
        .trend-summary-day { font-size: 15px; font-weight: 700; color: var(--foreground); }
        .trend-summary-rec { font-size: 14px; font-weight: 700; }
        .trend-summary-text { font-size: 15px; line-height: 1.55; color: var(--foreground); }
        .trend-bar-wrap { flex: 1; width: 100%; max-width: 44px; display: flex; align-items: flex-end; background: var(--bg-secondary); border-radius: 8px; overflow: hidden; }
        .trend-bar { width: 100%; border-radius: 8px 8px 0 0; min-height: 4px; }
        .trend-val { font-size: 13px; font-weight: 700; color: var(--foreground); }
        .trend-day { font-size: 12px; }

        /* Карточки показателей */
        .health-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .hm-card { position: relative; display: flex; flex-direction: column; gap: 3px; padding: 16px; }
        .hm-val { font-size: 22px; font-weight: 800; color: var(--foreground); }
        .hm-lbl { font-size: 13px; font-weight: 600; color: var(--foreground); }
        .hm-sub { font-size: 11px; }
        .gm-help {
          position: absolute; top: 10px; right: 10px;
          width: 22px; height: 22px; border-radius: 50%;
          border: 1px solid var(--border); background: var(--bg-secondary);
          color: var(--muted-foreground); font-family: inherit; font-size: 13px; font-weight: 700;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          line-height: 1; transition: all 0.15s; opacity: 0.7;
        }
        .gm-help:hover { opacity: 1; color: var(--primary); border-color: var(--primary); }

        /* Модалка */
        .detail-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(3px); z-index: 500; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .detail-modal { width: 100%; max-width: 460px; max-height: 85vh; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
        .detail-modal::-webkit-scrollbar { width: 8px; }
        .detail-modal::-webkit-scrollbar-thumb { background: var(--bg-secondary); border-radius: 8px; }
        .detail-modal .detail-btn.primary { position: sticky; bottom: 0; }
        .detail-modal h3 { font-size: 18px; font-weight: 700; color: var(--foreground); }
        .detail-btn { padding: 8px 18px; border-radius: 10px; border: 1px solid var(--border); background: transparent; color: var(--muted-foreground); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
        .detail-btn:hover { color: var(--primary); border-color: var(--border-hover); }
        .detail-btn.primary { background: var(--primary); color: var(--primary-foreground); border-color: var(--primary); align-self: flex-start; }

        @media (max-width: 1100px) {
          .health-top { grid-template-columns: 1fr; }
          .health-metrics { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  )
}
