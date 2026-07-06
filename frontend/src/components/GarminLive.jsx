import { useState, useEffect } from 'react'
import { Button } from '../ui'
import { motion } from 'framer-motion'
import WorkoutModal from './WorkoutModal.jsx'
import WheelTimePicker from './WheelTimePicker.jsx'
import GarminInsights from './GarminInsights.jsx'
import { useEvents } from '../context/EventsContext.jsx'
import { isGuest } from '../api/authFetch.js'
import { demoPlanned } from '../utils/demo.js'
import { useT, useLang } from '../context/LanguageContext.jsx'
import { mskDateKey } from '../utils/time.js'
import ArcGauge from './ArcGauge.jsx'

// Ключ даты N дней назад (YYYY-MM-DD) от сегодняшней МСК-даты
function daysAgoKey(n) {
  const [y, m, d] = mskDateKey().split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - n)
  const p = x => String(x).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`
}

// Спорт-тип Garmin → локализованная подпись (для плановых тренировок)
const SPORT_LABELS = {
  ru: {
    running: 'Бег', cycling: 'Велосипед', lap_swimming: 'Плавание', swimming: 'Плавание',
    strength_training: 'Силовая', cardio: 'Кардио', walking: 'Ходьба', other: 'Тренировка'
  },
  en: {
    running: 'Running', cycling: 'Cycling', lap_swimming: 'Swimming', swimming: 'Swimming',
    strength_training: 'Strength', cardio: 'Cardio', walking: 'Walking', other: 'Workout'
  }
}
const sportLabel = (s, map, fallback) => map[s] || (s ? s.replace(/_/g, ' ') : fallback)

const hmToMin = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + (m || 0) }
const minToHm = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`

// Подобрать время тренировки: приоритет 06:30, с учётом длительности и БЕЗ наложения
// на существующие события дня. Если 06:30 занято — ближайшее свободное (сначала утро).
function proposeSlot(dateStr, durMin, events) {
  const dur = durMin || 60
  const busy = (events || []).filter(e => e.date === dateStr && e.start && e.end).map(e => [hmToMin(e.start), hmToMin(e.end)])
  const fits = s => { const e = s + dur; if (e > 22 * 60) return false; return !busy.some(([bs, be]) => s < be && e > bs) }
  const slot = s => ({ start: minToHm(s), end: minToHm(s + dur) })
  const pref = 6 * 60 + 30
  if (fits(pref)) return slot(pref)
  for (let s = pref; s <= 21 * 60 + 30; s += 15) if (fits(s)) return slot(s)   // позже утра/днём
  for (let s = 5 * 60; s < pref; s += 15) if (fits(s)) return slot(s)          // совсем рано
  return slot(pref)
}

/*
  Реальные данные Garmin: шаги, пульс покоя, VO2max, объём за неделю,
  hero-карточка последней тренировки и лента тренировок с полными метриками.
  Источник: localStorage 'albert-garmin-live' + обновление с сервера.
*/
function readLive() {
  try { const s = localStorage.getItem('albert-garmin-live'); return s ? JSON.parse(s) : null } catch { return null }
}

const MONTHS = {
  ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
}
function fmtDate(d, months = MONTHS.ru) {
  if (!d) return ''
  const [, m, day] = d.split('-')
  return `${Number(day)} ${months[Number(m) - 1]}`
}

// Русская множественная форма: тренировка / тренировки / тренировок
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

// Акцент карточек/точек видов спорта — ЕДИНЫЙ акцент темы (без разноцветья без легенды).
function typeColor() {
  return 'var(--accent)'
}

const ICON_HEART = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.3 5c2 0 3.4 1.2 4.7 2.7C11.3 6.2 12.7 5 14.7 5 18 5 19.6 8.4 22 11.7 19.5 16.4 12 21 12 21z"/>
  </svg>
)

