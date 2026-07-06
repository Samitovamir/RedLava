import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui'
import { motion, AnimatePresence } from 'framer-motion'
import CircularChart from './CircularChart.jsx'
import WhoopRings from './WhoopRings.jsx'
import RecoveryBalance from './RecoveryBalance.jsx'
import SleepHypnogram from './SleepHypnogram.jsx'
import LabResults from './LabResults.jsx'
import Icon from '../ui/Icon.jsx'
import { useLang, useT } from '../context/LanguageContext.jsx'
import { WHOOP, WHOOP_DAYS, SLEEP_STAGES, recoveryColor, fmtHm } from '../utils/whoop.js'
import { loadSourcePref, saveSourcePref, resolveSource, hasWhoopData, hasGarminData } from '../utils/healthSource.js'

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
    gm: { vo2: 'VO₂max', vo2sub: 'мл/кг/мин', age: 'Фитнес-возраст', ageSub: 'лет', rhr: 'Пульс покоя · Garmin', rhrSub: 'уд/мин', bb: 'Body Battery', stress: 'Стресс', status: 'Статус тренировок', load: 'Нагрузка (load)' },
    srcTitle: 'Источник', srcAuto: 'Авто', srcWhoop: 'Whoop', srcGarmin: 'Garmin',
    srcActive: (s) => `Данные по ${s}`,
    garminMode: 'Показатели по Garmin. Восстановление и детальный сон появятся при подключении Whoop.',
    noSourceTitle: 'Нет данных о здоровье',
    noSource: 'Подключите Whoop или Garmin — и здесь появятся восстановление, сон и нагрузка.',
    connectBtn: 'Подключить устройство',
    bbLabel: 'Заряд тела', stressLabel: 'Стресс', stressSub: 'за последний час', stressUpd: 'обновлено', loadLabel: 'Нагрузка',
    recoveryWord: 'Восстановление', of: 'из'
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
    gm: { vo2: 'VO₂max', vo2sub: 'ml/kg/min', age: 'Fitness age', ageSub: 'yrs', rhr: 'Resting HR · Garmin', rhrSub: 'bpm', bb: 'Body Battery', stress: 'Stress', status: 'Training status', load: 'Training load' },
    srcTitle: 'Source', srcAuto: 'Auto', srcWhoop: 'Whoop', srcGarmin: 'Garmin',
    srcActive: (s) => `Data from ${s}`,
    garminMode: 'Metrics from Garmin. Recovery and detailed sleep will appear once Whoop is connected.',
    noSourceTitle: 'No health data',
    noSource: 'Connect Whoop or Garmin to see recovery, sleep and load here.',
    connectBtn: 'Connect a device',
    bbLabel: 'Body Battery', stressLabel: 'Stress', stressSub: 'last hour', stressUpd: 'updated', loadLabel: 'Load',
    recoveryWord: 'Recovery', of: 'of'
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

  // Приоритет источника: Whoop → Garmin (с ручным оверрайдом). Экран меняется под источник.
  const [sourcePref, setSourcePref] = useState(loadSourcePref)
  const hasW = hasWhoopData(live)
  const hasG = hasGarminData(garmin)
  const source = resolveSource(sourcePref, live, garmin)   // 'whoop' | 'garmin' | null
  function pickSource(v) { setSourcePref(v); saveSourcePref(v) }

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

  // Метрики Garmin — только реально присутствующие (VO2max и т.д.).
  // Body Battery и стресс показываем кольцами (см. ниже), поэтому в сетку карточек НЕ дублируем.
  const G = t.gm
  const bb = garmin?.bodyBattery, str = garmin?.stress
  // Близко к «сейчас»: среднее за последний час → последний замер → среднее дня.
  // Облачный Garmin обновляется только при синке часов, поэтому подписываем время последнего замера.
  const stressVal = str ? (str.recent ?? str.current ?? str.avg) : null
  const stressAt = str?.currentTs ? new Date(str.currentTs) : null
  const stressSub = stressAt
    ? `${t.stressUpd} ${stressAt.toLocaleTimeString(lang === 'en' ? 'en-GB' : 'ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })}`
    : t.stressSub
  const garminMetrics = [
    garmin?.vo2Max != null && { val: `${garmin.vo2Max}`, lbl: G.vo2, sub: G.vo2sub },
    garmin?.fitnessAge != null && { val: `${garmin.fitnessAge}`, lbl: G.age, sub: G.ageSub },
    garmin?.restingHr != null && { val: `${garmin.restingHr}`, lbl: G.rhr, sub: G.rhrSub },
    garmin?.trainingStatus && { val: (typeof garmin.trainingStatus === 'string' ? garmin.trainingStatus : (garmin.trainingStatus.statusRu || garmin.trainingStatus.status || '—')), lbl: G.status }
  ].filter(Boolean)

  // Стресс для кольца Garmin: ниже — лучше
  const stressColor = v => v <= 25 ? 'var(--green)' : v <= 50 ? 'var(--yellow)' : v <= 75 ? 'var(--orange)' : 'var(--red)'
  const bbColor = v => v >= 50 ? 'var(--green)' : v >= 25 ? 'var(--yellow)' : 'var(--red)'

  // Данные для виджета «Восстановление ↔ Нагрузка» под текущий источник
  const strainMaxW = w.strainMax || 21
  const balance = source === 'whoop'
    ? { recovery: w.recovery, recoveryLabel: t.recoveryWord, load: (w.strain / strainMaxW) * 100, loadDisplay: `${w.strain} ${t.of} ${strainMaxW}`, loadLabel: t.loadLabel }
    : source === 'garmin' && bb?.current != null && stressVal != null
      ? { recovery: bb.current, recoveryLabel: t.bbLabel, load: stressVal, loadDisplay: `${stressVal} /100`, loadLabel: t.stressLabel }
      : null

  // Сегменты переключателя источника
  const srcSegs = [
    { key: 'auto', lbl: t.srcAuto },
    { key: 'whoop', lbl: t.srcWhoop, disabled: !hasW },
    { key: 'garmin', lbl: t.srcGarmin, disabled: !hasG }
  ]

  return (
    <div className="metrics-view">
      {/* Переключатель источника: Whoop → Garmin. Экран ниже меняется под выбранный источник. */}
      {(hasW || hasG) && (
        <div className="src-switch">
          <span className="src-title">{t.srcTitle}</span>
          <div className="src-segs">
            {srcSegs.map(s => (
              <button key={s.key} type="button" disabled={s.disabled}
                className={`src-seg ${sourcePref === s.key ? 'on' : ''}`}
                onClick={() => pickSource(s.key)}>{s.lbl}</button>
            ))}
          </div>
          {source && <span className="src-badge">{t.srcActive(source === 'whoop' ? 'Whoop' : 'Garmin')}</span>}
        </div>
      )}

      {source === 'whoop' && (<>
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

        {/* Восстановление ↔ Нагрузка (сопоставление ёмкости и нагрузки) */}
        {balance && <RecoveryBalance {...balance} />}

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
      </>)}

      {source === 'garmin' && (<>
        {/* Garmin-режим: заряд тела + стресс кольцами (сна/recovery в API Garmin нет) */}
        <motion.div className="card recovery-card"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="garmin-rings">
            {bb?.current != null && (
              <CircularChart value={bb.current} label={t.bbLabel} color={bbColor(bb.current)} size={124}
                sublabel={(bb.charged != null || bb.drained != null)
                  ? `${bb.charged != null ? '+' + bb.charged : ''}${bb.drained != null ? ' −' + bb.drained : ''}`.trim()
                  : null} />
            )}
            {stressVal != null && (
              <CircularChart value={stressVal} label={t.stressLabel} color={stressColor(stressVal)} size={124}
                centerText={`${stressVal}`} sublabel={stressSub} />
            )}
          </div>
          <p className="rc-text muted">{t.garminMode}</p>
        </motion.div>

        {/* Восстановление ↔ Нагрузка (заряд тела ↔ стресс) */}
        {balance && <RecoveryBalance {...balance} />}
      </>)}

      {source === null && (
        <div className="card metrics-whoop-off">
          <span className="mwo-icon"><Icon name="health" size={26} color="var(--accent)" /></span>
          <div className="mwo-text">
            <div className="mwo-title">{t.noSourceTitle}</div>
            <p className="mwo-sub">{t.noSource}</p>
          </div>
          <Button variant="primary" onClick={() => navigate('/connections')}>{t.connectBtn}</Button>
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

        /* Переключатель источника Whoop/Garmin */
        .src-switch { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .src-title { font-size: 13px; font-weight: 600; color: var(--muted-foreground); }
        .src-segs { display: inline-flex; padding: 3px; border-radius: 999px; background: var(--bg-tile, var(--bg-secondary)); box-shadow: var(--inset-tile); border: 1px solid var(--border-med, var(--border)); }
        .src-seg { padding: 6px 14px; border-radius: 999px; border: none; background: transparent; color: var(--muted-foreground); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: color .15s, background .15s; }
        .src-seg:disabled { opacity: .4; cursor: not-allowed; }
        .src-seg.on { background: var(--accent); color: var(--on-accent, #fff); }
        .src-badge { font-size: 12px; font-weight: 600; color: var(--accent); }

        .garmin-rings { display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; }
        @media (max-width: 520px) { .garmin-rings { gap: 16px; } }
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
        /* flex-wrap + min-width:0 + minmax(0,1fr): кольцо и фазы сна никогда не вылезают
           за карточку — на узком фазы переносятся под кольцо, колонки легенды сжимаемы. */
        .sleep-body { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; }
        .sleep-stages { flex: 1 1 260px; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
        .stage-bar { display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: var(--bg-secondary); }
        .stage-seg { height: 100%; transition: width 0.4s; }
        .stage-legend { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; }
        .stage-leg { display: flex; align-items: center; gap: 8px; font-size: 13px; min-width: 0; }
        .stage-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .stage-leg-lbl { color: var(--muted-foreground); min-width: 0; overflow-wrap: anywhere; }
        .stage-leg-val { margin-left: auto; padding-left: 6px; color: var(--foreground); font-weight: 600; white-space: nowrap; }
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
        /* Телефон: «Показатели» не должны листаться по горизонтали — сон в стопку
           (кольцо качества над фазами), сетки сжимаемы (minmax). */
        @media (max-width: 640px) {
          .sleep-body { flex-direction: column; align-items: stretch; gap: 18px; }
          .sleep-stages { min-width: 0; }
          .rc-metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
          .stage-legend { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; }
        }
      `}</style>
    </div>
  )
}
