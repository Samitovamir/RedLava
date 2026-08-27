/*
  «Статус» — сводка дня по доменам: гейдж слева, персональный ИИ-совет справа.
  Порядок доменов: Стресс · Расписание · Спорт · Здоровье · Питание.
  Совет по каждому домену приходит от ИИ (useAiSummary), с детерминированным
  фолбэком на пороги, если ИИ недоступен. Только CSS-переменные, тёмная тема.
*/
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import StressArc from './StressArc.jsx'
import ZoneArc from './ZoneArc.jsx'
import DayProgress from './DayProgress.jsx'
import PlanFactGauge from './PlanFactGauge.jsx'
import HealthGauge from './HealthGauge.jsx'
import MiniGauge from './MiniGauge.jsx'
import { useIsMobile } from '../layout.js'
import { nutritionToday, loadPrefs, loadIntake, entryFodmap, fodmapMeta } from '../utils/nutrition.js'
import { useEvents } from '../context/EventsContext.jsx'
import { mskNow, mskDateKey } from '../utils/time.js'
import { isGuest } from '../api/authFetch.js'
import { demoPlanned } from '../utils/demo.js'
import { loadSourcePref, resolveSource } from '../utils/healthSource.js'
import { useAiSummary } from '../hooks/useAiSummary.js'
import { useMemoryFacts } from '../context/MemoryContext.jsx'
import { useLang, useT } from '../context/LanguageContext.jsx'
import { buildSignalData, DOMAIN_ADVICE_CONTEXT, parseAdvice } from '../utils/daySignal.js'

