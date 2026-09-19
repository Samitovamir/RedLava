/*
  "Status" — the day summed up by domain: a gauge on the left, personal AI advice on the right.
  Domain order: Stress · Schedule · Sport · Health · Nutrition.
  The advice for each domain comes from the AI (useAiSummary), with a deterministic
  threshold-based fallback when the AI is unavailable. CSS variables only, dark theme.
*/
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import DayProgress from './DayProgress.jsx'
import { Gauge } from '../ui'
import { STRESS_ZONES, READINESS_ZONES, LOW_GOOD_ZONES, stressColor, stressWord, batteryColor } from '../utils/scales.js'
import { recoveryColor } from '../utils/whoop.js'
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

// The component's strings. The pure functions below take the half of the dictionary they need
// (`s`), because they are declared outside the component and can't reach the hooks.
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
    planAheadWord: 'ahead', planOverWord: 'over', planDoneWord: 'done', goal: 'goal',
    recShort: 'rec.', loadShort: 'load',
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
    nutNoProfile: 'Open Nutrition and answer five questions — then the target is yours, not an average.',
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
    planAheadWord: 'впереди', planOverWord: 'перевып.', planDoneWord: 'выполнено', goal: 'цель',
    recShort: 'восст.', loadShort: 'нагр.',
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
    nutNoProfile: 'Загляни в «Питание» и ответь на пять вопросов — тогда норма будет твоя, а не усреднённая.',
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