// Метрики hero-карточки (показываем только заполненные).
// primary: ключевые метрики (Дистанция/Время/Темп) — крупнее; остальные мельче/в --muted.
// Единицы измерения — мелко у базовой линии; никакой выборочной окраски чисел (числа в --foreground).
function heroMetrics(w, t, trainingLabel) {
  const out = []
  if (w.distanceKm != null) out.push({ k: t.mDistance, v: w.distanceKm, u: t.uKm, primary: true })
  if (w.durationMin != null) out.push({ k: t.mTime, v: w.durationMin, u: t.uMin, primary: true })
  if (w.pace) out.push({ k: t.mPace, v: w.pace, u: t.uPerKm, primary: true })
  else if (w.speedKmh != null) out.push({ k: t.mSpeed, v: w.speedKmh, u: t.uKmh, primary: true })
  if (w.avgHr != null) out.push({ k: t.mAvgHr, v: w.avgHr, u: t.uBpm })
  if (w.maxHr != null) out.push({ k: t.mMaxHr, v: w.maxHr, u: t.uBpm })
  if (w.calories != null) out.push({ k: t.mCalories, v: w.calories, u: t.uKcal })
  if (w.elevationGain != null) out.push({ k: t.mElevation, v: w.elevationGain, u: t.uM })
  if (w.cadence != null) out.push({ k: t.mCadence, v: w.cadence, u: t.uSpm })
  if (w.avgPower != null) out.push({ k: t.mPower, v: w.avgPower, u: t.uW })
  // «Эффект»: число — значение, тип нагрузки (аэробный/анаэробный) уходит в подпись, не в единицу.
  if (w.trainingEffect != null) {
    const eff = (trainingLabel ?? w.trainingLabel) || ''
    out.push({ k: eff ? `${t.mEffect} · ${eff}` : t.mEffect, v: w.trainingEffect, u: '' })
  }
  return out
}