// Строки компонента. Чистые функции ниже принимают нужную половину словаря (`s`),
// потому что они объявлены вне компонента и до хуков не дотягиваются.
const STR = {
  en: {
    eyebrow: 'Status',
    stress: 'Stress', schedule: 'Schedule', health: 'Health', nutrition: 'Nutrition',
    sportReady: 'Sport · training readiness', sportPlan: 'Sport · plan vs actual',
    calories: 'calories', stressSource: 'Garmin · past hour', bodyBattery: 'Garmin · body battery',
    dayFree: 'free', dayBusier: 'busier', dayCalmer: 'calmer', dayUsual: 'as usual',
    allEventsPassed: 'All events done', next: 'Next',
    readyHigh: 'high', readyMid: 'moderate', readyLow: 'low',
    km: 'km', min: 'min', workout: 'Workout',
    stressNoData: 'No stress data yet.',
    stressLow: 'Stress is low — a good window for focused work or a quality session.',
    stressHigh: 'Stress is elevated — ease off and take a break before training.',
    schedFree: 'The day is open — clear a backlog item or add training volume.',
    schedBusy: 'Packed day — leave buffers between items and don’t squeeze in a hard session.',
    schedNormal: 'Steady day — you have room without rushing.',
    readyNoData: 'No readiness data yet.',
    readyHighAdv: 'Readiness is high — a key session is on the table.',
    readyMidAdv: 'Readiness is moderate — a steady load is fine, skip the maximum.',
    readyLowAdv: 'Readiness is low — go easy aerobic or rest today.',
    healthNoData: 'Recovery data not collected yet.',
    healthSurplus: 'You have recovery in reserve — you can take load without overreaching.',
    healthDeficit: 'Load is outrunning recovery — unload today and catch up on sleep.',
    healthBalanced: 'Recovery and load are level — hold your usual pace.',
    nutEmpty: 'Log your meals to see the day’s balance.',
    nutOver: 'Target is met — keep the evening meal light and protein-led.',
    nutLeft: (n) => `${n} kcal left — lean on protein for the remaining meals.`,
    planAhead: 'Session still ahead — hold the target, don’t burn it early.',
    planOver: 'Plan exceeded — don’t add more, let the body recover.',
    planDone: 'Plan closed — recovery from here.',
    planShort: 'A little short of plan — top up later or call it done.',
  },
  ru: {
    eyebrow: 'Статус',
    stress: 'Стресс', schedule: 'Расписание', health: 'Здоровье', nutrition: 'Питание',
    sportReady: 'Спорт · готовность к тренировкам', sportPlan: 'Спорт · план/факт',
    calories: 'калории', stressSource: 'Garmin · за час', bodyBattery: 'Garmin · заряд тела',
    dayFree: 'свободно', dayBusier: 'плотнее', dayCalmer: 'спокойнее', dayUsual: 'как обычно',
    allEventsPassed: 'События позади', next: 'Дальше',
    readyHigh: 'высокая', readyMid: 'средняя', readyLow: 'низкая',
    km: 'км', min: 'мин', workout: 'Тренировка',
    stressNoData: 'Данных о стрессе пока нет.',
    stressLow: 'Стресс низкий — удачное окно для дел на концентрацию или качественной тренировки.',
    stressHigh: 'Стресс повышен — сбавь темп и сделай паузу перед нагрузкой.',
    schedFree: 'День свободный — закрой отложенное или добавь тренировочный объём.',
    schedBusy: 'День плотный — заложи буфер между делами, тяжёлую тренировку не ставь впритык.',
    schedNormal: 'День размеренный — успеваешь без спешки.',
    readyNoData: 'Данных о готовности пока нет.',
    readyHighAdv: 'Готовность высокая — можно провести ключевую тренировку.',
    readyMidAdv: 'Готовность средняя — умеренная нагрузка по силам, без максимума.',
    readyLowAdv: 'Готовность низкая — сегодня лучше лёгкая аэробная или отдых.',
    healthNoData: 'Данные восстановления пока не собраны.',
    healthSurplus: 'Есть запас восстановления — можно взять нагрузку без риска перебора.',
    healthDeficit: 'Нагрузка обгоняет восстановление — сегодня разгрузись и добери сон.',
    healthBalanced: 'Восстановление и нагрузка вровень — держи привычный темп.',
    nutEmpty: 'Залогируй приёмы, чтобы видеть баланс дня.',
    nutOver: 'Норма закрыта — вечером лучше лёгкий белковый приём.',
    nutLeft: (n) => `Осталось ${n} ккал — сделай упор на белок в оставшихся приёмах.`,
    planAhead: 'Тренировка впереди — держи цель, но не выкладывайся заранее.',
    planOver: 'План перевыполнен — не добавляй лишнего, дай телу восстановиться.',
    planDone: 'План закрыт — дальше восстановление.',
    planShort: 'До плана немного осталось — добери объём позже или засчитай как есть.',
  },
}

function readLS(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null } catch { return null }
}

const toMin = h => { const m = /^(\d{1,2}):(\d{2})/.exec(h || ''); return m ? +m[1] * 60 + +m[2] : null }

// Данные «Расписания» с ТЕНДЕНЦИЕЙ: загрузка этого дня относительно ОБЫЧНОГО дня.
// Базовая линия — среднее число событий в день по ПРОШЛЫМ дням из календаря (реальная
// история). Шкала калибруется так, что обычный день ≈ середина (50): маркер левее —
// спокойнее обычного, правее — плотнее. Чем больше истории, тем точнее база.
function scheduleData(events, s) {
  const now = mskNow()
  const p = n => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const todays = events.filter(e => e.date === today).map(e => ({ start: e.start, title: e.title, m: toMin(e.start) }))
  const count = todays.length
  const next = todays.filter(e => e.m != null && e.m > nowMin).sort((a, b) => a.m - b.m)[0] || null

  // База: среднее событий/день по ПРОШЛЫМ дням (исключаем сегодня и будущее)
  const counts = {}
  for (const e of events) if (e.date && e.date < today) counts[e.date] = (counts[e.date] || 0) + 1
  const pastDays = Object.keys(counts)
  const baseline = pastDays.length >= 3 ? pastDays.reduce((acc, d) => acc + counts[d], 0) / pastDays.length : 2
  // Обычный день (=baseline) попадает на 50; 0 → 0; 2×baseline и выше → 100
  const loadPct = Math.min(100, Math.round(count / (Math.max(1, baseline) * 2) * 100))
  const ratio = baseline > 0 ? count / baseline : (count ? 2 : 0)

  // Одно слово под числом на гейдже: насколько день плотнее/свободнее обычного
  const word = count === 0 ? s.dayFree
    : ratio > 1.4 ? s.dayBusier
    : ratio < 0.6 ? s.dayCalmer
    : s.dayUsual

  const title = next?.title ? (next.title.length > 26 ? next.title.slice(0, 25) + '…' : next.title) : null
  let nextLine
  if (count === 0) nextLine = null
  else if (next) nextLine = { time: next.start, title }
  else nextLine = s.allEventsPassed

  const color = loadPct >= 66 ? 'var(--status-crit)' : loadPct >= 33 ? 'var(--status-warn)' : 'var(--status-ok)'
  return { count, loadPct, word, color, todays, next, nowMin, nextLine }
}