// "Schedule" data with a TREND: this day's load relative to a TYPICAL day.
// The baseline is the average number of events per day across PAST days in the calendar (real
// history). The scale is calibrated so that a typical day sits near the middle (50): a marker
// further left means calmer than usual, further right busier. More history, a truer baseline.
function scheduleData(events, s) {
  const now = mskNow()
  const p = n => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const todays = events.filter(e => e.date === today).map(e => ({ start: e.start, title: e.title, m: toMin(e.start) }))
  const count = todays.length
  const next = todays.filter(e => e.m != null && e.m > nowMin).sort((a, b) => a.m - b.m)[0] || null

  // The baseline: average events/day over PAST days (today and the future excluded)
  const counts = {}
  for (const e of events) if (e.date && e.date < today) counts[e.date] = (counts[e.date] || 0) + 1
  const pastDays = Object.keys(counts)
  const baseline = pastDays.length >= 3 ? pastDays.reduce((acc, d) => acc + counts[d], 0) / pastDays.length : 2
  // A typical day (=baseline) lands on 50; 0 → 0; 2×baseline and above → 100
  const loadPct = Math.min(100, Math.round(count / (Math.max(1, baseline) * 2) * 100))
  const ratio = baseline > 0 ? count / baseline : (count ? 2 : 0)

  // One word under the number on the gauge: how much busier/freer than usual the day is
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

// Workout plan vs actual: today's plan from TrainingPeaks/Garmin plus what was actually done.
// No workout planned for today → null (the row isn't shown).
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

// Plan vs actual, 0–100% of the planned volume: short of plan is red, nearly there amber, done green.
const PLAN_ZONES = [
  { from: 0, to: 40, color: 'var(--status-crit)' },
  { from: 40, to: 70, color: 'var(--status-warn)' },
  { from: 70, to: 100, color: 'var(--status-ok)' },
]

// Training readiness: Garmin Training Readiness (0–100), otherwise Whoop recovery.
// Higher is better (unlike stress). The level and color come from thresholds.
function readyMeta(v, s) {
  if (v == null) return null
  if (v >= 75) return { w: s.readyHigh, c: 'var(--status-ok)' }
  if (v >= 50) return { w: s.readyMid, c: 'var(--status-warn)' }
  return { w: s.readyLow, c: 'var(--status-crit)' }
}

export default function TodaySignalV2() {
  const isMobile = useIsMobile()
  const gaugeSize = isMobile ? 116 : 128
  const s = useT(STR)
  const { lang } = useLang()
  const { events } = useEvents()
  const sched = scheduleData(events, s)
  const garmin = readLS('albert-garmin-live')
  const whoop = readLS('albert-whoop-live')

  // The workout plan (TrainingPeaks/Garmin): a guest gets the demo, otherwise the backend
  const [planned, setPlanned] = useState(() => (isGuest() ? demoPlanned(lang) : []))
  useEffect(() => {
    if (isGuest()) { setPlanned(demoPlanned(lang)); return }
    let ok = true
    fetch('/api/garmin/planned').then(r => r.json()).then(d => { if (ok) setPlanned(d?.planned || []) }).catch(() => {})
    return () => { ok = false }
  }, [])
  const planFact = sportPlanFact(planned, garmin, mskDateKey(), s)

  // Health: recovery + strain. The source is chosen automatically (Whoop→Garmin), as on the tab.
  // Whoop → recovery + strain(0–21). Garmin (no Whoop) → Body Battery: charge(recovery) + drained(strain), 0–100.
  const hSource = resolveSource(loadSourcePref(), whoop, garmin)
  let recovery = null, strain = null, strainMax = 21, hSourceLabel = null
  if (hSource === 'whoop') {
    recovery = whoop.recovery ?? null; strain = whoop.strain ?? null; strainMax = whoop.strainMax || 21; hSourceLabel = 'Whoop'
  } else if (hSource === 'garmin') {
    const bb = garmin?.bodyBattery
    recovery = bb?.current ?? null; strain = bb?.drained ?? null; strainMax = 100; hSourceLabel = s.bodyBattery
  }
  const hasHealth = recovery != null || strain != null
  const recColor = recovery == null ? 'var(--accent)' : hSource === 'garmin' ? batteryColor(recovery) : recoveryColor(recovery)
  const loadPct = strain != null ? strain / strainMax * 100 : null
  const balDiff = (recovery != null && loadPct != null) ? recovery - loadPct : null

  // Nutrition: calories (eaten/target) + the day's FODMAP (only when the diet is enabled)
  const nut = (() => { try { return nutritionToday() } catch { return null } })()
  const nutOk = !!nut?.hasData
  // Until the questionnaire is filled in there is no target — the gauge shows "—" instead of an
  // honest zero off a made-up figure (nutritionToday() always computes from the profile stub).
  const kcalPct = nutOk && !nut.profileIsPlaceholder && nut.target?.kcal
    ? Math.min(100, Math.round(nut.eaten / nut.target.kcal * 100))
    : null
  const kcalColor = nutOk && nut.eaten > (nut.target?.kcal || 0) ? 'var(--status-warn)' : 'var(--accent)'
  const fodEnabled = (() => { try { return loadPrefs().fodmap } catch { return false } })()
  const fod = (() => {
    if (!fodEnabled) return null   // the diet is off — no gauge
    try {
      const rec = loadIntake()?.[mskDateKey()]
      const entries = rec?.entries || []
      if (!entries.length) return { band: null, val: null, label: '—', color: 'var(--text-muted)' }  // on, but nothing eaten yet
      let hi = 0, mo = 0
      for (const e of entries) { const bnd = entryFodmap(e)?.band; if (bnd === 'high') hi++; else if (bnd === 'mod') mo++ }
      const band = hi ? 'high' : mo ? 'mod' : 'low'
      const val = band === 'high' ? 84 : band === 'mod' ? 50 : 16   // the marker's position on the low→high scale
      const m = fodmapMeta(band, lang)
      return { band, val, label: m.label, color: m.color }
    } catch { return null }
  })()
  // Sport · readiness
  const rd = garmin?.readiness
  const readyScore = rd?.score ?? whoop?.recovery ?? null
  const rm = readyMeta(readyScore, s)
  const str = garmin?.stress
  const value = str ? (str.recent ?? str.current ?? str.avg ?? null) : null
  const fresh = s.stressSource   // stress comes from Garmin (Whoop has no stress scale)

  // ── Personal AI advice per domain (what to do), with a deterministic fallback ──
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
  // While the questionnaire is unfilled the target comes from a stub — don't pass it off as personal
  const nutAdvice = nut?.profileIsPlaceholder
    ? s.nutNoProfile
    : (ai.питание || (!nutOk ? s.nutEmpty : nut.eaten > (nut.target?.kcal || 0) ? s.nutOver : s.nutLeft(nut.remaining)))
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
        {/* ───────── Stress ───────── */}
        <div className="sv2-drow">
          <div className="sv2-dgauge">
            <Gauge value={value} zones={STRESS_ZONES} size={gaugeSize} label={fresh}
              word={value != null ? stressWord(value, lang) : null} wordColor={value != null ? stressColor(value) : undefined} />
          </div>
          <div className="sv2-dtext">
            <span className="sv2-dtitle">{s.stress}</span>
            <p className="sv2-advice">{stressAdvice}</p>
          </div>
        </div>

        {/* ───────── Schedule ───────── */}
        <div className="sv2-sched">
          <div className="sv2-dgauge">
            <Gauge value={sched.loadPct} zones={LOW_GOOD_ZONES} center={sched.count} word={sched.word} wordColor={sched.color} size={gaugeSize} />
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

        {/* ───────── Sport · readiness ───────── */}
        {rm && (
          <div className="sv2-drow">
            <div className="sv2-dgauge">
              <Gauge value={readyScore} zones={READINESS_ZONES} word={rm.w} wordColor={rm.c} size={gaugeSize} />
            </div>
            <div className="sv2-dtext">
              <span className="sv2-dtitle">{s.sportReady}</span>
              <p className="sv2-advice">{readyAdvice}</p>
            </div>
          </div>
        )}

        {/* ───────── Sport · plan vs actual (only when a workout is planned) ───────── */}
        {planFact && (
          <div className="sv2-drow">
            <div className="sv2-dgauge">
              <Gauge value={Math.min(100, planFact.pct)} zones={PLAN_ZONES} center={planFact.pct} unit="%" size={gaugeSize}
                word={planFact.pct <= 0 ? s.planAheadWord : planFact.pct > 100 ? s.planOverWord : s.planDoneWord}
                wordColor={planFact.pct > 100 ? 'var(--status-extra)' : undefined}
                label={`${s.goal} · ${planFact.goalText}`} />
            </div>
            <div className="sv2-dtext">
              <span className="sv2-dtitle">{s.sportPlan}</span>
              <p className="sv2-advice">{planAdvice}</p>
            </div>
          </div>
        )}

        {/* ───────── Health ───────── */}
        {hasHealth && (
          <div className="sv2-drow">
            <div className="sv2-dgauge">
              {/* The inner arc leaves no room for a third line in the middle, so the strain
                  reading and its color key sit under the dial with the source */}
              <Gauge value={recovery} color={recColor} unit="%" size={gaugeSize}
                word={recovery != null ? s.recShort : null} wordColor={recColor}
                inner={strain != null ? { value: strain, max: strainMax, color: 'var(--accent)' } : null}
                ariaLabel={[s.health, recovery != null && `${recovery}% ${s.recShort}`, strain != null && `${s.loadShort} ${strain}`].filter(Boolean).join(', ')}
                label={<>
                  {strain != null && <span className="sv2-load"><i className="sv2-key" />{s.loadShort} {strain}</span>}
                  {hSourceLabel && <span className="sv2-src">{hSourceLabel}</span>}
                </>} />
            </div>
            <div className="sv2-dtext">
              <span className="sv2-dtitle">{s.health}</span>
              <p className="sv2-advice">{healthAdvice}</p>
            </div>
          </div>
        )}

        {/* ───────── Nutrition (calories + FODMAP semicircle when the diet is on) ───────── */}
        {nutOk && (
          <div className="sv2-drow">
            <div className="sv2-dgauge sv2-nut">
              <div className="sv2-nut-g">
                <Gauge value={kcalPct} color={kcalColor} center={kcalPct == null ? undefined : nut.eaten} label={s.calories} size={gaugeSize} />
              </div>
              {fod && (
                <div className="sv2-nut-g">
                  <Gauge value={fod.val} zones={LOW_GOOD_ZONES} center={false} word={fod.label} wordColor={fod.color} label="FODMAP" size={gaugeSize} />
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
        /* One column — each domain on its own row (maybe two per row later). */
        .sv2-domains { display: flex; flex-direction: column; }
        .sv2-drow {
          display: grid; grid-template-columns: auto 1fr; gap: 18px; align-items: center;
          padding: 14px 0; min-width: 0;
        }
        .sv2-dgauge { display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0; }
        .sv2-nut { flex-direction: row; align-items: flex-start; gap: 14px; }
        .sv2-nut-g { display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .sv2-key { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); margin-right: 5px; vertical-align: 1px; }
        .sv2-load { display: block; font-variant-numeric: tabular-nums; }
        .sv2-src { display: block; font-weight: 500; color: var(--text-muted); }
        .sv2-dtext { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .sv2-dtitle { font-size: 11.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 2px; }
        /* Per-domain AI advice (what to do) instead of retelling the chart */
        .sv2-advice { font-size: 15px; line-height: 1.5; color: var(--text-body); overflow-wrap: anywhere; }
        /* Schedule: a 2×2 grid — [gauge | text] on top, [HP bar | next event] below.
           The HP bar sits under the gauge automatically (same column = same x axis). */
        .sv2-sched {
          display: grid; grid-template-columns: auto 1fr;
          column-gap: 18px; row-gap: 12px; align-items: center; padding: 14px 0;
        }
        .sv2-sched-bar { min-width: 0; }
        .sv2-sched-next {
          font-size: 13px; color: var(--text-secondary); min-width: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .sv2-next-t { font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
        @media (max-width: 720px) {
          .status-v2 { padding: 20px 16px; }
          .sv2-drow { gap: 14px; padding: 12px 0; }
          .sv2-sched { column-gap: 14px; }
          /* On a phone calories and FODMAP stack (separate rows), giving the text more width */
          .sv2-nut { flex-direction: column; gap: 10px; }
        }
      `}</style>
    </motion.div>
  )
}