export default function GarminLive({ embedded = false, listsOnly = false }) {
  const t = useT({
    ru: {
      header: 'Спорт', source: 'Garmin Connect',
      stepsToday: 'Шаги сегодня', stepsGoal: 'цель 10 000', restingHr: 'Пульс покоя', vo2max: 'VO₂max', week: 'За неделю',
      bpm: 'уд/мин', vo2unit: 'мл/кг/мин',
      steps: 'Шаги', bodyBattery: 'Заряд тела', charge: 'заряд', stress: 'Стресс', stressSub: 'за час',
      fitTop: 'Превосходно', fitExc: 'Отлично', fitGood: 'Хорошо', fitAvg: 'Средне', fitLow: 'Ниже среднего',
      defaultWorkout: 'Тренировка', lastWorkout: 'последняя тренировка', more: 'подробнее →',
      // hero metric labels
      mDistance: 'Дистанция', mTime: 'Время', mPace: 'Темп', mSpeed: 'Скорость',
      mAvgHr: 'Ср. пульс', mMaxHr: 'Макс. пульс', mCalories: 'Калории',
      mElevation: 'Набор высоты', mCadence: 'Каденс', mPower: 'Мощность', mEffect: 'Эффект',
      // units
      uKm: 'км', uMin: 'мин', uPerKm: '/км', uKmh: 'км/ч', uBpm: 'уд/мин',
      uKcal: 'ккал', uM: 'м', uSpm: 'шаг/мин', uW: 'Вт',
      // sections
      upcoming: 'Приближающиеся тренировки', recent: 'Последние тренировки',
      collapse: 'Свернуть', expand: 'Развернуть',
      plannedEmpty: 'Плановых тренировок пока нет. Чтобы планы появлялись здесь, свяжите TrainingPeaks с Garmin: в TrainingPeaks → Settings → Connections включите Garmin и «Automatically send workouts».',
      inCal: '✓ в календаре', toCal: 'В календарь', toCalMorning: 'В календарь · ~6:30',
      at: 'в',
      plannedNote: 'Без своего времени тренировка ставится на утро (≈6:30), с учётом длительности и других дел дня.',
      recentEmpty: 'Нет недавних тренировок в Garmin.',
      kmShort: 'км', minShort: 'мин', perKmShort: '/км', kmhShort: 'км/ч', mUpShort: 'м ↑', kcalShort: 'ккал',
      calTitle: 'Калории тренировок', calToday: 'сегодня', calWeek: 'за неделю',
      pfTitle: 'План / факт', pfToday: 'Сегодня', pfWeek: 'За неделю', pfPlan: 'план', pfFact: 'факт', pfWk: 'трен.', pfNone: 'нет'
    },
    en: {
      header: 'Sport', source: 'Garmin Connect',
      stepsToday: 'Steps today', stepsGoal: 'goal 10,000', restingHr: 'Resting HR', vo2max: 'VO₂ Max', week: 'This week',
      bpm: 'bpm', vo2unit: 'ml/kg/min',
      steps: 'Steps', bodyBattery: 'Body Battery', charge: 'charge', stress: 'Stress', stressSub: 'last hour',
      fitTop: 'Superior', fitExc: 'Excellent', fitGood: 'Good', fitAvg: 'Fair', fitLow: 'Below average',
      defaultWorkout: 'Workout', lastWorkout: 'latest workout', more: 'details →',
      // hero metric labels
      mDistance: 'Distance', mTime: 'Duration', mPace: 'Pace', mSpeed: 'Speed',
      mAvgHr: 'Avg HR', mMaxHr: 'Max HR', mCalories: 'Calories',
      mElevation: 'Elevation gain', mCadence: 'Cadence', mPower: 'Power', mEffect: 'Effect',
      // units
      uKm: 'km', uMin: 'min', uPerKm: '/km', uKmh: 'km/h', uBpm: 'bpm',
      uKcal: 'kcal', uM: 'm', uSpm: 'spm', uW: 'W',
      // sections
      upcoming: 'Upcoming workouts', recent: 'Recent workouts',
      collapse: 'Collapse', expand: 'Expand',
      plannedEmpty: 'No planned workouts yet. To see plans here, link TrainingPeaks with Garmin: in TrainingPeaks → Settings → Connections enable Garmin and "Automatically send workouts".',
      inCal: '✓ in calendar', toCal: 'Add to calendar', toCalMorning: 'Add to calendar · ~6:30',
      at: 'at',
      plannedNote: 'Without a set time, the workout is scheduled in the morning (≈6:30), accounting for its duration and other plans of the day.',
      recentEmpty: 'No recent workouts in Garmin.',
      kmShort: 'km', minShort: 'min', perKmShort: '/km', kmhShort: 'km/h', mUpShort: 'm ↑', kcalShort: 'kcal',
      calTitle: 'Workout calories', calToday: 'today', calWeek: 'this week',
      pfTitle: 'Plan / actual', pfToday: 'Today', pfWeek: 'This week', pfPlan: 'plan', pfFact: 'actual', pfWk: 'wk', pfNone: 'none'
    }
  })
  const { lang } = useLang()
  // Выбрать английский вариант поля (field+'En') при lang==='en', иначе оригинал.
  // Реальные данные Garmin не содержат *En — всегда есть RU-фолбэк.
  const pickL = (o, f) => (lang === 'en' && o && o[f + 'En']) ? o[f + 'En'] : (o ? o[f] : '')
  const months = MONTHS[lang] || MONTHS.ru
  const sportMap = SPORT_LABELS[lang] || SPORT_LABELS.ru
  const sportRu = s => sportLabel(s, sportMap, t.defaultWorkout)

  const [g, setG] = useState(readLive)
  const [selected, setSelected] = useState(null)   // открытая тренировка (окно деталей)
  const [pickW, setPickW] = useState(null)         // тренировка, для которой выбираем время колёсиком
  const [pickTime, setPickTime] = useState('07:00')

  // Плановые тренировки (TrainingPeaks/Garmin) и какие уже добавлены в календарь
  const { events, applyAiActions } = useEvents()
  const [planned, setPlanned] = useState([])
  const [plannedDebug, setPlannedDebug] = useState(null)
  const [openSec, setOpenSec] = useState({ planned: true, recent: true })  // свёрнутость секций
  const toggleSec = k => setOpenSec(s => ({ ...s, [k]: !s[k] }))
  const [added, setAdded] = useState(() => {
    try { return JSON.parse(localStorage.getItem('albert-planned-added') || '{}') } catch { return {} }
  })
  function persistAdded(next) { setAdded(next); try { localStorage.setItem('albert-planned-added', JSON.stringify(next)) } catch { /* ignore */ } }

  const eventInput = (w, start, end) => ({
    name: 'create_event',
    input: { type: 'workout', title: w.title || t.defaultWorkout, date: w.date, start, end, who: t.defaultWorkout, priority: 2 }
  })
  // Уже есть такое событие в календаре? (защита от дублей, в т.ч. с другого устройства)
  const existsInCal = (date, start, title) =>
    (events || []).some(e => e.date === date && e.start === start && (e.title || '').trim() === (title || '').trim())

  // Добавить тренировку в календарь: с временем — на него; без — на лучший утренний слот
  function scheduleWorkout(w) {
    if (added[w.id]) return            // уже добавлено — не дублируем
    const dur = w.durationMin || 60
    const { start, end } = w.time
      ? { start: w.time, end: minToHm(hmToMin(w.time) + dur) }
      : proposeSlot(w.date, dur, events)
    if (!existsInCal(w.date, start, w.title)) applyAiActions([eventInput(w, start, end)])
    persistAdded({ ...added, [w.id]: { date: w.date, start, end } })
  }

  // Открыть колёсико времени: дефолт — время тренировки или предложенный утренний слот
  function openPicker(w) {
    if (added[w.id]) return
    const dur = w.durationMin || 60
    const start = w.time || proposeSlot(w.date, dur, events).start
    setPickTime(start); setPickW(w)
  }
  // Добавить тренировку на выбранное колёсиком время (тип события — workout)
  function scheduleWorkoutAt(w, start) {
    const dur = w.durationMin || 60
    const end = minToHm(hmToMin(start) + dur)
    if (!existsInCal(w.date, start, w.title)) applyAiActions([eventInput(w, start, end)])
    persistAdded({ ...added, [w.id]: { date: w.date, start, end } })
    setPickW(null)
  }

  useEffect(() => {
    fetch('/api/garmin/data').then(r => r.json()).then(d => {
      if (d.connected && d.garmin) {
        setG(d.garmin)
        try { localStorage.setItem('albert-garmin-live', JSON.stringify(d.garmin)) } catch { /* ignore */ }
      }
    }).catch(() => {})
  }, [])

  // Плановые тренировки: грузим и СРАЗУ добавляем те, у которых уже есть время.
  // Гостю бэкенд планы не отдаёт — показываем демо-планы.
  useEffect(() => {
    if (isGuest()) { setPlanned(demoPlanned()); return }
    fetch('/api/garmin/planned').then(r => r.json()).then(d => {
      const list = d?.planned || []
      setPlanned(list)
      setPlannedDebug(d?.debug || null)
      const timed = list.filter(w => w.time && !added[w.id])
      if (timed.length) {
        applyAiActions(timed.map(w => eventInput(w, w.time, minToHm(hmToMin(w.time) + (w.durationMin || 60)))))
        const next = { ...added }
        timed.forEach(w => { next[w.id] = { date: w.date, start: w.time, end: minToHm(hmToMin(w.time) + (w.durationMin || 60)) } })
        persistAdded(next)
      }
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const last = g?.lastWorkout
  const workouts = g?.workouts || []
  const accent = typeColor(last?.type)

  // Сводка «Калории» и «План/факт» (сегодня + за последние 7 дней)
  const todayKey = mskDateKey()
  const weekAgoKey = daysAgoKey(6)   // окно последних 7 дней, включая сегодня
  const inWeek = w => w.date >= weekAgoKey && w.date <= todayKey
  const doneToday = workouts.filter(w => w.date === todayKey)
  const doneWeek = workouts.filter(inWeek)
  const sumKcal = list => list.reduce((s, w) => s + (w.calories || 0), 0)
  const sumKm = list => Math.round(list.reduce((s, w) => s + (w.distanceKm || 0), 0) * 10) / 10
  const kcalToday = sumKcal(doneToday)
  const kcalWeek = sumKcal(doneWeek)
  const planToday = planned.filter(w => w.date === todayKey)
  const planWeek = planned.filter(inWeek)
  const hasCalData = kcalWeek > 0
  const hasPlanFact = planned.length > 0 || doneWeek.length > 0

  // Гейджи в стиле Garmin: VO₂max с цветными зонами и маркером, кольца шагов/заряда, дуга пульса.
  const vo2 = g?.vo2Max
  const vo2Label = vo2 == null ? '' : vo2 >= 50 ? t.fitTop : vo2 >= 45 ? t.fitExc : vo2 >= 40 ? t.fitGood : vo2 >= 35 ? t.fitAvg : t.fitLow
  const VO2_ZONES = [
    { from: 20, to: 33, color: 'var(--status-crit)' },
    { from: 33, to: 40, color: 'var(--status-warn)' },
    { from: 40, to: 46, color: 'var(--status-ok)' },
    { from: 46, to: 58, color: 'var(--accent)' }
  ]
  const bb = g?.bodyBattery?.current
  const bbColor = bb == null ? 'var(--accent)' : bb >= 50 ? 'var(--status-ok)' : bb >= 25 ? 'var(--status-warn)' : 'var(--status-crit)'
  // Стресс Garmin (0–100, ниже — лучше) — покажем в 4-й плитке, если «Заряд тела» недоступен
  const stressVal = g?.stress ? (g.stress.recent ?? g.stress.current ?? g.stress.avg ?? null) : null
  const stressColor = v => v <= 25 ? 'var(--status-ok)' : v <= 50 ? 'var(--status-warn)' : v <= 75 ? 'var(--status-warn)' : 'var(--status-crit)'
  const gauges = [
    g?.steps != null && (
      <ArcGauge key="steps" value={g.steps} max={10000} color="var(--accent)"
        centerText={g.steps.toLocaleString('ru-RU')} sublabel={t.stepsGoal} label={t.steps} />
    ),
    vo2 != null && (
      <ArcGauge key="vo2" value={vo2} min={20} max={58} zones={VO2_ZONES} marker
        centerText={`${vo2}`} sublabel={vo2Label} label={t.vo2max} />
    ),
    g?.restingHr != null && (
      <ArcGauge key="rhr" value={g.restingHr} min={40} max={90} color="var(--accent)"
        centerText={`${g.restingHr}`} sublabel={t.bpm} label={t.restingHr} />
    ),
    bb != null ? (
      <ArcGauge key="bb" value={bb} max={100} color={bbColor}
        centerText={`${bb}`} sublabel={t.charge} label={t.bodyBattery} />
    ) : stressVal != null && (
      <ArcGauge key="stress" value={stressVal} max={100} color={stressColor(stressVal)}
        centerText={`${stressVal}`} sublabel={t.stressSub} label={t.stress} />
    )
  ].filter(Boolean)

  return (
    <div className="gl-page">
      {!embedded && (
        <div className="page-header">
          <h2>{t.header}</h2>
          <span className="muted">{t.source}</span>
        </div>
      )}

      {!listsOnly && gauges.length > 0 && (
        <motion.div className="card gl-gauges"
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          {gauges}
        </motion.div>
      )}

      {/* Виджеты «Калории» и «План/факт» (просьба владельца) */}
      {!listsOnly && (hasCalData || hasPlanFact) && (
        <div className="gl-summary">
          {hasCalData && (
            <motion.div className="card gl-sum-card"
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.06 }}>
              <div className="gl-sum-title">{t.calTitle}</div>
              <div className="gl-sum-cols">
                <div className="gl-sum-col">
                  <span className="gl-sum-val">{kcalToday.toLocaleString('ru-RU')}<span className="gl-sum-u"> {t.kcalShort}</span></span>
                  <span className="gl-sum-cap muted">{t.calToday}</span>
                </div>
                <div className="gl-sum-col">
                  <span className="gl-sum-val">{kcalWeek.toLocaleString('ru-RU')}<span className="gl-sum-u"> {t.kcalShort}</span></span>
                  <span className="gl-sum-cap muted">{t.calWeek}</span>
                </div>
              </div>
            </motion.div>
          )}
          {hasPlanFact && (
            <motion.div className="card gl-sum-card"
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }}>
              <div className="gl-sum-title">{t.pfTitle}</div>
              <div className="gl-pf-rows">
                <div className="gl-pf-row">
                  <span className="gl-pf-when">{t.pfToday}</span>
                  <span className="gl-pf-val"><b>{planToday.length}</b> {t.pfPlan}</span>
                  <span className="gl-pf-sep">·</span>
                  <span className="gl-pf-val"><b>{doneToday.length}</b> {t.pfFact}</span>
                </div>
                <div className="gl-pf-row">
                  <span className="gl-pf-when">{t.pfWeek}</span>
                  <span className="gl-pf-val"><b>{planWeek.length}</b> {t.pfPlan}</span>
                  <span className="gl-pf-sep">·</span>
                  <span className="gl-pf-val"><b>{doneWeek.length}</b> {t.pfFact}{sumKm(doneWeek) > 0 ? `, ${sumKm(doneWeek)} ${t.kmShort}` : ''}</span>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {last && (
        <motion.div className={`card gl-hero ${last.id ? 'gl-clickable' : ''}`}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
          whileHover={last.id ? { y: -3 } : undefined}
          onClick={last.id ? () => setSelected(last) : undefined}
          style={{ '--hero-accent': accent }}>
          <div className="gl-hero-head">
            <div className="gl-hero-badge" style={{ color: accent, background: `color-mix(in srgb, ${accent} 16%, transparent)` }}>
              {pickL(last, 'label')}
            </div>
            <span className="gl-hero-date muted">{fmtDate(last.date, months)} · {t.lastWorkout}</span>
            {last.id && <span className="gl-hero-cta" style={{ color: accent }}>{t.more}</span>}
          </div>
          <h3 className="gl-hero-title">{pickL(last, 'title')}</h3>
          <div className="gl-hero-grid">
            {heroMetrics(last, t, pickL(last, 'trainingLabel')).map(m => (
              <div key={m.k} className={`gl-metric ${m.primary ? 'primary' : ''}`}>
                <span className="gl-metric-value">
                  {m.v}{m.u && <span className="gl-metric-unit"> {m.u}</span>}
                </span>
                <span className="gl-metric-label">{m.k}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Расширенные метрики Garmin (Training Status/Load, HRV, прогнозы забегов и т.д.) —
          ниже последней тренировки, но выше «Приближающихся тренировок» */}
      {!listsOnly && (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.16 }}>
          <GarminInsights />
        </motion.div>
      )}

      <motion.div className="card gl-list-card"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.14 }}>
        <div className="gl-card-head">
          <div className="card-title" style={{ margin: 0 }}>{t.upcoming}</div>
          <button className="gl-collapse" onClick={() => toggleSec('planned')} aria-label={openSec.planned ? t.collapse : t.expand}>
            <svg className={`gl-chev ${openSec.planned ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
        {openSec.planned && (planned.length === 0 ? (
          <div className="gl-empty muted">
            {t.plannedEmpty}
          </div>
        ) : (<>
          <div className="gl-planned">
            {planned.map(w => {
              const info = added[w.id]
              const c = typeColor(w.sport)
              return (
                <div key={w.id} className="gl-prow">
                  <span className="gl-row-dot" style={{ background: c }} />
                  <div className="gl-row-main">
                    <span className="gl-row-title">{pickL(w, 'title')}</span>
                    <span className="gl-row-sub muted">
                      {fmtDate(w.date, months)} · {sportRu(w.sport)}
                      {w.durationMin ? ` · ${w.durationMin} ${t.minShort}` : ''}
                      {w.distanceKm ? ` · ${w.distanceKm} ${t.kmShort}` : ''}
                      {/* Время: своё (· в 6:30) или предлагаемое утро (· ~6:30) — в мете, не в кнопке */}
                      {w.time ? ` · ${t.at} ${w.time}` : ` · ~6:30`}
                    </span>
                  </div>
                  {info
                    ? <span className="gl-added">{t.inCal}{info.start ? `, ${info.start}` : ''}</span>
                    : <Button variant="primary" size="sm" onClick={() => openPicker(w)}>
                        {t.toCal}
                      </Button>}
                </div>
              )
            })}
          </div>
          <div className="gl-planned-note muted">{t.plannedNote}</div>
          </>))}
        </motion.div>

      {pickW && (
        <div className="gl-pick-backdrop" onClick={() => setPickW(null)}>
          <motion.div
            className="card gl-pick-sheet"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="gl-pick-title">{lang === 'en' ? 'Workout time' : 'Время тренировки'}</div>
            <div className="gl-pick-name muted">{pickL(pickW, 'title')} · {fmtDate(pickW.date, months)}</div>
            <WheelTimePicker value={pickTime} onChange={setPickTime} minuteStep={5} />
            <div className="gl-pick-actions">
              <button className="gl-pick-cancel" onClick={() => setPickW(null)}>{lang === 'en' ? 'Cancel' : 'Отмена'}</button>
              <Button variant="primary" onClick={() => scheduleWorkoutAt(pickW, pickTime)}>{lang === 'en' ? 'Done' : 'Готово'}</Button>
            </div>
            <style>{`
              .gl-pick-backdrop {
                position: fixed; inset: 0; z-index: 400;
                display: flex; align-items: center; justify-content: center; padding: 20px;
                background: var(--scrim, rgba(0,0,0,0.55));
                backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
              }
              .gl-pick-sheet { width: min(360px, 100%); display: flex; flex-direction: column; gap: 14px; align-items: center; padding: 22px; }
              .gl-pick-title { font-size: 17px; font-weight: 700; color: var(--text-primary); align-self: flex-start; }
              .gl-pick-name { font-size: 13px; align-self: flex-start; margin-top: -8px; }
              .gl-pick-actions { display: flex; gap: 10px; align-items: center; justify-content: flex-end; width: 100%; margin-top: 4px; }
              .gl-pick-cancel {
                border: 1px solid var(--border-med); background: var(--bg-tile); color: var(--text-secondary);
                border-radius: var(--radius-md); padding: 10px 16px; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
              }
              .gl-pick-cancel:hover { color: var(--text-body); border-color: var(--accent); }
              @media (max-width: 640px) {
                .gl-pick-backdrop { align-items: flex-end; padding: 0; }
                .gl-pick-sheet { width: 100%; border-radius: var(--radius) var(--radius) 0 0; padding-bottom: max(22px, env(safe-area-inset-bottom)); }
              }
            `}</style>
          </motion.div>
        </div>
      )}

      <motion.div className="card gl-list-card"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.16 }}>
        <div className="gl-card-head">
          <div className="card-title" style={{ margin: 0 }}>{t.recent}</div>
          <button className="gl-collapse" onClick={() => toggleSec('recent')} aria-label={openSec.recent ? t.collapse : t.expand}>
            <svg className={`gl-chev ${openSec.recent ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
        {!openSec.recent ? null : workouts.length === 0 ? (
          <div className="gl-empty muted">{t.recentEmpty}</div>
        ) : (
          <div className="gl-list">
            {workouts.map((w, i) => {
              const c = typeColor(w.type)
              return (
                <div key={i} className={`gl-row ${w.id ? 'gl-clickable' : ''}`}
                  onClick={w.id ? () => setSelected(w) : undefined}>
                  <span className="gl-row-dot" style={{ background: c }} />
                  <div className="gl-row-main">
                    <span className="gl-row-title">{pickL(w, 'title')}</span>
                    <span className="gl-row-sub muted">{fmtDate(w.date, months)} · {pickL(w, 'label')}</span>
                  </div>
                  <div className="gl-row-stats">
                    {w.distanceKm != null && <span><b>{w.distanceKm}</b> {t.kmShort}</span>}
                    {w.durationMin != null && <span><b>{w.durationMin}</b> {t.minShort}</span>}
                    {w.pace ? <span><b>{w.pace}</b> {t.perKmShort}</span> : w.speedKmh != null && <span><b>{w.speedKmh}</b> {t.kmhShort}</span>}
                    {w.avgHr != null && <span className="gl-hr"><span className="gl-hr-ico">{ICON_HEART}</span>{w.avgHr}</span>}
                    {w.elevationGain != null && <span><b>{w.elevationGain}</b> {t.mUpShort}</span>}
                    {w.calories != null && <span><b>{w.calories}</b> {t.kcalShort}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </motion.div>

      {selected && <WorkoutModal workout={selected} onClose={() => setSelected(null)} />}

      <style>{`
        .gl-page { display: flex; flex-direction: column; gap: 18px; max-width: 1400px; padding-bottom: 20px; }
        .gl-clickable { cursor: pointer; }
        .gl-hero.gl-clickable { transition: border-color 0.2s, box-shadow 0.2s; }
        .gl-hero.gl-clickable:hover { border-color: var(--border-hover); box-shadow: var(--shadow-lift); }
        .gl-hero-cta { margin-left: auto; font-size: 12.5px; font-weight: 600; }
        .gl-row.gl-clickable { transition: background 0.15s; border-radius: 8px; padding-left: 10px; padding-right: 10px; margin: 0 -10px; }
        .gl-row.gl-clickable:hover { background: var(--bg-secondary); }
        .page-header { display: flex; align-items: baseline; gap: 12px; }
        .page-header h2 { font-size: 24px; font-weight: 700; color: var(--foreground); }

        /* KPI: не растягиваем на полэкрана — узкие плашки слева, число не плавает в пустоте */
        .gl-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 280px)); justify-content: start; gap: 14px; }
        .gl-stat { display: flex; flex-direction: column; gap: 5px; padding: 16px 18px; }
        .gl-stat-label { font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
        .gl-stat-value { font-size: 26px; font-weight: 700; letter-spacing: -0.01em; color: var(--foreground); }
        .gl-stat-sub { font-size: 12px; }

        /* Гарминовская сетка гейджей */
        .gl-gauges { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 18px 8px; justify-items: center; align-items: start; padding: 22px 18px; }
        @media (max-width: 520px) { .gl-gauges { grid-template-columns: repeat(2, 1fr); gap: 14px 4px; } }

        /* Сводные виджеты: Калории + План/факт */
        .gl-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
        .gl-sum-card { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px; }
        .gl-sum-title { font-size: 13px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
        .gl-sum-cols { display: flex; gap: 28px; }
        .gl-sum-col { display: flex; flex-direction: column; gap: 4px; }
        .gl-sum-val { font-size: 26px; font-weight: 700; color: var(--foreground); letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
        .gl-sum-u { font-size: 0.5em; font-weight: 500; color: var(--muted); }
        .gl-sum-cap { font-size: 12px; }
        .gl-pf-rows { display: flex; flex-direction: column; gap: 10px; }
        .gl-pf-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
        .gl-pf-when { font-size: 13px; font-weight: 700; color: var(--foreground); min-width: 74px; }
        .gl-pf-val { font-size: 14px; color: var(--muted); }
        .gl-pf-val b { color: var(--foreground); font-weight: 700; font-size: 15px; }
        .gl-pf-sep { color: var(--muted); }

        /* Левая акцентная полоса = border-left: повторяет скругление 16px углов карточки (overflow:hidden клипает) */
        .gl-hero { position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 14px; padding: 22px 24px; border-left: 4px solid var(--hero-accent); }
        .gl-hero-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .gl-hero-badge { font-size: 12.5px; font-weight: 700; padding: 4px 12px; border-radius: 16px; }
        .gl-hero-date { font-size: 13px; }
        .gl-hero-title { font-size: 21px; font-weight: 700; color: var(--foreground); letter-spacing: -0.01em; }
        .gl-hero-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
          gap: 12px; margin-top: 4px; align-items: end;
        }
        .gl-metric {
          display: flex; flex-direction: column; gap: 3px;
          background: var(--bg-tile, var(--bg-secondary)); border: 1px solid var(--border-med, var(--border));
          border-radius: 12px; padding: 11px 13px;
        }
        /* Базовые метрики — мельче и приглушённее */
        .gl-metric-value { font-size: 16px; font-weight: 700; color: var(--muted); line-height: 1.1; }
        /* Единица измерения — мелко (~0.5em) у базовой линии числа */
        .gl-metric-unit { font-size: 0.62em; font-weight: 500; color: var(--muted); }
        .gl-metric-label { font-size: 11px; color: var(--muted); }
        /* Ключевые метрики (Дистанция/Время/Темп) — крупнее, число в --foreground */
        .gl-metric.primary .gl-metric-value { font-size: 23px; color: var(--foreground); }
        .gl-metric.primary .gl-metric-unit { color: var(--muted); }

        .gl-list-card { display: flex; flex-direction: column; gap: 12px; }
        .gl-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .gl-collapse {
          width: 30px; height: 30px; flex-shrink: 0; border-radius: 8px;
          border: 1px solid var(--border); background: var(--bg-secondary); color: var(--muted);
          cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s;
        }
        .gl-collapse:hover { color: var(--foreground); border-color: var(--border-hover); }
        @media (max-width: 640px) { .gl-collapse { width: 40px; height: 40px; } }
        .gl-chev { transition: transform 0.2s; }
        .gl-chev.open { transform: rotate(180deg); }
        .gl-planned { display: flex; flex-direction: column; }
        .gl-prow { display: flex; align-items: center; gap: 14px; padding: 13px 0; border-bottom: 1px solid var(--border); }
        .gl-prow:last-child { border-bottom: none; }
        /* Единая ширина кнопки → ровный правый край списка (время вынесено в мету) */
        .gl-added { flex-shrink: 0; min-width: 148px; text-align: center; font-size: 13px; font-weight: 600; color: var(--green); white-space: nowrap; }
        .gl-planned-note { font-size: 12px; margin-top: 2px; }
        .gl-debug { font-size: 11px; opacity: 0.6; margin-top: 8px; word-break: break-all; }
        .gl-empty { font-size: 14px; padding: 8px 0; }
        .gl-list { display: flex; flex-direction: column; }
        .gl-row { display: flex; align-items: center; gap: 14px; padding: 13px 0; border-bottom: 1px solid var(--border); }
        .gl-row:last-child { border-bottom: none; }
        .gl-row-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .gl-row-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
        .gl-row-title { font-size: 15px; font-weight: 600; color: var(--foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .gl-row-sub { font-size: 12.5px; }
        .gl-row-stats { display: flex; gap: 16px; font-size: 13px; color: var(--muted); flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
        .gl-row-stats b { color: var(--foreground); font-weight: 600; }
        .gl-hr { display: inline-flex; align-items: center; gap: 4px; }
        .gl-hr-ico { color: var(--muted); display: inline-flex; }

        @media (max-width: 900px) { .gl-stats { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 620px) {
          .gl-row { flex-wrap: wrap; }
          .gl-row-stats { width: 100%; justify-content: flex-start; gap: 12px; }
        }
      `}</style>
    </div>
  )
}
