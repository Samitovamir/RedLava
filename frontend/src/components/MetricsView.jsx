import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui'
import { motion, AnimatePresence } from 'framer-motion'
import CircularChart from './CircularChart.jsx'
import WhoopRings from './WhoopRings.jsx'
import SleepHypnogram from './SleepHypnogram.jsx'
import LabResults from './LabResults.jsx'
import Icon from '../ui/Icon.jsx'
import { useLang, useT } from '../context/LanguageContext.jsx'
import { WHOOP, WHOOP_DAYS, SLEEP_STAGES, recoveryColor, fmtHm } from '../utils/whoop.js'

/*
  Вкладка «Показатели» страницы «Здоровье» (без ИИ).
  Восстановление/сон/тренд/мини-показатели (Whoop) + метрики Garmin (VO2max и т.д.)
  + анализы крови (LabResults). Whoop-секции гейтятся при отсутствии Whoop, анализы
  показываются всегда (работают офлайн).
*/

const STR = {
  ru: {
    stages: { awake: 'Бодрствование', light: 'Лёгкий сон', rem: 'REM (быстрый)', deep: 'Глубокий сон' },
    recHigh: 'Высокое', recMid: 'Среднее', recLow: 'Низкое',
    recTextHigh: 'Тело хорошо восстановилось — можно давать высокую нагрузку.',
    recTextMid: 'Среднее восстановление — умеренная нагрузка, следи за самочувствием.',
    recTextLow: 'Низкое восстановление — день отдыха или лёгкая активность.',
    hrvShort: 'HRV, мс', rhrShort: 'пульс покоя', respShort: 'дыхание',
    sleep: 'Сон', sleepHoursOf: (need) => `из ${need} нужных`, sleepQuality: 'Качество сна',
    napLabel: 'Дневной сон', napOf: (h) => `${h} ч`,
    collapse: 'Свернуть', sleepMore: 'Подробнее — сон по часам',
    weekRecovery: 'Восстановление за неделю',
    daySumHigh: 'Организм хорошо восстановился. Хороший день для интенсивной тренировки.',
    daySumMid: 'Среднее восстановление. Лучше умеренная нагрузка, без рекордов.',
    daySumLow: 'Низкое восстановление. День для отдыха или лёгкой активности, дайте телу прийти в себя.',
    dayFull: { 'Пн': 'Понедельник', 'Вт': 'Вторник', 'Ср': 'Среда', 'Чт': 'Четверг', 'Пт': 'Пятница', 'Сб': 'Суббота', 'Вс': 'Воскресенье' },
    dayShort: { 'Пн': 'Пн', 'Вт': 'Вт', 'Ср': 'Ср', 'Чт': 'Чт', 'Пт': 'Пт', 'Сб': 'Сб', 'Вс': 'Вс' },
    metrics: {
      hrv: { lbl: 'HRV' }, rhr: { lbl: 'Пульс покоя', sub: 'уд/мин' },
      resp: { lbl: 'Дыхание во сне', sub: 'вдох/мин' }, spo2: { lbl: 'SpO₂', sub: 'кислород в крови' },
      skin: { lbl: 'Температура кожи' }, eff: { lbl: 'Эффективность сна', sub: 'времени в постели спал' }
    },
    skinSub: (d) => `${d > 0 ? '+' : ''}${d}° от нормы`,
    garmin: 'Показатели Garmin',
    whoopOffTitle: 'Whoop не подключён',
    whoopOff: 'Подключите часы — и здесь появятся восстановление, сон, HRV и пульс покоя.',
    whoopOffBtn: 'Подключить Whoop',
    gm: { vo2: 'VO₂max', vo2sub: 'мл/кг/мин', age: 'Фитнес-возраст', ageSub: 'лет', rhr: 'Пульс покоя · Garmin', rhrSub: 'уд/мин', bb: 'Body Battery', stress: 'Стресс', status: 'Статус тренировок', load: 'Нагрузка (load)' }
  },
  en: {
    stages: { awake: 'Awake', light: 'Light', rem: 'REM', deep: 'Deep' },
    recHigh: 'High', recMid: 'Medium', recLow: 'Low',
    recTextHigh: 'Your body has recovered well — you can take on a heavy load today.',
    recTextMid: 'Medium recovery — keep the load moderate and watch how you feel.',
    recTextLow: 'Low recovery — make it a rest day or light activity.',
    hrvShort: 'HRV, ms', rhrShort: 'resting HR', respShort: 'respiration',
    sleep: 'Sleep', sleepHoursOf: (need) => `of ${need} needed`, sleepQuality: 'Sleep quality',
    napLabel: 'Daytime nap', napOf: (h) => `${h} h`,
    collapse: 'Collapse', sleepMore: 'Details — sleep by the hour',
    weekRecovery: 'Recovery this week',
    daySumHigh: 'Your body has recovered well. A good day for an intense workout.',
    daySumMid: 'Medium recovery. Better to keep it moderate, no personal records.',
    daySumLow: 'Low recovery. A day for rest or light activity — let your body bounce back.',
    dayFull: { 'Пн': 'Monday', 'Вт': 'Tuesday', 'Ср': 'Wednesday', 'Чт': 'Thursday', 'Пт': 'Friday', 'Сб': 'Saturday', 'Вс': 'Sunday' },
    dayShort: { 'Пн': 'Mon', 'Вт': 'Tue', 'Ср': 'Wed', 'Чт': 'Thu', 'Пт': 'Fri', 'Сб': 'Sat', 'Вс': 'Sun' },
    metrics: {
      hrv: { lbl: 'HRV' }, rhr: { lbl: 'Resting heart rate', sub: 'bpm' },
      resp: { lbl: 'Respiratory rate in sleep', sub: 'breaths/min' }, spo2: { lbl: 'SpO₂', sub: 'blood oxygen' },
      skin: { lbl: 'Skin temperature' }, eff: { lbl: 'Sleep efficiency', sub: 'of time in bed asleep' }
    },
    skinSub: (d) => `${d > 0 ? '+' : ''}${d}° from normal`,
    garmin: 'Garmin metrics',
    whoopOffTitle: 'Whoop is not connected',
    whoopOff: 'Connect your band to see recovery, sleep, HRV and resting heart rate here.',
    whoopOffBtn: 'Connect Whoop',
    gm: { vo2: 'VO₂max', vo2sub: 'ml/kg/min', age: 'Fitness age', ageSub: 'yrs', rhr: 'Resting HR · Garmin', rhrSub: 'bpm', bb: 'Body Battery', stress: 'Stress', status: 'Training status', load: 'Training load' }
  }
}

