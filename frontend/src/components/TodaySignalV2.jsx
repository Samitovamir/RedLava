/*
  «Статус» — НОВАЯ версия (в разработке). Заполняем вместе по порядку доменами:
  график слева — текстовая ИИ-мысль справа.
  Порядок (из наброска владельца): Стресс · Расписание · Спорт · Здоровье · Питание.

  ГОТОВО: «Стресс» — полукруглый гейдж с зонами+маркером (StressArc) слева, короткая
  мысль (Т1) справа. Дальше добавляем «Расписание».
  Только CSS-переменные, тёмная тема, тексты на русском.
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
import { useLang } from '../context/LanguageContext.jsx'
import { buildSignalData, DOMAIN_ADVICE_CONTEXT, parseAdvice } from '../utils/daySignal.js'

function readLS(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null } catch { return null }
}

// Русское склонение по числу (1 событие / 2 события / 5 событий)
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

const toMin = h => { const m = /^(\d{1,2}):(\d{2})/.exec(h || ''); return m ? +m[1] * 60 + +m[2] : null }

// Данные «Расписания» с ТЕНДЕНЦИЕЙ: загрузка этого дня относительно ОБЫЧНОГО дня.
// Базовая линия — среднее число событий в день по ПРОШЛЫМ дням из календаря (реальная
// история). Шкала калибруется так, что обычный день ≈ середина (50): маркер левее —
// спокойнее обычного, правее — плотнее. Чем больше истории, тем точнее база.
function scheduleData(events) {
  const now = mskNow()
  const p = n => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const todays = events.filter(e => e.date === today).map(e => ({ start: e.start, title: e.title, m: toMin(e.start) }))
  const count = todays.length
  const passed = todays.filter(e => e.m != null && e.m <= nowMin).length
  const next = todays.filter(e => e.m != null && e.m > nowMin).sort((a, b) => a.m - b.m)[0] || null

  // База: среднее событий/день по ПРОШЛЫМ дням (исключаем сегодня и будущее)
  const counts = {}
  for (const e of events) if (e.date && e.date < today) counts[e.date] = (counts[e.date] || 0) + 1
  const pastDays = Object.keys(counts)
  const baseline = pastDays.length >= 3 ? pastDays.reduce((s, d) => s + counts[d], 0) / pastDays.length : 2
  // Обычный день (=baseline) попадает на 50; 0 → 0; 2×baseline и выше → 100
  const loadPct = Math.min(100, Math.round(count / (Math.max(1, baseline) * 2) * 100))
  const ratio = baseline > 0 ? count / baseline : (count ? 2 : 0)

  let lead, word
  if (count === 0) { lead = 'Свободный день'; word = 'свободно' }
  else if (ratio > 1.4) { lead = 'Насыщенный день'; word = 'плотнее' }
  else if (ratio < 0.6) { lead = 'Разгруженный день'; word = 'спокойнее' }
  else { lead = 'Размеренный день'; word = 'как обычно' }

  const title = next?.title ? (next.title.length > 26 ? next.title.slice(0, 25) + '…' : next.title) : null
  let nextLine
  if (count === 0) nextLine = null
  else if (next) nextLine = { time: next.start, title }
  else nextLine = 'События позади'

  // Описательная фраза дня (без следующего события — оно отдельной строкой снизу)
  let daySentence
  if (count === 0) daySentence = 'Сегодня событий нет — день свободен'
  else {
    const chr = ratio > 1.4 ? 'день довольно плотный' : ratio < 0.6 ? 'день относительно свободный' : 'в привычном ритме'
    daySentence = `Сегодня ${count} ${plural(count, 'событие', 'события', 'событий')}, ${chr}`
  }

  const color = loadPct >= 66 ? 'var(--status-crit)' : loadPct >= 33 ? 'var(--status-warn)' : 'var(--status-ok)'
  return { count, passed, loadPct, lead, word, color, todays, next, nowMin, nextLine, daySentence }
}

function stressWord(v) {
  if (v <= 25) return 'покой'
  if (v <= 50) return 'низкий'
  if (v <= 75) return 'средний'
  return 'высокий'
}

// Т1 — короткая мысль: выразительная главная фраза + поддержка
function stressText(v, word) {
  if (v == null) return { lead: 'Стресс пока не известен', sub: 'Garmin ещё не прислал замеры за последний час.' }
  const calm = v <= 50
  return calm
    ? { lead: 'Фон спокойный', sub: `${v} из 100 — ${word}. День можно вести в обычном темпе.` }
    : { lead: 'Есть напряжение', sub: `${v} из 100 — ${word}. Стоит сбавить обороты.` }
}

const r1 = x => Math.round(x * 10) / 10
// Garmin иногда отдаёт код-энум вместо текста (напр. LOW_RT_MOD_OR_HIGH) — не показываем его
const isEnum = s => typeof s === 'string' && /^[A-Z0-9][A-Z0-9_]{3,}$/.test(s.trim())

// План/факт тренировки: план из TrainingPeaks/Garmin на сегодня + факт выполнения.
// Нет плановой тренировки на сегодня → null (строка не показывается).
function sportPlanFact(planned, garmin, todayKey) {
  const pToday = (planned || []).filter(w => w.date === todayKey)
  if (!pToday.length) return null
  const useDist = pToday.some(w => w.distanceKm > 0)
  const planVal = pToday.reduce((s, w) => s + (useDist ? (w.distanceKm || 0) : (w.durationMin || 0)), 0)
  if (planVal <= 0) return null
  const dToday = (garmin?.workouts || []).filter(w => w.date === todayKey)
  const factVal = dToday.reduce((s, w) => s + (useDist ? (w.distanceKm || 0) : (w.durationMin || 0)), 0)
  const pct = Math.round(factVal / planVal * 100)
  const unit = useDist ? 'км' : 'мин'
  const goalText = `${r1(planVal)} ${unit}`
  const title = pToday[0].title || 'Тренировка'
  const time = pToday[0].time || null
  let lead
  if (pct <= 0) lead = 'Тренировка впереди'
  else if (pct > 100) lead = `Перевыполнено ${pct}%`
  else if (pct >= 100) lead = 'План выполнен'
  else lead = `Выполнено ${pct}%`
  const sub = pct <= 0
    ? `${title} · цель ${goalText}${time ? ` к ${time}` : ''}`
    : `${title} · ${r1(factVal)} из ${r1(planVal)} ${unit}`
  return { pct, goalText, lead, sub }
}

// Готовность к тренировкам: Garmin Training Readiness (0–100), иначе — Whoop recovery.
// Выше — лучше (в отличие от стресса). Уровень/цвет/лид по порогам.
function readyMeta(v) {
  if (v == null) return null
  if (v >= 75) return { w: 'высокая', c: 'var(--status-ok)', lead: 'Готов к нагрузке' }
  if (v >= 50) return { w: 'средняя', c: 'var(--status-warn)', lead: 'Умеренная готовность' }
  return { w: 'низкая', c: 'var(--status-crit)', lead: 'Нужно восстановление' }
}

export default function TodaySignalV2() {
  const isMobile = useIsMobile()
  const gaugeSize = isMobile ? 132 : 156
  const { events } = useEvents()
  const sched = scheduleData(events)
  const garmin = readLS('albert-garmin-live')
  const whoop = readLS('albert-whoop-live')

  // План тренировок (TrainingPeaks/Garmin): гость → демо, иначе — с бэкенда
  const [planned, setPlanned] = useState(() => (isGuest() ? demoPlanned() : []))
  useEffect(() => {
    if (isGuest()) { setPlanned(demoPlanned()); return }
    let ok = true
    fetch('/api/garmin/planned').then(r => r.json()).then(d => { if (ok) setPlanned(d?.planned || []) }).catch(() => {})
    return () => { ok = false }
  }, [])
  const planFact = sportPlanFact(planned, garmin, mskDateKey())

  // Здоровье: восстановление + нагрузка. Источник авто (Whoop→Garmin), как на вкладке.
  // Whoop → recovery + strain(0–21). Garmin (без Whoop) → Body Battery: заряд(восст.) + потрачено(нагрузка), 0–100.
  const hSource = resolveSource(loadSourcePref(), whoop, garmin)
  let recovery = null, strain = null, strainMax = 21, hSourceLabel = null
  if (hSource === 'whoop') {
    recovery = whoop.recovery ?? null; strain = whoop.strain ?? null; strainMax = whoop.strainMax || 21; hSourceLabel = 'Whoop'
  } else if (hSource === 'garmin') {
    const bb = garmin?.bodyBattery
    recovery = bb?.current ?? null; strain = bb?.drained ?? null; strainMax = 100; hSourceLabel = 'Garmin · заряд тела'
  }
  const hasHealth = recovery != null || strain != null
  const loadPct = strain != null ? strain / strainMax * 100 : null
  const balDiff = (recovery != null && loadPct != null) ? recovery - loadPct : null
  const healthLead = balDiff == null ? 'Данные Whoop' : balDiff >= 15 ? 'Есть запас' : balDiff <= -15 ? 'Организм под нагрузкой' : 'В балансе'
  const healthSub = balDiff == null ? 'Восстановление и нагрузка пока не собраны'
    : balDiff >= 15 ? 'Восстановление выше нагрузки — тело готово к объёму'
    : balDiff <= -15 ? 'Нагрузка выше восстановления — стоит разгрузиться'
    : 'Восстановление и нагрузка примерно вровень'

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
      const m = fodmapMeta(band)
      return { band, val, label: m.label, color: m.color }
    } catch { return null }
  })()
  const nutLead = !nutOk ? 'Питание' : nut.eaten > (nut.target?.kcal || 0) ? 'Небольшой перебор' : nut.eaten < (nut.target?.kcal || 0) * 0.2 ? 'День только начался' : `Осталось ${nut.remaining} ккал`
  const nutSub = !nutOk ? 'Дневник питания пуст' : `Съедено ${nut.eaten} из ${nut.target.kcal} ккал${fod?.band ? ` · FODMAP ${fod.label.toLowerCase()}` : ''}`

  // Спорт · готовность
  const rd = garmin?.readiness
  const readyScore = rd?.score ?? whoop?.recovery ?? null
  const readySource = rd ? 'Garmin · готовность' : (whoop?.recovery != null ? 'Whoop · восстановление' : null)
  const rm = readyMeta(readyScore)
  const rdFeedback = rd?.feedback && !isEnum(rd.feedback) ? rd.feedback : null   // не показываем код-энум
  const readySub = rdFeedback
    || (readyScore == null ? 'Готовность пока не известна'
      : readyScore >= 66 ? 'Тело восстановилось — можно давать нагрузку'
      : readyScore >= 33 ? 'Восстановление ещё идёт — умеренная нагрузка'
      : 'Организму нужен отдых, нагрузку лучше отложить')
  const str = garmin?.stress
  const value = str ? (str.recent ?? str.current ?? str.avg ?? null) : null
  const word = value != null ? stressWord(value) : null
  const fresh = 'за последний час'   // без метки времени — иначе подпись шире гейджа и всё съезжает

  // ── Персональные ИИ-советы по доменам (что делать), с детерминированным фолбэком ──
  const { facts } = useMemoryFacts()
  const { lang } = useLang()
  const adviceSummary = useAiSummary({
    id: 'status-advice-v2',
    context: DOMAIN_ADVICE_CONTEXT + (lang === 'en' ? '\nReply in English; keep field labels in Russian (Стресс/Расписание/Спорт/Здоровье/Питание).' : ''),
    snapshot: buildSignalData({ events, facts }),
    message: 'Дай короткий совет по каждому разделу строго по формату.',
    fallback: ''
  })
  const ai = adviceSummary.text ? parseAdvice(adviceSummary.text) : {}
  const stressAdvice = ai.стресс || (value == null ? 'Данных о стрессе пока нет.' : value <= 50 ? 'Стресс низкий — удачное окно для дел на концентрацию или качественной тренировки.' : 'Стресс повышен — сбавь темп и сделай паузу перед нагрузкой.')
  const schedAdvice = ai.расписание || (sched.count === 0 ? 'День свободный — закрой отложенное или добавь тренировочный объём.' : sched.loadPct >= 66 ? 'День плотный — заложи буфер между делами, тяжёлую тренировку не ставь впритык.' : 'День размеренный — успеваешь без спешки.')
  const readyAdvice = ai.спорт || (readyScore == null ? 'Данных о готовности пока нет.' : readyScore >= 75 ? 'Готовность высокая — можно провести ключевую тренировку.' : readyScore >= 50 ? 'Готовность средняя — умеренная нагрузка по силам, без максимума.' : 'Готовность низкая — сегодня лучше лёгкая аэробная или отдых.')
  const healthAdvice = ai.здоровье || (balDiff == null ? 'Данные восстановления пока не собраны.' : balDiff >= 15 ? 'Есть запас восстановления — можно взять нагрузку без риска перебора.' : balDiff <= -15 ? 'Нагрузка обгоняет восстановление — сегодня разгрузись и добери сон.' : 'Восстановление и нагрузка вровень — держи привычный темп.')
  const nutAdvice = ai.питание || (!nutOk ? 'Залогируй приёмы, чтобы видеть баланс дня.' : nut.eaten > (nut.target?.kcal || 0) ? 'Норма закрыта — вечером лучше лёгкий белковый приём.' : `Осталось ${nut.remaining} ккал — сделай упор на белок в оставшихся приёмах.`)
  const planAdvice = planFact && (planFact.pct <= 0 ? 'Тренировка впереди — держи цель, но не выкладывайся заранее.' : planFact.pct > 100 ? 'План перевыполнен — не добавляй лишнего, дай телу восстановиться.' : planFact.pct >= 100 ? 'План закрыт — дальше восстановление.' : 'До плана немного осталось — добери объём позже или засчитай как есть.')

  return (
    <motion.div
      className="card status-v2"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <span className="sv2-eyebrow">Статус</span>

      <div className="sv2-domains">
        {/* ───────── Стресс ───────── */}
        <div className="sv2-drow">
          <div className="sv2-dgauge">
            <StressArc value={value} size={gaugeSize} />
            <span className="sv2-note">{fresh}</span>
          </div>
          <div className="sv2-dtext">
            <span className="sv2-dtitle">Стресс</span>
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
            <span className="sv2-dtitle">Расписание</span>
            <p className="sv2-advice">{schedAdvice}</p>
          </div>
          <div className="sv2-sched-bar">
            <DayProgress todays={sched.todays} nowMin={sched.nowMin} />
          </div>
          <div className="sv2-sched-next">
            {sched.nextLine && (typeof sched.nextLine === 'string'
              ? sched.nextLine
              : <>Дальше · <span className="sv2-next-t">{sched.nextLine.time}</span> · {sched.nextLine.title}</>)}
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
              <span className="sv2-dtitle">Спорт · готовность к тренировкам</span>
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
              <span className="sv2-dtitle">Спорт · план/факт</span>
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
              <span className="sv2-dtitle">Здоровье</span>
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
                <span className="sv2-note">калории</span>
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
              <span className="sv2-dtitle">Питание</span>
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
