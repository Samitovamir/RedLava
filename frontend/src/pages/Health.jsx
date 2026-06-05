import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import CircularChart from '../components/CircularChart.jsx'
import LabResults from '../components/LabResults.jsx'
import ConnectPrompt from '../components/ConnectPrompt.jsx'
import AiRefreshButton from '../components/AiRefreshButton.jsx'
import MicButton from '../components/MicButton.jsx'
import { useAiSummary } from '../hooks/useAiSummary.js'
import { useSiteSnapshot } from '../hooks/useSiteSnapshot.js'
import {
  WHOOP, WHOOP_DAYS, SLEEP_STAGES, recoveryColor, recoveryLabel, fmtHm
} from '../utils/whoop.js'

export default function Health() {
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
  const [openDetail, setOpenDetail] = useState(null)
  const [selDay, setSelDay] = useState(null)   // выбранный день в «Восстановление за неделю»

  // Короткая сводка по дню недели (восстановление → совет по тренировкам)
  function daySummary(d) {
    const r = d.recovery
    if (r >= 67) return 'Организм хорошо восстановился. Хороший день для интенсивной тренировки.'
    if (r >= 34) return 'Среднее восстановление. Лучше умеренная нагрузка, без рекордов.'
    return 'Низкое восстановление. День для отдыха или лёгкой активности, дайте телу прийти в себя.'
  }
  const DAY_FULL = { 'Пн': 'Понедельник', 'Вт': 'Вторник', 'Ср': 'Среда', 'Чт': 'Четверг', 'Пт': 'Пятница', 'Сб': 'Суббота', 'Вс': 'Воскресенье' }

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
    `Объясняй простыми словами, давай краткие дельные советы на русском. При тревожных отклонениях советуй обратиться к врачу. Учитывай память.`

  // ИИ-сводка консультанта (с кэшем; шаблон — фолбэк без backend)
  const fallbackConsult = w.recovery >= 67
    ? `Восстановление ${w.recovery}% — отличное. Сон ${w.sleep.hoursSlept} ч (${w.sleep.performance}% нормы). Хороший день для интенсивной тренировки.`
    : `Восстановление ${w.recovery}%. Сон ${w.sleep.hoursSlept} ч из ${w.sleep.hoursNeeded}. Рекомендую снизить нагрузку и лечь раньше.`
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
      setMessages(m => [...m, { role: 'assistant', text: data.reply || 'Ошибка ответа' }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: 'Нет связи с сервером. Запустите backend.' }])
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
      `Между абзацами пустая строка. Если есть советы — каждый с новой строки.`
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Объясни показатель ${m.lbl} = ${m.val}`, context })
      })
      const data = await res.json()
      setExplainText(data.reply || 'Не удалось получить пояснение.')
    } catch {
      setExplainText('Нет связи с сервером. Запустите backend, чтобы получить пояснение от ИИ.')
    }
    setExplainLoading(false)
  }

  // Показатели здоровья — для рендера и пояснений
  const HEALTH_METRICS = [
    { key: 'hrv', val: `${w.hrv} мс`, lbl: 'HRV', desc: 'вариабельность сердечного ритма, главный показатель восстановления и стресса' },
    { key: 'rhr', val: `${w.rhr}`, lbl: 'Пульс покоя', sub: 'уд/мин', desc: 'частота пульса в полном покое, ниже — тренированнее сердце' },
    { key: 'resp', val: w.respiratoryRate, lbl: 'Дыхание во сне', sub: 'вдох/мин', desc: 'частота дыхания во сне, стабильность — признак здоровья' },
    { key: 'spo2', val: `${w.spo2}%`, lbl: 'SpO₂', sub: 'кислород в крови', desc: 'насыщение крови кислородом во сне' },
    { key: 'skin', val: `${w.skinTemp}°`, lbl: 'Температура кожи', sub: `${w.skinTempDelta > 0 ? '+' : ''}${w.skinTempDelta}° от нормы`, desc: 'температура кожи во сне, отклонение может намекать на болезнь' },
    { key: 'eff', val: `${w.sleep.efficiency}%`, lbl: 'Эффективность сна', sub: 'времени в постели спал', desc: 'доля времени в постели, проведённая во сне' }
  ]

  // Фазы сна для полосы
  const stages = SLEEP_STAGES.map(s => ({ ...s, min: w.sleep.stages[s.key] }))
  const totalSleepMin = stages.reduce((a, s) => a + s.min, 0)

  // Whoop не подключён → без выдуманных данных, но анализы крови оставляем
  if (!live) {
    return (
      <ConnectPrompt
        heading="Здоровье"
        sub="Whoop"
        title="Whoop не подключён"
        text="Подключите Whoop, чтобы видеть восстановление, сон, HRV и пульс. Анализы крови доступны ниже."
      >
        <LabResults />
      </ConnectPrompt>
    )
  }

  return (
    <div className="health-page">
      <div className="page-header">
        <h2>Здоровье</h2>
        <span className="muted">Whoop</span>
      </div>

      {/* Верх: восстановление + ИИ-консультант */}
      <div className="health-top">
        <motion.div className="card recovery-card"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="rc-main">
            <CircularChart value={w.recovery} label="Восстановление" color={recColor}
              size={150} sublabel={recoveryLabel(w.recovery)} />
            <div className="rc-side">
              <p className="rc-text">
                {w.recovery >= 67
                  ? 'Тело хорошо восстановилось — можно давать высокую нагрузку.'
                  : w.recovery >= 34
                    ? 'Среднее восстановление — умеренная нагрузка, следи за самочувствием.'
                    : 'Низкое восстановление — день отдыха или лёгкая активность.'}
              </p>
              <div className="rc-strain">
                <span className="rc-strain-lbl">Дневная нагрузка</span>
                <div className="strain-bar">
                  <div className="strain-fill" style={{ width: `${w.strain / w.strainMax * 100}%` }} />
                </div>
                <span className="rc-strain-val">{w.strain} <span className="muted">/ {w.strainMax}</span></span>
              </div>
            </div>
          </div>

          <div className="rc-metrics">
            <div className="rc-metric"><span className="rc-m-val">{w.hrv}</span><span className="rc-m-lbl">HRV, мс</span></div>
            <div className="rc-metric"><span className="rc-m-val">{w.rhr}</span><span className="rc-m-lbl">пульс покоя</span></div>
            <div className="rc-metric"><span className="rc-m-val">{w.respiratoryRate}</span><span className="rc-m-lbl">дыхание</span></div>
            <div className="rc-metric"><span className="rc-m-val">{w.spo2}%</span><span className="rc-m-lbl">SpO₂</span></div>
          </div>
        </motion.div>

        <motion.div className="card ai-health"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08 }}>
          <div className="summary-head">
            <span className="summary-badge">ИИ</span>
            <div className="card-title" style={{ margin: 0 }}>Консультант</div>
            <AiRefreshButton onClick={consultSummary.refresh} loading={consultSummary.loading} />
          </div>
          <p className="health-text">
            {consultSummary.loading ? 'ИИ анализирует показатели…' : consultSummary.text}
          </p>

          <div className="health-chat">
            {messages.length > 0 && (
              <div className="hc-msgs" ref={msgsRef}>
                {messages.map((m, i) => <div key={i} className={`hc-msg ${m.role}`}>{m.text}</div>)}
                {loading && <div className="hc-msg assistant thinking">думает…</div>}
              </div>
            )}
            {messages.length === 0 && (
              <div className="hc-suggests">
                {['Можно ли тренироваться сегодня?', 'Как улучшить сон?', 'Почему низкое HRV?'].map(s => (
                  <button key={s} className="hc-suggest" onClick={() => setInput(s)}>{s}</button>
                ))}
              </div>
            )}
            <div className="hc-input-row">
              <MicButton primary onText={t => setInput(prev => (prev ? prev.trim() + ' ' : '') + t)} />
              <input className="hc-input" placeholder="Скажите или спросите про здоровье…" value={input}
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
          <div className="card-title" style={{ margin: 0 }}>Сон</div>
          <span className="sleep-hours">{w.sleep.hoursSlept} ч <span className="muted">из {w.sleep.hoursNeeded} нужных</span></span>
        </div>
        <div className="sleep-body">
          <CircularChart value={w.sleep.performance} label="Качество сна" color="var(--accent)" size={130} />
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
      </div>

      {/* Тренд восстановления за неделю */}
      <div className="card trend-card">
        <div className="card-title">Восстановление за неделю</div>
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
                <span className="trend-day muted">{d.day}</span>
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
                {selDay.recovery}% · {recoveryLabel(selDay.recovery)}
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
            <button className="gm-help" onClick={() => askExplain(m)} title="Что это значит?">?</button>
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
              <span className="summary-badge">ИИ</span>
              <h3 style={{ margin: 0 }}>{explain.title} · {explain.value}</h3>
            </div>
            <p className="health-text">{explainLoading ? 'ИИ разбирается в показателе…' : explainText}</p>
            <button className="detail-btn primary" onClick={() => setExplain(null)}>Понятно</button>
          </motion.div>
        </div>
      )}

      <style>{`
        .health-page { display: flex; flex-direction: column; gap: 24px; max-width: 1400px; padding-bottom: 20px; }
        .page-header { display: flex; align-items: baseline; gap: 12px; }
        .page-header h2 { font-size: 24px; font-weight: 700; }
        .muted { color: var(--muted-foreground); }

        .health-top { display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; }
        .recovery-card { display: flex; flex-direction: column; gap: 20px; }
        .rc-main { display: flex; align-items: center; gap: 24px; }
        .rc-side { flex: 1; display: flex; flex-direction: column; gap: 16px; }
        .rc-text { font-size: 14px; line-height: 1.6; color: var(--foreground); }
        .rc-strain { display: flex; flex-direction: column; gap: 6px; }
        .rc-strain-lbl { font-size: 12px; color: var(--muted-foreground); }
        .strain-bar { height: 8px; border-radius: 4px; background: var(--bg-secondary); overflow: hidden; }
        .strain-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, #38bdf8, #818cf8); }
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