const r1 = x => Math.round(x * 10) / 10

// План/факт тренировки: план из TrainingPeaks/Garmin на сегодня + факт выполнения.
// Нет плановой тренировки на сегодня → null (строка не показывается).
function sportPlanFact(planned, garmin, todayKey, s) {
  const pToday = (planned || []).filter(w => w.date === todayKey)
  if (!pToday.length) return null
  const useDist = pToday.some(w => w.distanceKm > 0)
  const planVal = pToday.reduce((acc, w) => acc + (useDist ? (w.distanceKm || 0) : (w.durationMin || 0)), 0)
  if (planVal <= 0) return null
  const dToday = (garmin?.workouts || []).filter(w => w.date === todayKey)
  const factVal = dToday.reduce((acc, w) => acc + (useDist ? (w.distanceKm || 0) : (w.durationMin || 0)), 0)
  const pct = Math.round(factVal / planVal * 100)
  const unit = useDist ? s.km : s.min
  const goalText = `${r1(planVal)} ${unit}`
  return { pct, goalText }
}

// Готовность к тренировкам: Garmin Training Readiness (0–100), иначе — Whoop recovery.
// Выше — лучше (в отличие от стресса). Уровень и цвет по порогам.
function readyMeta(v, s) {
  if (v == null) return null
  if (v >= 75) return { w: s.readyHigh, c: 'var(--status-ok)' }
  if (v >= 50) return { w: s.readyMid, c: 'var(--status-warn)' }
  return { w: s.readyLow, c: 'var(--status-crit)' }
}

