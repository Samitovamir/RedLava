import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import CircularChart from '../components/CircularChart.jsx'
import AiRefreshButton from '../components/AiRefreshButton.jsx'
import ConnectPrompt from '../components/ConnectPrompt.jsx'
import GarminLive from '../components/GarminLive.jsx'
import MicButton from '../components/MicButton.jsx'
import { useAiSummary } from '../hooks/useAiSummary.js'
import { useAgent } from '../hooks/useAgent.js'
import { useSiteSnapshot } from '../hooks/useSiteSnapshot.js'
import { useT, useLang } from '../context/LanguageContext.jsx'
import {
  WORKOUTS, WORKOUT_TYPES, WEEK_STATS, TYPE_DISTRIBUTION, formatWorkoutDate,
  GARMIN, HR_ZONE_LABELS, HR_ZONE_COLORS, ZONE_MAX_HR
} from '../utils/workouts.js'

// HR-зоны и типы тренировок приходят из utils/workouts.js на русском.
// Локальная карта ru→en, чтобы не трогать общий util-файл. Формат повторяет
// «Зона N · Название» (код берёт первую часть через split(' · ')).
const HR_ZONE_LABELS_EN = ['Zone 1 · Warm up', 'Zone 2 · Easy', 'Zone 3 · Aerobic', 'Zone 4 · Threshold', 'Zone 5 · Maximum']
const WORKOUT_TYPE_LABELS_EN = {
  run: 'Running', bike: 'Cycling', swim: 'Swimming', gym: 'Strength', walk: 'Walking'
}

// Зона пульса (0–4) по доле от максимального пульса
function hrZoneOf(v, maxHr) {
  const r = v / maxHr
  if (r < 0.6) return 0
  if (r < 0.7) return 1
  if (r < 0.8) return 2
  if (r < 0.9) return 3
  return 4
}

const ZONE_INNER_BOUNDS = [0.6, 0.7, 0.8, 0.9]  // внутренние границы зон (доля от max)