function recoveryLevel(r) {
  if (r >= 67) return 'high'
  if (r >= 34) return 'mid'
  return 'low'
}

export default function MetricsView() {
  const { lang } = useLang()
  const t = useT(STR)
  const navigate = useNavigate()
  const recLabel = { high: t.recHigh, mid: t.recMid, low: t.recLow }

  // Живые данные Whoop / Garmin (как на старой странице Здоровье)
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

  const [selDay, setSelDay] = useState(null)
  const [sleepOpen, setSleepOpen] = useState(false)

  const w = live ? { ...WHOOP, ...live, sleep: { ...WHOOP.sleep, ...live.sleep } } : WHOOP
  const DAY_FULL = t.dayFull
  function daySummary(d) {
    if (d.recovery >= 67) return t.daySumHigh
    if (d.recovery >= 34) return t.daySumMid
    return t.daySumLow
  }

  const M = t.metrics
  const HEALTH_METRICS = [
    { key: 'hrv', val: `${w.hrv} ${lang === 'en' ? 'ms' : 'мс'}`, lbl: M.hrv.lbl },
    { key: 'rhr', val: `${w.rhr}`, lbl: M.rhr.lbl, sub: M.rhr.sub },
    { key: 'resp', val: w.respiratoryRate, lbl: M.resp.lbl, sub: M.resp.sub },
    { key: 'spo2', val: `${w.spo2}%`, lbl: M.spo2.lbl, sub: M.spo2.sub },
    { key: 'skin', val: `${w.skinTemp}°`, lbl: M.skin.lbl, sub: t.skinSub(w.skinTempDelta) },
    { key: 'eff', val: `${w.sleep.efficiency}%`, lbl: M.eff.lbl, sub: M.eff.sub }
  ]

  const stages = SLEEP_STAGES.map(s => ({ ...s, label: t.stages[s.key] || s.label, min: w.sleep.stages[s.key] }))
  const totalSleepMin = stages.reduce((a, s) => a + s.min, 0)

  // Метрики Garmin — только реально присутствующие в живых данных (VO2max и т.д.)
  const G = t.gm
  const bb = garmin?.bodyBattery, str = garmin?.stress
  // Числа-метрики — в --foreground (без декоративной окраски; статусной семантики здесь нет)
  const garminMetrics = [
    garmin?.vo2Max != null && { val: `${garmin.vo2Max}`, lbl: G.vo2, sub: G.vo2sub },
    garmin?.fitnessAge != null && { val: `${garmin.fitnessAge}`, lbl: G.age, sub: G.ageSub },
    garmin?.restingHr != null && { val: `${garmin.restingHr}`, lbl: G.rhr, sub: G.rhrSub },
    bb?.current != null && { val: `${bb.current}`, lbl: G.bb, sub: '/100' },
    (str && (str.current ?? str.avg) != null) && { val: `${str.current ?? str.avg}`, lbl: G.stress, sub: '/100' },
    garmin?.trainingStatus && { val: garmin.trainingStatus, lbl: G.status }
  ].filter(Boolean)

  return (
    <div className="metrics-view">
      {live ? (<>
        {/* Восстановление */}
        <motion.div className="card recovery-card"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <WhoopRings w={w} garmin={garmin} />
          <p className="rc-text">
            {w.recovery >= 67 ? t.recTextHigh : w.recovery >= 34 ? t.recTextMid : t.recTextLow}
          </p>
          <div className="rc-metrics">
            <div className="rc-metric"><span className="rc-m-val">{w.hrv}</span><span className="rc-m-lbl">{t.hrvShort}</span></div>
            <div className="rc-metric"><span className="rc-m-val">{w.rhr}</span><span className="rc-m-lbl">{t.rhrShort}</span></div>
            <div className="rc-metric"><span className="rc-m-val">{w.respiratoryRate}</span><span className="rc-m-lbl">{t.respShort}</span></div>
            <div className="rc-metric"><span className="rc-m-val">{w.spo2}%</span><span className="rc-m-lbl">SpO₂</span></div>
          </div>
        </motion.div>

        {/* Сон */}
        <div className="card sleep-card">
          <div className="sleep-head">
            <div className="card-title" style={{ margin: 0 }}>{t.sleep}</div>
            <span className="sleep-hours">{w.sleep.hoursSlept} {lang === 'en' ? 'h' : 'ч'} <span className="muted">{t.sleepHoursOf(w.sleep.hoursNeeded)}</span></span>
          </div>
          {w.nap && (
            <div className="sleep-nap" title={t.napLabel}>
              <Icon name="nap" size={16} color="var(--accent)" />
              <span className="sleep-nap-lbl">{t.napLabel}</span>
              <span className="sleep-nap-val">{t.napOf(w.nap.hoursSlept)}</span>
              {w.nap.start && w.nap.end && (
                <span className="sleep-nap-time muted">{w.nap.start}–{w.nap.end}</span>
              )}
            </div>
          )}
          <div className="sleep-body">
            <CircularChart value={w.sleep.performance} label={t.sleepQuality} color="var(--accent)" size={130} />
            <div className="sleep-stages">
              <div className="stage-bar">
                {stages.map(s => s.min > 0 && (
                  <div key={s.key} className="stage-seg" style={{ width: `${s.min / totalSleepMin * 100}%`, background: s.color }} title={`${s.label} — ${fmtHm(s.min)}`} />
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
          <Button variant="ghost" size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSleepOpen(o => !o)} aria-expanded={sleepOpen}>
            <span className={`sleep-chev ${sleepOpen ? 'open' : ''}`}>▸</span>
            {sleepOpen ? t.collapse : t.sleepMore}
          </Button>
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
                <button key={i} type="button" className={`trend-col ${active ? 'active' : ''}`} onClick={() => setSelDay(active ? null : d)}>
                  <div className="trend-bar-wrap">
                    <motion.div className="trend-bar" style={{ background: recoveryColor(d.recovery) }}
                      initial={{ height: 0 }} animate={{ height: `${d.recovery}%` }} transition={{ duration: 0.5, delay: 0.05 * i }} />
                  </div>
                  <span className="trend-val">{d.recovery}</span>
                  <span className="trend-day muted">{t.dayShort[d.day] || d.day}</span>
                </button>
              )
            })}
          </div>
          {selDay && (
            <motion.div className="trend-summary" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
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

        {/* Мини-показатели (Whoop) */}
        <div className="health-metrics">
          {HEALTH_METRICS.map(m => (
            <div key={m.key} className="card hm-card">
              <span className="hm-val">{m.val}</span>
              <span className="hm-lbl">{m.lbl}</span>
              {m.sub && <span className="hm-sub muted">{m.sub}</span>}
            </div>
          ))}
        </div>
      </>) : (
        <div className="card metrics-whoop-off">
          <span className="mwo-icon"><Icon name="health" size={26} color="var(--accent)" /></span>
          <div className="mwo-text">
            <div className="mwo-title">{t.whoopOffTitle}</div>
            <p className="mwo-sub">{t.whoopOff}</p>
          </div>
          <Button variant="primary" onClick={() => navigate('/connections')}>{t.whoopOffBtn}</Button>
        </div>
      )}

      {/* Метрики Garmin (VO2max и т.д.) — если подключён */}
      {garminMetrics.length > 0 && (
        <div className="metrics-section">
          <div className="card-title">{t.garmin}</div>
          <div className="health-metrics">
            {garminMetrics.map((m, i) => (
              <div key={i} className="card hm-card">
                <span className="hm-val" style={{ color: m.color }}>{m.val}</span>
                <span className="hm-lbl">{m.lbl}</span>
                {m.sub && <span className="hm-sub muted">{m.sub}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Анализы крови — всегда (работают офлайн) */}
      <LabResults />

      <style>{`
        .metrics-view { display: flex; flex-direction: column; gap: 24px; }
        .metrics-section { display: flex; flex-direction: column; gap: 12px; }
        .metrics-whoop-off { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
        .mwo-icon { width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: var(--bg-tile, var(--bg-secondary)); box-shadow: var(--inset-tile); }
        .mwo-text { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 4px; }
        .mwo-title { font-size: 16px; font-weight: 700; color: var(--foreground); }
        .mwo-sub { font-size: 14px; line-height: 1.55; color: var(--muted-foreground); }
        .metrics-whoop-off .ds-btn { flex-shrink: 0; }
        @media (max-width: 520px) { .metrics-whoop-off .ds-btn { width: 100%; } }
        .muted { color: var(--muted-foreground); }
        .card-title { font-size: 17px; font-weight: 700; color: var(--foreground); }

        .recovery-card { display: flex; flex-direction: column; gap: 20px; }
        .rc-text { font-size: 14px; line-height: 1.6; color: var(--foreground); }
        .rc-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .rc-metric { display: flex; flex-direction: column; gap: 3px; background: var(--bg-tile, var(--bg-secondary)); border: 1px solid var(--border-med, var(--border)); border-radius: 12px; padding: 12px; }
        .rc-m-val { font-size: 20px; font-weight: 700; color: var(--foreground); }
        .rc-m-lbl { font-size: 11px; color: var(--muted-foreground); }

        .sleep-card { display: flex; flex-direction: column; gap: 16px; }
        .sleep-head { display: flex; align-items: baseline; justify-content: space-between; }
        .sleep-hours { font-size: 16px; font-weight: 700; color: var(--foreground); }
        .sleep-nap { display: flex; align-items: center; gap: 8px; align-self: flex-start; margin-top: -4px; padding: 7px 12px; border-radius: 999px; background: var(--bg-tile); box-shadow: var(--inset-tile); font-size: 13px; }
        .sleep-nap-lbl { color: var(--muted-foreground); }
        .sleep-nap-val { font-weight: 700; color: var(--foreground); font-variant-numeric: tabular-nums; }
        .sleep-nap-time { font-variant-numeric: tabular-nums; }
        .sleep-body { display: flex; align-items: center; gap: 28px; }
        .sleep-stages { flex: 1; display: flex; flex-direction: column; gap: 14px; }
        .stage-bar { display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: var(--bg-secondary); }
        .stage-seg { height: 100%; transition: width 0.4s; }
        .stage-legend { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 20px; }
        .stage-leg { display: flex; align-items: center; gap: 8px; font-size: 13px; }
        .stage-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .stage-leg-lbl { color: var(--muted-foreground); }
        .stage-leg-val { margin-left: auto; color: var(--foreground); font-weight: 600; }
        .sleep-chev { display: inline-block; transition: transform .2s; font-size: 11px; }
        .sleep-chev.open { transform: rotate(90deg); }
        .sleep-detail { overflow: hidden; }

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

        .health-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .hm-card { position: relative; display: flex; flex-direction: column; gap: 3px; padding: 16px; }
        .hm-val { font-size: 22px; font-weight: 800; color: var(--foreground); }
        .hm-lbl { font-size: 13px; font-weight: 600; color: var(--foreground); }
        .hm-sub { font-size: 11px; }

        @media (max-width: 1100px) {
          .health-metrics { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  )
}