export default function TodaySignalV2() {
  const isMobile = useIsMobile()
  const gaugeSize = isMobile ? 132 : 156
  const s = useT(STR)
  const { lang } = useLang()
  const { events } = useEvents()
  const sched = scheduleData(events, s)
  const garmin = readLS('albert-garmin-live')
  const whoop = readLS('albert-whoop-live')

  // План тренировок (TrainingPeaks/Garmin): гость → демо, иначе — с бэкенда
  const [planned, setPlanned] = useState(() => (isGuest() ? demoPlanned(lang) : []))
  useEffect(() => {
    if (isGuest()) { setPlanned(demoPlanned(lang)); return }
    let ok = true
    fetch('/api/garmin/planned').then(r => r.json()).then(d => { if (ok) setPlanned(d?.planned || []) }).catch(() => {})
    return () => { ok = false }
  }, [])
  const planFact = sportPlanFact(planned, garmin, mskDateKey(), s)

  // Здоровье: восстановление + нагрузка. Источник авто (Whoop→Garmin), как на вкладке.
  // Whoop → recovery + strain(0–21). Garmin (без Whoop) → Body Battery: заряд(восст.) + потрачено(нагрузка), 0–100.
  const hSource = resolveSource(loadSourcePref(), whoop, garmin)
  let recovery = null, strain = null, strainMax = 21, hSourceLabel = null
  if (hSource === 'whoop') {
    recovery = whoop.recovery ?? null; strain = whoop.strain ?? null; strainMax = whoop.strainMax || 21; hSourceLabel = 'Whoop'
  } else if (hSource === 'garmin') {
    const bb = garmin?.bodyBattery
    recovery = bb?.current ?? null; strain = bb?.drained ?? null; strainMax = 100; hSourceLabel = s.bodyBattery
  }
  const hasHealth = recovery != null || strain != null
  const loadPct = strain != null ? strain / strainMax * 100 : null
  const balDiff = (recovery != null && loadPct != null) ? recovery - loadPct : null

  // Питание: калории (съедено/цель) + FODMAP дня (только если диета включена)
  const nut = (() => { try { return nutritionToday() } catch { return null } })()
  const nutOk = !!nut?.hasData
  const kcalPct = nutOk && nut.target?.kcal ? Math.min(100, Math.round(nut.eaten / nut.target.kcal * 100)) : 0
  const kcalColor = nutOk && nut.eaten > (nut.target?.kcal || 0) ? 'var(--status-warn)' : 'var(--accent)'
  const fodEnabled = (() => { try { return loadPrefs().fodmap } catch { return false } })()
  const fod = (() => {
    if (!fodEnabled) return null   // диета выключена — гейджа нет
    try {
      const rec = loadIntake()?.[mskDateKey()]
      const entries = rec?.entries || []
      if (!entries.length) return { band: null, val: null, label: '—', color: 'var(--text-muted)' }  // включена, но еды нет
      let hi = 0, mo = 0, lo = 0
      for (const e of entries) { const bnd = entryFodmap(e)?.band; if (bnd === 'high') hi++; else if (bnd === 'mod') mo++; else lo++ }
      const band = hi ? 'high' : mo ? 'mod' : 'low'
      const val = band === 'high' ? 84 : band === 'mod' ? 50 : 16   // позиция маркера на шкале низкий→высокий
      const m = fodmapMeta(band, lang)
      return { band, val, label: m.label, color: m.color }
    } catch { return null }
  })()
  // Спорт · готовность
  const rd = garmin?.readiness
  const readyScore = rd?.score ?? whoop?.recovery ?? null
  const rm = readyMeta(readyScore, s)
  const str = garmin?.stress
  const value = str ? (str.recent ?? str.current ?? str.avg ?? null) : null
  const fresh = s.stressSource   // стресс приходит из Garmin (у Whoop шкалы стресса нет)

  // ── Персональные ИИ-советы по доменам (что делать), с детерминированным фолбэком ──
  const { facts } = useMemoryFacts()
  const adviceSummary = useAiSummary({
    id: 'status-advice-v2',
    context: DOMAIN_ADVICE_CONTEXT + (lang === 'en' ? '\nReply in English; keep field labels in Russian (Стресс/Расписание/Спорт/Здоровье/Питание).' : ''),
    snapshot: buildSignalData({ events, facts }),
    message: 'Дай короткий совет по каждому разделу строго по формату.',
    fallback: ''
  })
  const ai = adviceSummary.text ? parseAdvice(adviceSummary.text) : {}
  const stressAdvice = ai.стресс || (value == null ? s.stressNoData : value <= 50 ? s.stressLow : s.stressHigh)
  const schedAdvice = ai.расписание || (sched.count === 0 ? s.schedFree : sched.loadPct >= 66 ? s.schedBusy : s.schedNormal)
  const readyAdvice = ai.спорт || (readyScore == null ? s.readyNoData : readyScore >= 75 ? s.readyHighAdv : readyScore >= 50 ? s.readyMidAdv : s.readyLowAdv)
  const healthAdvice = ai.здоровье || (balDiff == null ? s.healthNoData : balDiff >= 15 ? s.healthSurplus : balDiff <= -15 ? s.healthDeficit : s.healthBalanced)
  const nutAdvice = ai.питание || (!nutOk ? s.nutEmpty : nut.eaten > (nut.target?.kcal || 0) ? s.nutOver : s.nutLeft(nut.remaining))
  const planAdvice = planFact && (planFact.pct <= 0 ? s.planAhead : planFact.pct > 100 ? s.planOver : planFact.pct >= 100 ? s.planDone : s.planShort)

  return (
    <motion.div
      className="card status-v2"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <span className="sv2-eyebrow">{s.eyebrow}</span>

      <div className="sv2-domains">
        {/* ───────── Стресс ───────── */}
        <div className="sv2-drow">
          <div className="sv2-dgauge">
            <StressArc value={value} size={gaugeSize} />
            <span className="sv2-note">{fresh}</span>
          </div>
          <div className="sv2-dtext">
            <span className="sv2-dtitle">{s.stress}</span>
            <p className="sv2-advice">{stressAdvice}</p>
          </div>
        </div>

        {/* ───────── Расписание ───────── */}
        <div className="sv2-sched">
          <div className="sv2-dgauge">
            <ZoneArc value={sched.loadPct} max={100} center={sched.count} sub={sched.word} subColor={sched.color} size={gaugeSize}
              zones={[
                { from: 0, to: 33, color: 'var(--status-ok)' },
                { from: 33, to: 66, color: 'var(--status-warn)' },
                { from: 66, to: 100, color: 'var(--status-crit)' },
              ]} />
          </div>
          <div className="sv2-dtext">
            <span className="sv2-dtitle">{s.schedule}</span>
            <p className="sv2-advice">{schedAdvice}</p>
          </div>
          <div className="sv2-sched-bar">
            <DayProgress todays={sched.todays} nowMin={sched.nowMin} />
          </div>
          <div className="sv2-sched-next">
            {sched.nextLine && (typeof sched.nextLine === 'string'
              ? sched.nextLine
              : <>{s.next} · <span className="sv2-next-t">{sched.nextLine.time}</span> · {sched.nextLine.title}</>)}
          </div>
        </div>

        {/* ───────── Спорт · готовность ───────── */}
        {rm && (
          <div className="sv2-drow">
            <div className="sv2-dgauge">
              <ZoneArc value={readyScore} max={100} center={readyScore} sub={rm.w} subColor={rm.c} size={gaugeSize}
                zones={[
                  { from: 0, to: 50, color: 'var(--status-crit)' },
                  { from: 50, to: 75, color: 'var(--status-warn)' },
                  { from: 75, to: 100, color: 'var(--status-ok)' },
                ]} />
            </div>
            <div className="sv2-dtext">
              <span className="sv2-dtitle">{s.sportReady}</span>
              <p className="sv2-advice">{readyAdvice}</p>
            </div>
          </div>
        )}

        {/* ───────── Спорт · план/факт (только если есть плановая тренировка) ───────── */}
        {planFact && (
          <div className="sv2-drow">
            <div className="sv2-dgauge">
              <PlanFactGauge pct={planFact.pct} goalText={planFact.goalText} size={gaugeSize} />
            </div>
            <div className="sv2-dtext">
              <span className="sv2-dtitle">{s.sportPlan}</span>
              <p className="sv2-advice">{planAdvice}</p>
            </div>
          </div>
        )}

        {/* ───────── Здоровье ───────── */}
        {hasHealth && (
          <div className="sv2-drow">
            <div className="sv2-dgauge">
              <HealthGauge variant={1} recovery={recovery} strain={strain} strainMax={strainMax} size={gaugeSize} />
              {hSourceLabel && <span className="sv2-note">{hSourceLabel}</span>}
            </div>
            <div className="sv2-dtext">
              <span className="sv2-dtitle">{s.health}</span>
              <p className="sv2-advice">{healthAdvice}</p>
            </div>
          </div>
        )}

        {/* ───────── Питание (калории + FODMAP-полукруг, если диета включена) ───────── */}
        {nutOk && (
          <div className="sv2-drow">
            <div className="sv2-dgauge sv2-nut">
              <div className="sv2-nut-g">
                <MiniGauge value={kcalPct} color={kcalColor} center={nut.eaten} size={gaugeSize} />
                <span className="sv2-note">{s.calories}</span>
              </div>
              {fod && (
                <div className="sv2-nut-g">
                  <ZoneArc value={fod.val} max={100} center={fod.label} centerColor={fod.color} size={gaugeSize}
                    zones={[
                      { from: 0, to: 33, color: 'var(--status-ok)' },
                      { from: 33, to: 66, color: 'var(--status-warn)' },
                      { from: 66, to: 100, color: 'var(--status-crit)' },
                    ]} />
                  <span className="sv2-note">FODMAP</span>
                </div>
              )}
            </div>
            <div className="sv2-dtext">
              <span className="sv2-dtitle">{s.nutrition}</span>
              <p className="sv2-advice">{nutAdvice}</p>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .status-v2 { display: flex; flex-direction: column; gap: 14px; padding: 24px 28px; }
        .sv2-eyebrow {
          font-size: 12px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
          color: var(--accent);
        }
        /* Одна колонка — каждый домен своей строкой (по два в ряд, возможно, позже). */
        .sv2-domains { display: flex; flex-direction: column; }
        .sv2-drow {
          display: grid; grid-template-columns: auto 1fr; gap: 18px; align-items: center;
          padding: 14px 0; min-width: 0;
        }
        .sv2-dgauge { display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0; }
        .sv2-nut { flex-direction: row; align-items: flex-start; gap: 14px; }
        .sv2-nut-g { display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .sv2-note { font-size: 11px; color: var(--text-muted); text-align: center; }
        .sv2-dtext { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .sv2-dtitle { font-size: 11.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 2px; }
        .sv2-lead { font-size: 20px; font-weight: 700; line-height: 1.25; letter-spacing: -0.01em; color: var(--text-primary); overflow-wrap: anywhere; }
        .sv2-sub { font-size: 14.5px; line-height: 1.5; color: var(--text-secondary); overflow-wrap: anywhere; }
        /* ИИ-совет по домену (что делать) — вместо пересказа графика */
        .sv2-advice { font-size: 15px; line-height: 1.5; color: var(--text-body); overflow-wrap: anywhere; }
        /* Расписание: сетка 2×2 — [гейдж | текст] сверху, [HP-бар | след. событие] снизу.
           HP-бар автоматически под гейджем (та же колонка = та же ось X). */
        .sv2-sched {
          display: grid; grid-template-columns: auto 1fr;
          column-gap: 22px; row-gap: 12px; align-items: center; padding: 14px 0;
        }
        .sv2-sched-bar { min-width: 0; }
        .sv2-sched-next {
          font-size: 13px; color: var(--text-secondary); min-width: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .sv2-next-t { font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
        /* Витрина выбора визуала (временная, на период разработки) */
        .sv2-pick { display: flex; flex-direction: column; gap: 12px; padding: 14px 0; }
        .sv2-pick-h { font-size: 13px; font-weight: 700; color: var(--text-secondary); }
        .sv2-vars { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .sv2-var {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 16px 10px; border: 1px solid var(--border-med); border-radius: 14px;
          background: var(--bg-tile); box-shadow: var(--inset-tile, none);
        }
        .sv2-vtag { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: var(--accent); text-transform: uppercase; }
        @media (max-width: 720px) {
          .sv2-vars { grid-template-columns: 1fr; }
          .status-v2 { padding: 20px 16px; }
          .sv2-drow { gap: 14px; padding: 12px 0; }
          .sv2-sched { column-gap: 14px; }
          .sv2-lead { font-size: 17.5px; }
          .sv2-sub { font-size: 14px; }
          /* На телефоне калории и FODMAP — в столбик (разные строки), текст получает больше ширины */
          .sv2-nut { flex-direction: column; gap: 10px; }
        }
      `}</style>
    </motion.div>
  )
}