// Формат времени из секунд → M:SS
function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// График пульса: цвет линии строго следует зоне пульса.
// Сегмент режется ровно на границе зоны → цвет всегда соответствует высоте.
function HrSparkline({ data, zoneMax, duration, zoneLabels = HR_ZONE_LABELS, t }) {
  const w = 300, h = 90, padX = 4, padT = 12, padB = 6
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const avg = Math.round(data.reduce((a, b) => a + b, 0) / data.length)
  const xAt = i => padX + (i / (data.length - 1)) * (w - padX * 2)
  const yAt = v => padT + (1 - (v - min) / range) * (h - padT - padB)
  const mhr = zoneMax || max
  const maxI = data.indexOf(max), minI = data.indexOf(min)
  const peakColor = HR_ZONE_COLORS[hrZoneOf(max, mhr)]
  const lowColor = HR_ZONE_COLORS[hrZoneOf(min, mhr)]
  const usedZones = [...new Set(data.map(v => hrZoneOf(v, mhr)))].sort((a, b) => a - b)

  // Построить под-сегменты: каждый внутри одной зоны
  const segs = []
  for (let i = 0; i < data.length - 1; i++) {
    const a = data[i], b = data[i + 1]
    const xa = xAt(i), xb = xAt(i + 1)
    const lo = Math.min(a, b), hi = Math.max(a, b)
    const crosses = ZONE_INNER_BOUNDS
      .map(f => f * mhr)
      .filter(hr => hr > lo && hr < hi)
      .sort((p, q) => p - q)
    const ordered = a <= b ? crosses : crosses.reverse()
    let curH = a, curX = xa
    for (const stopH of [...ordered, b]) {
      const x = xa + ((stopH - a) / (b - a || 1)) * (xb - xa)
      const midH = (curH + stopH) / 2
      segs.push({ x1: curX, y1: yAt(curH), x2: x, y2: yAt(stopH), c: HR_ZONE_COLORS[hrZoneOf(midH, mhr)] })
      curH = stopH; curX = x
    }
  }

  return (
    <div className="hr-wrap">
      <div className="hr-axis">
        <span>{max}</span><span>{avg}</span><span>{min}</span>
      </div>
      <div className="hr-plot">
        <svg className="hr-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          {/* линия среднего */}
          <line x1={padX} y1={yAt(avg)} x2={w - padX} y2={yAt(avg)} stroke="var(--muted-foreground)" strokeWidth="1" strokeDasharray="3 4" opacity="0.4" />
          {/* сегменты линии, окрашенные строго по зоне пульса */}
          {segs.map((s, i) => (
            <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke={s.c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {/* точки пика и минимума — HTML-наложение, чтобы круги не растягивались */}
        <span className="hr-dot peak" style={{ left: `${xAt(maxI) / w * 100}%`, top: `${yAt(max) / h * 100}%`, background: peakColor }} />
        <span className="hr-dot low" style={{ left: `${xAt(minI) / w * 100}%`, top: `${yAt(min) / h * 100}%`, borderColor: lowColor }} />
      </div>
      {duration > 0 && (
        <div className="hr-xaxis">
          {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
            <span key={i}>{fmtTime(f * duration * 60)}</span>
          ))}
        </div>
      )}
      <div className="hr-meta">
        <span><b style={{ color: peakColor }}>{max}</b> {t.max}</span>
        <span><b>{avg}</b> {t.avg}</span>
        <span><b>{min}</b> {t.min}</span>
      </div>
      <div className="hr-zones-legend">
        {usedZones.map(z => (
          <span key={z} className="hr-zl-item">
            <span className="hr-zl-dot" style={{ background: HR_ZONE_COLORS[z] }} />
            {zoneLabels[z].split(' · ')[0]}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function Sport() {
  const { lang } = useLang()
  const t = useT({
    ru: {
      header: 'Спорт', source: 'Garmin Connect',
      notConnectedTitle: 'Garmin не подключён',
      notConnectedText: 'Подключите Garmin, чтобы видеть тренировки, пульс, шаги и активность. Сейчас данных о спорте нет.',
      // HrSparkline
      max: 'макс', avg: 'средний', min: 'мин',
      // last workout
      avgHr: 'ср. пульс', maxHr: 'макс. пульс', kcal: 'ккал', minutes: 'минут',
      hrDuringWorkout: 'Пульс во время тренировки', score: '/10',
      paceKm: 'темп /км', cadence: 'каденс', elevationGain: 'набор высоты',
      aerobicEffect: 'аэробный эффект', anaerobicEffect: 'анаэроб. эффект',
      timeInZones: 'Время в зонах пульса',
      // ai trainer
      aiBadge: 'ИИ', trainer: 'Тренер', analyzing: 'ИИ разбирает тренировку…',
      thinking: 'думает…', errorReply: 'Ошибка ответа',
      noServer: 'Нет связи с сервером. Запустите backend.',
      placeholder: 'Скажите или спросите тренера…',
      suggest1: 'Как мне восстановиться?', suggest2: 'Что тренировать завтра?', suggest3: 'Разбери мой пульс',
      // sections
      recentWorkouts: 'Последние тренировки',
      activityWeek: 'Активность за неделю', predominant: 'Преобладает: ',
      inTargetZone: 'В целевой зоне пульса', avgShort: 'ср',
      more: 'Подробнее', close: 'Закрыть', gotIt: 'Понятно',
      fitnessRecovery: 'Форма и восстановление',
      // garmin rings
      bodyBattery: 'Body Battery', peak: 'пик',
      stress: 'Стресс', stressRest: 'покой', stressLow: 'низкий', stressMid: 'средний',
      steps: 'Шаги', goal: 'цель',
      intensityMin: 'Минуты интенсивности',
      whatIsThis: 'Что это значит?',
      // gm metrics
      vo2maxSub: 'мл/кг/мин',
      fitnessAge: 'Фитнес-возраст', years: 'лет',
      restingHr: 'Пульс покоя', bpm: 'уд/мин',
      hrvSub: 'мс',
      trainingStatus: 'Статус тренировок', load: 'нагрузка',
      recoveryTime: 'До восстановления', recoverySub: 'после нагрузки', hours: 'ч',
      spo2Sub: 'сатурация',
      respiration: 'Дыхание', respSub: 'вдох/мин',
      sleepScore: 'Оценка сна', sleepSub: 'из 100',
      floors: 'Этажи',
      // training load
      trainingLoad7d: 'Тренировочная нагрузка (7 дней)',
      optimum: 'Оптимум', now: 'Сейчас',
      belowNorm: 'ниже нормы', aboveNorm: 'выше нормы', inNorm: 'в норме',
      // week summary
      weekSummary: 'Итоги недели',
      workoutsCount: 'тренировок', totalTime: 'общее время', hoursShort: 'ч',
      kcalBurned: 'ккал сожжено', avgHrLong: 'средний пульс',
      // detail modals
      workoutTypes: 'Типы тренировок', hrZones: 'Зоны пульса',
      // metric descriptions (for AI explain)
      descVo2: 'максимальное потребление кислорода, главный показатель аэробной выносливости',
      descFitAge: 'насколько тело «моложе» или «старше» паспортного возраста по физической форме',
      descRhr: 'частота пульса в полном покое, чем ниже — тем тренированнее сердце',
      descHrv: 'вариабельность сердечного ритма, показатель восстановления и стресса',
      descStatus: 'оценка Garmin: растёт форма, поддерживается или идёт перетрен',
      descRecovery: 'сколько часов нужно отдохнуть до следующей тяжёлой тренировки',
      descSpo2: 'насыщение крови кислородом',
      descResp: 'частота дыхания в покое',
      descSleep: 'качество сна по фазам, пульсу и движению',
      descFloors: 'сколько этажей пройдено вверх за день',
      descBodyBattery: 'запас энергии тела 0–100 по данным пульса, стресса и сна',
      descStress: 'уровень стресса 0–100 по вариабельности пульса, чем ниже тем спокойнее',
      descSteps: 'пройдено шагов за день относительно цели',
      descIntensity: 'минуты средней и высокой нагрузки за неделю, ВОЗ советует 150+',
      of: 'из'
    },
    en: {
      header: 'Sport', source: 'Garmin Connect',
      notConnectedTitle: 'Garmin not connected',
      notConnectedText: 'Connect Garmin to see your workouts, heart rate, steps and activity. There is no sport data yet.',
      // HrSparkline
      max: 'max', avg: 'avg', min: 'min',
      // last workout
      avgHr: 'avg HR', maxHr: 'max HR', kcal: 'kcal', minutes: 'minutes',
      hrDuringWorkout: 'Heart rate during workout', score: '/10',
      paceKm: 'pace /km', cadence: 'cadence', elevationGain: 'elevation gain',
      aerobicEffect: 'aerobic effect', anaerobicEffect: 'anaerobic effect',
      timeInZones: 'Time in heart rate zones',
      // ai trainer
      aiBadge: 'AI', trainer: 'Coach', analyzing: 'AI is analyzing your workout…',
      thinking: 'thinking…', errorReply: 'Reply error',
      noServer: 'No connection to the server. Start the backend.',
      placeholder: 'Tell or ask your coach…',
      suggest1: 'How do I recover?', suggest2: 'What should I train tomorrow?', suggest3: 'Analyze my heart rate',
      // sections
      recentWorkouts: 'Recent workouts',
      activityWeek: 'Weekly activity', predominant: 'Predominant: ',
      inTargetZone: 'In target heart rate zone', avgShort: 'avg',
      more: 'Details', close: 'Close', gotIt: 'Got it',
      fitnessRecovery: 'Fitness & recovery',
      // garmin rings
      bodyBattery: 'Body Battery', peak: 'peak',
      stress: 'Stress', stressRest: 'rest', stressLow: 'low', stressMid: 'medium',
      steps: 'Steps', goal: 'goal',
      intensityMin: 'Intensity minutes',
      whatIsThis: 'What does this mean?',
      // gm metrics
      vo2maxSub: 'ml/kg/min',
      fitnessAge: 'Fitness age', years: 'yrs',
      restingHr: 'Resting HR', bpm: 'bpm',
      hrvSub: 'ms',
      trainingStatus: 'Training status', load: 'load',
      recoveryTime: 'Recovery time', recoverySub: 'after the load', hours: 'h',
      spo2Sub: 'oxygen saturation',
      respiration: 'Respiration', respSub: 'breaths/min',
      sleepScore: 'Sleep score', sleepSub: 'out of 100',
      floors: 'Floors',
      // training load
      trainingLoad7d: 'Training load (7 days)',
      optimum: 'Optimal', now: 'Now',
      belowNorm: 'below range', aboveNorm: 'above range', inNorm: 'in range',
      // week summary
      weekSummary: 'Weekly summary',
      workoutsCount: 'workouts', totalTime: 'total time', hoursShort: 'h',
      kcalBurned: 'kcal burned', avgHrLong: 'average heart rate',
      // detail modals
      workoutTypes: 'Workout types', hrZones: 'Heart rate zones',
      // metric descriptions (for AI explain)
      descVo2: 'maximal oxygen uptake, the key indicator of aerobic endurance',
      descFitAge: 'how much "younger" or "older" your body is than your calendar age based on fitness',
      descRhr: 'heart rate at full rest, the lower it is the more trained the heart',
      descHrv: 'heart rate variability, an indicator of recovery and stress',
      descStatus: 'Garmin assessment: fitness building, maintaining or overreaching',
      descRecovery: 'how many hours to rest before the next hard workout',
      descSpo2: 'blood oxygen saturation',
      descResp: 'breathing rate at rest',
      descSleep: 'sleep quality by stages, heart rate and movement',
      descFloors: 'how many floors climbed during the day',
      descBodyBattery: "body's energy reserve 0–100 based on heart rate, stress and sleep",
      descStress: 'stress level 0–100 based on heart rate variability, the lower the calmer',
      descSteps: 'steps taken during the day relative to the goal',
      descIntensity: 'minutes of moderate and high intensity per week, WHO recommends 150+',
      of: 'of'
    }
  })
  const zoneLabels = lang === 'en' ? HR_ZONE_LABELS_EN : HR_ZONE_LABELS
  const typeLabel = type => (lang === 'en' ? (WORKOUT_TYPE_LABELS_EN[type] || WORKOUT_TYPES[type]?.label) : WORKOUT_TYPES[type]?.label)

  // Garmin пока не подключён → показываем «Подключите Garmin», без выдуманных данных
  let garminConnected = false
  try { garminConnected = !!localStorage.getItem('albert-garmin-live') } catch { /* ignore */ }

  const last = WORKOUTS[0]
  const lastType = WORKOUT_TYPES[last.type]
  const [openDetail, setOpenDetail] = useState(null)

  // Пояснение показателя от ИИ
  const [explain, setExplain] = useState(null)        // { title, value } выбранного показателя
  const [explainText, setExplainText] = useState('')
  const [explainLoading, setExplainLoading] = useState(false)

  // Показатели формы и восстановления (Garmin) — для рендера и пояснений
  const GM_METRICS = [
    { key: 'vo2max', val: GARMIN.vo2max, lbl: 'VO₂ Max', sub: t.vo2maxSub, desc: t.descVo2 },
    { key: 'fitage', val: GARMIN.fitnessAge, lbl: t.fitnessAge, sub: t.years, desc: t.descFitAge },
    { key: 'rhr', val: GARMIN.restingHr, lbl: t.restingHr, sub: t.bpm, desc: t.descRhr },
    { key: 'hrv', val: GARMIN.hrv, lbl: 'HRV', sub: t.hrvSub, desc: t.descHrv },
    { key: 'status', val: GARMIN.trainingStatus, lbl: t.trainingStatus, sub: `${t.load} ${GARMIN.trainingLoad}`, accent: true, desc: t.descStatus },
    { key: 'recovery', val: `${GARMIN.recoveryTime} ${t.hours}`, lbl: t.recoveryTime, sub: t.recoverySub, desc: t.descRecovery },
    { key: 'spo2', val: `${GARMIN.spo2}%`, lbl: 'SpO₂', sub: t.spo2Sub, desc: t.descSpo2 },
    { key: 'resp', val: GARMIN.respiration, lbl: t.respiration, sub: t.respSub, desc: t.descResp },
    { key: 'sleep', val: GARMIN.sleepScore, lbl: t.sleepScore, sub: t.sleepSub, desc: t.descSleep },
    { key: 'floors', val: GARMIN.floors, lbl: t.floors, sub: `${t.goal} ${GARMIN.floorsGoal}`, desc: t.descFloors }
  ]

  async function askExplain(m) {
    setExplain({ title: m.lbl, value: m.val })
    setExplainText('')
    setExplainLoading(true)
    const context =
      `Ты спортивный тренер. Объясни простыми словами для 50-летнего человека без спортивного образования. ` +
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
      setExplainText(data.reply || (lang === 'en' ? 'Could not get an explanation.' : 'Не удалось получить пояснение.'))
    } catch {
      setExplainText(lang === 'en'
        ? 'No connection to the server. Start the backend to get an AI explanation.'
        : 'Нет связи с сервером. Запустите backend, чтобы получить пояснение от ИИ.')
    }
    setExplainLoading(false)
  }

  // Чат с тренером
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const msgsRef = useRef(null)

  const snapshot = useSiteSnapshot()
  const { ask: askAgent } = useAgent()
  const TRAINER_CONTEXT =
    `Ты личный спортивный тренер владельца. Твоя зона — тренировки, нагрузка, восстановление, форма. ` +
    `ФОКУСИРУЙСЯ на спорте и не уходи в чужие темы (письма, дела, не относящиеся к спорту), но ты ВИДИШЬ весь контекст ` +
    `(сон, восстановление, расписание, анализы) и учитываешь его, чтобы советы были связными. ` +
    `Давай краткие дельные советы на русском. Учитывай предпочтения из памяти.` +
    (lang === 'en' ? ' Always reply to the user in English.' : '')

  // ИИ-разбор последней тренировки (с кэшем; aiComment — фолбэк)
  const trainerSummary = useAiSummary({
    id: 'trainer',
    context: TRAINER_CONTEXT,
    snapshot,
    message: 'Разбери последнюю тренировку в 2–3 предложениях: что хорошо, на что обратить внимание и что делать дальше. Без приветствия.',
    fallback: last.aiComment
  })

  useEffect(() => {
    // скроллим только окно сообщений, не всю страницу
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight
  }, [messages, loading])

  async function sendTrainer() {
    if (!input.trim() || loading) return
    const q = input.trim()
    const priorHistory = messages
    setInput('')
    setMessages(m => [...m, { role: 'user', text: q }])
    setLoading(true)
    const { reply, error } = await askAgent({ message: q, snapshot, history: priorHistory, context: TRAINER_CONTEXT })
    setMessages(m => [...m, { role: 'assistant', text: error ? t.noServer : (reply || t.errorReply) }])
    setLoading(false)
  }

  if (!garminConnected) {
    return (
      <ConnectPrompt
        heading={t.header}
        sub={t.source}
        title={t.notConnectedTitle}
        text={t.notConnectedText}
      />
    )
  }

  // Garmin подключён → реальные данные
  return <GarminLive />

  // (ниже — старый демо-вид, не используется)
  // eslint-disable-next-line no-unreachable
  return (
    <div className="sport-page">
      <div className="page-header">
        <h2>{t.header}</h2>
        <span className="muted">{t.source}</span>
      </div>

      {/* Верх: последняя тренировка + комментарий ИИ */}
      <div className="sport-top">
        <motion.div className="card last-workout"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="lw-head">
            <span className="lw-icon" style={{ background: lastType.color }}>{lastType.emoji}</span>
            <div>
              <div className="lw-type">{typeLabel(last.type)}{last.distance ? ` · ${last.distance} ${lang === 'en' ? 'km' : 'км'}` : ''}</div>
              <div className="lw-date muted">{formatWorkoutDate(last.date)} · {last.duration} {lang === 'en' ? 'min' : 'мин'}</div>
            </div>
            <div className="lw-score">
              <span className="lw-score-val">{last.score}</span>
              <span className="lw-score-max">{t.score}</span>
            </div>
          </div>

          <div className="lw-metrics">
            <div className="lw-metric"><span className="lw-m-val">{last.avgHr}</span><span className="lw-m-lbl">{t.avgHr}</span></div>
            <div className="lw-metric"><span className="lw-m-val">{last.maxHr}</span><span className="lw-m-lbl">{t.maxHr}</span></div>
            <div className="lw-metric"><span className="lw-m-val">{last.calories}</span><span className="lw-m-lbl">{t.kcal}</span></div>
            <div className="lw-metric"><span className="lw-m-val">{last.duration}</span><span className="lw-m-lbl">{t.minutes}</span></div>
          </div>

          <div className="lw-chart">
            <span className="lw-chart-title">{t.hrDuringWorkout}</span>
            <HrSparkline data={last.hr} zoneMax={ZONE_MAX_HR} duration={last.duration} zoneLabels={zoneLabels} t={t} />
          </div>

          {/* Доп. метрики тренировки (Garmin) */}
          {(last.pace || last.cadence || last.elevation) && (
            <div className="lw-extra">
              {last.pace && <div className="lw-x"><span className="lw-x-val">{last.pace}</span><span className="lw-x-lbl">{t.paceKm}</span></div>}
              {last.cadence && <div className="lw-x"><span className="lw-x-val">{last.cadence}</span><span className="lw-x-lbl">{t.cadence}</span></div>}
              {last.elevation != null && <div className="lw-x"><span className="lw-x-val">{last.elevation} {lang === 'en' ? 'm' : 'м'}</span><span className="lw-x-lbl">{t.elevationGain}</span></div>}
              {last.aerobicTE && <div className="lw-x"><span className="lw-x-val">{last.aerobicTE}</span><span className="lw-x-lbl">{t.aerobicEffect}</span></div>}
              {last.anaerobicTE && <div className="lw-x"><span className="lw-x-val">{last.anaerobicTE}</span><span className="lw-x-lbl">{t.anaerobicEffect}</span></div>}
            </div>
          )}

          {/* Время в зонах пульса */}
          {last.zones && (
            <div className="lw-zones">
              <span className="lw-chart-title">{t.timeInZones}</span>
              <div className="zone-bar">
                {last.zones.map((z, i) => z > 0 && (
                  <div key={i} className="zone-seg" style={{ width: `${z}%`, background: HR_ZONE_COLORS[i] }} title={`${zoneLabels[i]} — ${z}%`} />
                ))}
              </div>
              <div className="zone-legend">
                {last.zones.map((z, i) => (
                  <div key={i} className="zone-leg-item">
                    <span className="zone-dot" style={{ background: HR_ZONE_COLORS[i] }} />
                    <span className="zone-leg-lbl">{zoneLabels[i].split(' · ')[0]}</span>
                    <span className="zone-leg-pct">{z}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        <motion.div className="card ai-trainer"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08 }}>
          <div className="summary-head">
            <span className="summary-badge">{t.aiBadge}</span>
            <div className="card-title" style={{ margin: 0 }}>{t.trainer}</div>
            <AiRefreshButton onClick={trainerSummary.refresh} loading={trainerSummary.loading} />
          </div>
          <p className="trainer-text">{trainerSummary.loading ? t.analyzing : trainerSummary.text}</p>

          {/* Чат с тренером */}
          <div className="trainer-chat">
            {messages.length > 0 && (
              <div className="tc-msgs" ref={msgsRef}>
                {messages.map((m, i) => <div key={i} className={`tc-msg ${m.role}`}>{m.text}</div>)}
                {loading && <div className="tc-msg assistant thinking">{t.thinking}</div>}
              </div>
            )}
            {messages.length === 0 && (
              <div className="tc-suggests">
                {[t.suggest1, t.suggest2, t.suggest3].map(s => (
                  <button key={s} className="tc-suggest" onClick={() => setInput(s)}>{s}</button>
                ))}
              </div>
            )}
            <div className="tc-input-row">
              <MicButton primary onText={txt => setInput(prev => (prev ? prev.trim() + ' ' : '') + txt)} />
              <input className="tc-input" placeholder={t.placeholder} value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendTrainer() } }} />
              <button className="tc-send" onClick={sendTrainer} disabled={loading || !input.trim()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Середина: последние тренировки */}
      <div className="sport-recent">
        <div className="card-title">{t.recentWorkouts}</div>
        <div className="recent-scroll">
          {WORKOUTS.map((w, i) => {
            const wt = WORKOUT_TYPES[w.type]
            return (
              <motion.div key={w.id} className="card recent-card"
                initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: 0.04 * i }}>
                <span className="recent-icon" style={{ background: wt.color }}>{wt.emoji}</span>
                <div className="recent-type">{typeLabel(w.type)}</div>
                <div className="recent-meta muted">{formatWorkoutDate(w.date)}</div>
                <div className="recent-stats">
                  {w.distance && <span>{w.distance} {lang === 'en' ? 'km' : 'км'}</span>}
                  <span>{w.duration} {lang === 'en' ? 'min' : 'мин'}</span>
                  <span>❤ {w.avgHr}</span>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Низ: круговые диаграммы */}
      <div className="sport-charts">
        <div className="card chart-card">
          <CircularChart value={WEEK_STATS.activityPercent} label={t.activityWeek} color="var(--green)" />
          <button className="detail-btn" onClick={() => setOpenDetail('activity')}>{t.more}</button>
        </div>
        <div className="card chart-card">
          <CircularChart value={TYPE_DISTRIBUTION[0]?.percent || 0}
            label={t.predominant} color="var(--orange)"
            centerText={WORKOUT_TYPES[TYPE_DISTRIBUTION[0]?.type]?.emoji} sublabel={typeLabel(TYPE_DISTRIBUTION[0]?.type)} />
          <button className="detail-btn" onClick={() => setOpenDetail('types')}>{t.more}</button>
        </div>
        <div className="card chart-card">
          <CircularChart value={WEEK_STATS.hrZonePercent} label={t.inTargetZone} color="var(--accent)"
            sublabel={`${t.avgShort} ${WEEK_STATS.avgHr}`} />
          <button className="detail-btn" onClick={() => setOpenDetail('hr')}>{t.more}</button>
        </div>
      </div>

      {/* Форма и восстановление (Garmin) */}
      <div className="sport-section-title card-title">{t.fitnessRecovery}</div>

      {/* Кольца дня: Body Battery / Стресс / Шаги / Минуты интенсивности */}
      <div className="garmin-rings">
        {[
          { key: 'bb', value: GARMIN.bodyBattery, label: t.bodyBattery, color: 'var(--green)',
            sublabel: `${t.peak} ${GARMIN.bodyBatteryMax}`,
            m: { lbl: t.bodyBattery, val: GARMIN.bodyBattery, desc: t.descBodyBattery } },
          { key: 'st', value: GARMIN.stress, label: t.stress, color: 'var(--orange)',
            sublabel: GARMIN.stress < 25 ? t.stressRest : GARMIN.stress < 50 ? t.stressLow : t.stressMid,
            m: { lbl: t.stress, val: GARMIN.stress, desc: t.descStress } },
          { key: 'sp', value: Math.round(GARMIN.steps / GARMIN.stepsGoal * 100), label: t.steps, color: 'var(--accent)',
            centerText: GARMIN.steps.toLocaleString('ru-RU'), sublabel: `${t.goal} ${GARMIN.stepsGoal.toLocaleString('ru-RU')}`,
            m: { lbl: t.steps, val: `${GARMIN.steps} ${t.of} ${GARMIN.stepsGoal}`, desc: t.descSteps } },
          { key: 'im', value: Math.round(GARMIN.intensityMin / GARMIN.intensityGoal * 100), label: t.intensityMin, color: 'var(--yellow)',
            centerText: `${GARMIN.intensityMin}`, sublabel: `${t.goal} ${GARMIN.intensityGoal}`,
            m: { lbl: t.intensityMin, val: `${GARMIN.intensityMin} ${t.of} ${GARMIN.intensityGoal}`, desc: t.descIntensity } }
        ].map(r => (
          <div key={r.key} className="card chart-card sm">
            <button className="gm-help" onClick={() => askExplain(r.m)} title={t.whatIsThis}>?</button>
            <CircularChart value={r.value} label={r.label} color={r.color}
              centerText={r.centerText} sublabel={r.sublabel} />
          </div>
        ))}
      </div>

      {/* Карточки показателей */}
      <div className="garmin-metrics">
        {GM_METRICS.map(m => (
          <div key={m.key} className="card gm-card">
            <button className="gm-help" onClick={() => askExplain(m)} title={t.whatIsThis}>?</button>
            <span className={`gm-val${m.accent ? ' accent-txt' : ''}`}>{m.val}</span>
            <span className="gm-lbl">{m.lbl}</span>
            <span className="gm-sub muted">{m.sub}</span>
          </div>
        ))}
      </div>

      {/* Тренировочная нагрузка — полоса диапазона */}
      <div className="card load-card">
        <div className="card-title">{t.trainingLoad7d}</div>
        <div className="load-bar-wrap">
          {(() => {
            const [lo, hi] = GARMIN.trainingLoadOptimal
            const scaleMax = hi * 1.3
            const pct = v => Math.min(100, v / scaleMax * 100)
            return (
              <>
                <div className="load-track">
                  <div className="load-optimal" style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }} />
                  <div className="load-marker" style={{ left: `${pct(GARMIN.trainingLoad)}%` }} />
                </div>
                <div className="load-meta">
                  <span className="muted">{t.optimum} {lo}–{hi}</span>
                  <span className="load-now">{t.now} {GARMIN.trainingLoad} ·
                    <span style={{ color: GARMIN.trainingLoad >= lo && GARMIN.trainingLoad <= hi ? 'var(--green)' : 'var(--yellow)' }}>
                      {' '}{GARMIN.trainingLoad < lo ? t.belowNorm : GARMIN.trainingLoad > hi ? t.aboveNorm : t.inNorm}
                    </span>
                  </span>
                </div>
              </>
            )
          })()}
        </div>
      </div>

      {/* Сводка недели */}
      <div className="card week-summary">
        <div className="card-title">{t.weekSummary}</div>
        <div className="week-stats">
          <div className="week-stat"><span className="ws-val">{WEEK_STATS.workoutsCount}</span><span className="ws-lbl">{t.workoutsCount}</span></div>
          <div className="week-stat"><span className="ws-val">{Math.round(WEEK_STATS.totalMinutes / 60 * 10) / 10}{t.hoursShort}</span><span className="ws-lbl">{t.totalTime}</span></div>
          <div className="week-stat"><span className="ws-val">{WEEK_STATS.totalCalories}</span><span className="ws-lbl">{t.kcalBurned}</span></div>
          <div className="week-stat"><span className="ws-val">{WEEK_STATS.avgHr}</span><span className="ws-lbl">{t.avgHrLong}</span></div>
        </div>
      </div>

      {/* Окно "Подробнее" */}
      {openDetail && (
        <div className="detail-backdrop" onClick={() => setOpenDetail(null)}>
          <motion.div className="card detail-modal" onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <h3>
              {openDetail === 'activity' && t.activityWeek}
              {openDetail === 'types' && t.workoutTypes}
              {openDetail === 'hr' && t.hrZones}
            </h3>
            <p className="trainer-text">
              {openDetail === 'activity' && (lang === 'en'
                ? `You completed ${WEEK_STATS.activityPercent}% of your weekly activity goal — a great result. Add one more easy workout to reach 100%.`
                : `Ты выполнил ${WEEK_STATS.activityPercent}% недельной цели активности — отличный результат. Для 100% добавь ещё одну лёгкую тренировку.`)}
              {openDetail === 'types' && (lang === 'en'
                ? `This week is dominated by ${(typeLabel(TYPE_DISTRIBUTION[0]?.type) || '').toLowerCase()}. For balance, add more cardio or stretching.`
                : `За неделю преобладает ${WORKOUT_TYPES[TYPE_DISTRIBUTION[0]?.type]?.label.toLowerCase()}. Для баланса добавь больше кардио или растяжки.`)}
              {openDetail === 'hr' && (lang === 'en'
                ? `You spent ${WEEK_STATS.hrZonePercent}% of the time in your target heart rate zone. That is a good balance between load and recovery.`
                : `${WEEK_STATS.hrZonePercent}% времени ты провёл в целевой зоне пульса. Это хороший баланс между нагрузкой и восстановлением.`)}
            </p>
            {openDetail === 'types' && (
              <div className="type-list">
                {TYPE_DISTRIBUTION.map(td => (
                  <div key={td.type} className="type-row">
                    <span className="type-dot" style={{ background: WORKOUT_TYPES[td.type].color }} />
                    <span>{WORKOUT_TYPES[td.type].emoji} {typeLabel(td.type)}</span>
                    <span className="muted" style={{ marginLeft: 'auto' }}>{td.count} · {td.percent}%</span>
                  </div>
                ))}
              </div>
            )}
            <button className="detail-btn primary" onClick={() => setOpenDetail(null)}>{t.close}</button>
          </motion.div>
        </div>
      )}

      {/* Окно пояснения показателя от ИИ */}
      {explain && (
        <div className="detail-backdrop" onClick={() => setExplain(null)}>
          <motion.div className="card detail-modal" onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="summary-head">
              <span className="summary-badge">{t.aiBadge}</span>
              <h3 style={{ margin: 0 }}>{explain.title} · {explain.value}</h3>
            </div>
            <p className="trainer-text">
              {explainLoading ? (lang === 'en' ? 'AI is analyzing the metric…' : 'ИИ разбирается в показателе…') : explainText}
            </p>
            <button className="detail-btn primary" onClick={() => setExplain(null)}>{t.gotIt}</button>
          </motion.div>
        </div>
      )}

      <style>{`
        .sport-page { display: flex; flex-direction: column; gap: 24px; max-width: 1400px; padding-bottom: 20px; }
        .page-header { display: flex; align-items: baseline; gap: 12px; }
        .page-header h2 { font-size: 24px; font-weight: 700; }
        .muted { color: var(--muted-foreground); }

        .sport-top { display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; }
        .last-workout { display: flex; flex-direction: column; gap: 18px; }
        .lw-head { display: flex; align-items: center; gap: 14px; }
        .lw-icon {
          width: 52px; height: 52px; border-radius: 16px;
          display: flex; align-items: center; justify-content: center; font-size: 26px;
          flex-shrink: 0;
        }
        .lw-type { font-size: 18px; font-weight: 700; color: var(--foreground); }
        .lw-date { font-size: 13px; }
        .lw-score { margin-left: auto; display: flex; align-items: baseline; }
        .lw-score-val { font-size: 28px; font-weight: 800; color: var(--green); }
        .lw-score-max { font-size: 14px; color: var(--muted-foreground); }
        .lw-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .lw-metric {
          display: flex; flex-direction: column; gap: 3px;
          background: var(--bg-secondary); border-radius: 12px; padding: 12px;
        }
        .lw-m-val { font-size: 20px; font-weight: 700; color: var(--foreground); }
        .lw-m-lbl { font-size: 11px; color: var(--muted-foreground); }
        .lw-chart { display: flex; flex-direction: column; gap: 8px; }
        .lw-chart-title { font-size: 12px; color: var(--muted-foreground); text-transform: uppercase; letter-spacing: 0.05em; }
        .hr-wrap { display: grid; grid-template-columns: 32px 1fr; grid-template-rows: auto auto auto auto; gap: 4px 8px; }
        .hr-axis {
          grid-row: 1; grid-column: 1;
          display: flex; flex-direction: column; justify-content: space-between;
          font-size: 10px; color: var(--muted-foreground); text-align: right;
          padding: 10px 0 4px;
        }
        .hr-plot { grid-row: 1; grid-column: 2; position: relative; }
        .hr-spark { display: block; width: 100%; height: 90px; }
        .hr-dot {
          position: absolute; width: 8px; height: 8px; border-radius: 50%;
          transform: translate(-50%, -50%); pointer-events: none;
        }
        .hr-dot.low { background: var(--card); border: 2px solid; }
        .hr-xaxis {
          grid-row: 2; grid-column: 2;
          display: flex; justify-content: space-between;
          font-size: 10px; color: var(--muted-foreground);
        }
        .hr-xaxis span:first-child { text-align: left; }
        .hr-xaxis span:last-child { text-align: right; }
        .hr-meta {
          grid-row: 3; grid-column: 2;
          display: flex; gap: 16px; font-size: 12px; color: var(--muted-foreground);
        }
        .hr-meta b { color: var(--foreground); font-weight: 700; }
        .hr-zones-legend {
          grid-row: 4; grid-column: 2;
          display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 2px;
        }
        .hr-zl-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--muted-foreground); }
        .hr-zl-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

        .ai-trainer { display: flex; flex-direction: column; gap: 14px; }
        .summary-head { display: flex; align-items: center; gap: 10px; }
        .summary-badge {
          font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
          color: var(--primary-foreground); background: var(--primary);
          padding: 3px 8px; border-radius: 6px;
        }
        .trainer-text { font-size: 16.5px; line-height: 1.7; color: var(--foreground); white-space: pre-wrap; }

        .trainer-chat {
          margin-top: auto; display: flex; flex-direction: column; gap: 10px;
          border-top: 1px solid var(--border); padding-top: 14px;
        }
        .tc-msgs { display: flex; flex-direction: column; gap: 8px; max-height: 200px; overflow-y: auto; }
        .tc-msg { font-size: 13.5px; line-height: 1.5; padding: 9px 12px; border-radius: 12px; max-width: 90%; }
        .tc-msg.user { align-self: flex-end; background: var(--primary); color: var(--primary-foreground); border-bottom-right-radius: 4px; }
        .tc-msg.assistant { align-self: flex-start; background: var(--bg-secondary); color: var(--foreground); border-bottom-left-radius: 4px; }
        .tc-msg.thinking { color: var(--muted-foreground); font-style: italic; }
        .tc-suggests { display: flex; flex-wrap: wrap; gap: 6px; }
        .tc-suggest {
          font-size: 12px; padding: 6px 11px; border: 1px solid var(--border); background: transparent;
          color: var(--muted-foreground); border-radius: 16px; cursor: pointer; font-family: inherit; transition: all 0.15s;
        }
        .tc-suggest:hover { color: var(--primary); border-color: var(--border-hover); }
        .tc-input-row {
          display: flex; align-items: center; gap: 8px;
          background: var(--bg-secondary); border: 1px solid var(--border);
          border-radius: 12px; padding: 6px 6px 6px 14px; transition: border-color 0.2s;
        }
        .tc-input-row:focus-within { border-color: var(--border-hover); }
        .tc-input { flex: 1; border: none; background: transparent; outline: none; font-family: inherit; font-size: 13.5px; color: var(--foreground); }
        .tc-input::placeholder { color: var(--muted-foreground); }
        .tc-send {
          width: 32px; height: 32px; flex-shrink: 0; border: none; border-radius: 9px;
          background: var(--primary); color: var(--primary-foreground); cursor: pointer;
          display: flex; align-items: center; justify-content: center; transition: opacity 0.15s;
        }
        .tc-send:hover:not(:disabled) { opacity: 0.9; }
        .tc-send:disabled { opacity: 0.4; cursor: default; }

        .sport-recent { display: flex; flex-direction: column; gap: 12px; }
        .recent-scroll { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; }
        .recent-card {
          min-width: 150px; display: flex; flex-direction: column; gap: 6px;
          flex-shrink: 0;
        }
        .recent-icon {
          width: 38px; height: 38px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center; font-size: 19px;
        }
        .recent-type { font-size: 14px; font-weight: 600; color: var(--foreground); }
        .recent-meta { font-size: 12px; }
        .recent-stats { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--muted-foreground); margin-top: 2px; }

        .sport-charts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .chart-card { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 24px; }
        .detail-btn {
          padding: 8px 18px; border-radius: 10px;
          border: 1px solid var(--border); background: transparent;
          color: var(--muted-foreground); font-family: inherit; font-size: 13px; font-weight: 600;
          cursor: pointer; transition: all 0.15s;
        }
        .detail-btn:hover { color: var(--primary); border-color: var(--border-hover); }
        .detail-btn.primary { background: var(--primary); color: var(--primary-foreground); border-color: var(--primary); align-self: flex-start; }

        .week-summary { display: flex; flex-direction: column; gap: 14px; }
        .week-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .week-stat { display: flex; flex-direction: column; gap: 3px; }
        .ws-val { font-size: 22px; font-weight: 700; color: var(--foreground); }
        .ws-lbl { font-size: 12px; color: var(--muted-foreground); }

        .detail-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(3px);
          z-index: 500; display: flex; align-items: center; justify-content: center; padding: 24px;
        }
        .detail-modal { width: 100%; max-width: 460px; max-height: 85vh; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
        .detail-modal::-webkit-scrollbar { width: 8px; }
        .detail-modal::-webkit-scrollbar-thumb { background: var(--bg-secondary); border-radius: 8px; }
        .detail-modal .detail-btn.primary { position: sticky; bottom: 0; }
        .detail-modal h3 { font-size: 18px; font-weight: 700; color: var(--foreground); }
        .type-list { display: flex; flex-direction: column; gap: 8px; }
        .type-row { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--foreground); }
        .type-dot { width: 9px; height: 9px; border-radius: 50%; }

        /* Доп. метрики тренировки */
        .lw-extra { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 10px; }
        .lw-x { display: flex; flex-direction: column; gap: 2px; }
        .lw-x-val { font-size: 16px; font-weight: 700; color: var(--foreground); }
        .lw-x-lbl { font-size: 11px; color: var(--muted-foreground); }

        /* Зоны пульса */
        .lw-zones { display: flex; flex-direction: column; gap: 10px; }
        .zone-bar { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--bg-secondary); }
        .zone-seg { height: 100%; transition: width 0.4s; }
        .zone-legend { display: flex; flex-wrap: wrap; gap: 10px 16px; }
        .zone-leg-item { display: flex; align-items: center; gap: 6px; font-size: 12px; }
        .zone-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .zone-leg-lbl { color: var(--muted-foreground); }
        .zone-leg-pct { color: var(--foreground); font-weight: 600; }

        /* Секции Garmin */
        .sport-section-title { margin-top: 4px; }
        .garmin-rings { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        .chart-card.sm { position: relative; padding: 18px; gap: 12px; }

        .garmin-metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
        .gm-card { position: relative; display: flex; flex-direction: column; gap: 3px; padding: 16px; }
        .gm-help {
          position: absolute; top: 10px; right: 10px;
          width: 22px; height: 22px; border-radius: 50%;
          border: 1px solid var(--border); background: var(--bg-secondary);
          color: var(--muted-foreground); font-family: inherit; font-size: 13px; font-weight: 700;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          line-height: 1; transition: all 0.15s; opacity: 0.7;
        }
        .gm-help:hover { opacity: 1; color: var(--primary); border-color: var(--primary); }
        .gm-val { font-size: 22px; font-weight: 800; color: var(--foreground); }
        .gm-val.accent-txt { font-size: 17px; color: var(--green); }
        .gm-lbl { font-size: 13px; font-weight: 600; color: var(--foreground); }
        .gm-sub { font-size: 11px; }

        /* Тренировочная нагрузка */
        .load-card { display: flex; flex-direction: column; gap: 16px; }
        .load-bar-wrap { display: flex; flex-direction: column; gap: 10px; }
        .load-track { position: relative; height: 14px; border-radius: 7px; background: var(--bg-secondary); }
        .load-optimal { position: absolute; top: 0; height: 100%; background: rgba(126, 155, 110,0.3); border-radius: 7px; }
        .load-marker {
          position: absolute; top: 50%; width: 16px; height: 16px; border-radius: 50%;
          background: var(--primary); border: 3px solid var(--card);
          transform: translate(-50%, -50%); box-shadow: 0 0 0 1px var(--primary);
        }
        .load-meta { display: flex; justify-content: space-between; font-size: 13px; }
        .load-now { color: var(--foreground); font-weight: 600; }

        @media (max-width: 1100px) {
          .garmin-rings { grid-template-columns: repeat(2, 1fr); }
          .garmin-metrics { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>
    </div>
  )
}
