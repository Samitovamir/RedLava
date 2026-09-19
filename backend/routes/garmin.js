import { Router } from 'express'
import { GarminConnect } from 'garmin-connect'
import { requireAuth } from '../authGuard.js'
import { kvGetScoped, kvSetScoped, kvDelScoped, scopeOf } from '../userScope.js'
import { msg as uiMsg } from '../messages.js'
import { attemptKey, tooManyFails, recordFail, minutesLeft } from '../rateLimit.js'

const router = Router()
// Key prefix; the real key carries the data owner's id (see userScope.js)
const TOKEN_KEY = 'garmin:token'

// Garmin workout type names → Russian
const TYPE_RU = {
  running: 'Бег', treadmill_running: 'Бег (дорожка)', trail_running: 'Трейл',
  cycling: 'Велосипед', indoor_cycling: 'Велотренажёр', road_biking: 'Велосипед',
  walking: 'Ходьба', hiking: 'Поход',
  lap_swimming: 'Плавание', open_water_swimming: 'Плавание',
  strength_training: 'Силовая', cardio: 'Кардио', yoga: 'Йога', fitness_equipment: 'Тренажёры',
  elliptical: 'Эллипсоид'
}

// Garmin training-effect labels → Russian
const TE_RU = {
  RECOVERY: 'Восстановительная', BASE: 'Базовая', AEROBIC_BASE: 'Аэробная база',
  TEMPO: 'Темповая', THRESHOLD: 'Пороговая', LACTATE_THRESHOLD: 'Лактатный порог',
  VO2MAX: 'МПК', ANAEROBIC_CAPACITY: 'Анаэробная', SPRINT: 'Спринт',
  MAINTAINING: 'Поддержание', IMPACTING: 'Развивающая', HIGHLY_IMPACTING: 'Высокая нагрузка',
  NO_BENEFIT: 'Без эффекта', OVERREACHING: 'Перегрузка'
}

const round = (n, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f }

// Base of Garmin's internal API (the same host that serves workout details)
const CONNECT = 'https://connectapi.garmin.com'
// "Today" as a Moscow date (the owner is in Moscow; the Vercel server runs in UTC — otherwise midnight gets confusing)
function mskDateStr() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Planned (upcoming) workouts from the Garmin calendar.
// TrainingPeaks plans land here too, as long as it is linked to Garmin.
// We take the current and the next month and keep the future ones. Garmin's month is 0-indexed.
// Is this a planned (not yet completed) workout?
function isPlannedItem(it) {
  const t = String(it.itemType || '').toLowerCase()
  if (t === 'activity') return false                 // already completed
  if (/workout/.test(t)) return true                 // a structured planned workout
  if (it.workoutId && (!t || /plan|scheduled|training/.test(t))) return true
  return false
}

async function getPlanned(c) {
  const base = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
  const todayStr = mskDateStr()
  const out = []
  const typesSeen = {}
  let totalItems = 0
  for (const off of [0, 1]) {
    const d = new Date(base.getFullYear(), base.getMonth() + off, 1)
    try {
      const r = await c.client.get(`${CONNECT}/calendar-service/year/${d.getFullYear()}/month/${d.getMonth()}`)
      const items = r?.calendarItems || []
      totalItems += items.length
      for (const it of items) {
        const tt = String(it.itemType || '—')
        typesSeen[tt] = (typesSeen[tt] || 0) + 1
        if (!isPlannedItem(it)) continue
        const date = it.date || it.scheduledDate
        if (!date || date < todayStr) continue
        const durSec = it.estimatedDurationInSecs ?? it.duration ?? null
        const rawTime = it.scheduledStartTime || it.startTime || null
        const time = rawTime ? String(rawTime).replace(/^.*?T/, '').slice(0, 5) : null
        out.push({
          id: String(it.id ?? it.workoutId ?? `${date}-${it.title || 'w'}`),
          date,
          title: it.title || 'Тренировка',
          sport: it.sportTypeKey || it.workoutTypeKey || '',
          durationMin: durSec ? Math.round(durSec / 60) : null,
          distanceKm: it.distanceInMeters ? round(it.distanceInMeters / 1000, 1) : null,
          time: /^\d{2}:\d{2}$/.test(time || '') ? time : null
        })
      }
    } catch (e) { typesSeen['_error'] = String(e?.message || e).slice(0, 80) }
  }
  out.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
  return { planned: out.slice(0, 20), debug: { totalItems, typesSeen } }
}

// Body Battery — the "charge left": the current value plus how much was charged/drained today.
// This is a LIVE figure (it moves through the day), unlike Whoop's morning Recovery.
async function getBodyBattery(c, dateStr) {
  try {
    const r = await c.client.get(`${CONNECT}/wellness-service/wellness/bodyBattery/reports/daily?startDate=${dateStr}&endDate=${dateStr}`)
    const day = Array.isArray(r) ? r[0] : r
    if (!day) return null
    const arr = day.bodyBatteryValuesArray || []
    let current = null
    for (let i = arr.length - 1; i >= 0; i--) { if (arr[i] && arr[i][2] != null) { current = arr[i][2]; break } }
    if (current == null && day.bodyBatteryMostRecentValue != null) current = day.bodyBatteryMostRecentValue
    return { current, charged: day.charged ?? null, drained: day.drained ?? null }
  } catch { return null }
}

// Garmin stress (0–100). An array of samples taken every ~3 min: [timestamp_ms, value].
// We return the last valid sample plus its timestamp (so it can be captioned "updated HH:MM"), a rolling
// average over the last ~hour (close to "now", but without the noise of a single spike), and the day's avg/max.
async function getStress(c, dateStr) {
  try {
    const r = await c.client.get(`${CONNECT}/wellness-service/wellness/dailyStress/${dateStr}`)
    if (!r) return null
    const arr = r.stressValuesArray || []
    let current = null, currentTs = null
    for (let i = arr.length - 1; i >= 0; i--) {
      const ts = arr[i]?.[0], v = arr[i]?.[1]
      if (v != null && v >= 0) { current = v; currentTs = ts ?? null; break }
    }
    // Average of the valid samples from the last 60 minutes (relative to the latest sample)
    let recent = null
    if (currentTs != null) {
      const win = 60 * 60 * 1000
      const vals = arr.filter(p => p?.[1] != null && p[1] >= 0 && p[0] != null && (currentTs - p[0]) <= win).map(p => p[1])
      if (vals.length) recent = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
    }
    const avg = r.avgStressLevel >= 0 ? r.avgStressLevel : null
    const max = r.maxStressLevel >= 0 ? r.maxStressLevel : null
    if (current == null && avg == null && max == null) return null
    return { current, currentTs, recent, avg, max }
  } catch { return null }
}

// Training Readiness (0–100) — Garmin's composite score: sleep, recovery, HRV, acute
// load, stress history. The internal endpoint returns an array of the day's samples,
// so we take the freshest one. The level and the factors match the Garmin app
// (they feed the "why is readiness what it is" text).
const TR_LEVEL_RU = { NONE: 'нет данных', LOW: 'низкая', MODERATE: 'средняя', HIGH: 'высокая', MAXIMUM: 'высокая' }
async function getTrainingReadiness(c, dateStr) {
  try {
    const r = await c.client.get(`${CONNECT}/metrics-service/metrics/trainingreadiness/${dateStr}`)
    const arr = Array.isArray(r) ? r : (r ? [r] : [])
    if (!arr.length) return null
    // the freshest one by timestamp
    const d = arr.slice().sort((a, b) => (b?.timestamp || 0) > (a?.timestamp || 0) ? 1 : -1)[0]
    if (d?.score == null) return null
    return {
      score: d.score,
      level: d.level || null,
      levelRu: TR_LEVEL_RU[d.level] || null,
      feedback: d.feedbackLong || d.feedbackShort || null,
      sleepScore: d.sleepScore ?? null,
      recoveryTime: d.recoveryTime ?? null,      // minutes until fully recovered
      hrvFactor: d.hrvFactorPercent ?? null,
      acuteLoad: d.acuteLoad ?? null,
      timestamp: d.timestamp ?? null
    }
  } catch { return null }
}

// ── Advanced Garmin metrics (Training Status/Load, HRV, predictions, Endurance/Hill,
//    lactate threshold, intensity minutes). These are Garmin's internal endpoints; the
//    fields can differ between firmware versions, so everything is parsed LENIENTLY
//    (optional chaining; any one metric that fails → null, the others are unaffected).
//    To be validated on a user's first real Garmin sync.
const TS_STATUS_RU = { PRODUCTIVE: 'Продуктивно', MAINTAINING: 'Поддержание', PEAKING: 'Пик формы', RECOVERY: 'Восстановление', UNPRODUCTIVE: 'Непродуктивно', OVERREACHING: 'Перегрузка', DETRAINING: 'Детренинг', STRAINED: 'Перенапряжение', NO_STATUS: 'Нет данных' }
const TL_BALANCE_RU = { OPTIMAL: 'Оптимально', LOW: 'Ниже нормы', HIGH: 'Выше нормы', VERY_LOW: 'Сильно ниже', VERY_HIGH: 'Сильно выше' }
const HRV_STATUS_RU = { BALANCED: 'Сбалансировано', UNBALANCED: 'Разбалансировано', LOW: 'Низкое', POOR: 'Плохое', NONE: 'Нет данных' }
const fmtRace = s => { if (!s || s <= 0) return null; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}` }
const firstDev = map => (map && typeof map === 'object') ? Object.values(map)[0] : null

async function getDisplayName(c) {
  try { const r = await c.client.get(`${CONNECT}/userprofile-service/socialProfile`); return r?.displayName || null } catch { return null }
}

async function getTrainingStatusLoad(c, dateStr) {
  try {
    const r = await c.client.get(`${CONNECT}/metrics-service/metrics/trainingstatus/aggregated/${dateStr}`)
    if (!r) return { trainingStatus: null, trainingLoad: null }
    // Training Status (the most recent device)
    const tsDev = firstDev(r.mostRecentTrainingStatus?.latestTrainingStatusData)
    let trainingStatus = null
    if (tsDev) {
      const key = tsDev.trainingStatusFeedbackPhrase?.split('_')?.[0] || (typeof tsDev.trainingStatus === 'string' ? tsDev.trainingStatus : null)
      trainingStatus = {
        status: key || null,
        statusRu: (key && TS_STATUS_RU[key]) || null,
        feedback: tsDev.trainingStatusFeedbackPhrase ? null : null,   // the hint phrase arrives as a code; the frontend derives the text from the status
        vo2Max: tsDev.vo2Max ?? tsDev.maxMetCategoryValue ?? null
      }
    }
    // Training Load balance + acute/chronic load
    const balDev = firstDev(r.mostRecentTrainingLoadBalance?.metricsTrainingLoadBalanceDTOMap)
    const acuteDev = firstDev(r.mostRecentTrainingStatus?.latestTrainingStatusData)
    let trainingLoad = null
    if (balDev || acuteDev) {
      const low = balDev?.monthlyLoadAerobicLow, high = balDev?.monthlyLoadAerobicHigh, an = balDev?.monthlyLoadAnaerobic
      const sum = (low || 0) + (high || 0) + (an || 0)
      const pct = v => sum > 0 ? Math.round((v || 0) / sum * 100) : 0
      const acute = acuteDev?.acuteTrainingLoadDTO?.dailyTrainingLoadAcute ?? acuteDev?.dailyTrainingLoadAcute ?? null
      const chronic = acuteDev?.acuteTrainingLoadDTO?.dailyTrainingLoadChronic ?? acuteDev?.dailyTrainingLoadChronic ?? null
      const acwr = acuteDev?.acuteTrainingLoadDTO?.dailyAcuteChronicWorkloadRatio ?? null
      const balKey = balDev?.trainingBalanceFeedbackPhrase?.split('_')?.[0] || null
      trainingLoad = {
        acute: acute != null ? Math.round(acute) : null,
        chronic: chronic != null ? Math.round(chronic) : null,
        ratio: acwr != null ? Math.round(acwr * 100) / 100 : null,
        balanceKey: balKey, balanceRu: (balKey && TL_BALANCE_RU[balKey]) || null,
        focus: sum > 0 ? { low: pct(low), high: pct(high), anaerobic: pct(an) } : null
      }
    }
    return { trainingStatus, trainingLoad }
  } catch { return { trainingStatus: null, trainingLoad: null } }
}

async function getHrvStatus(c, dateStr) {
  try {
    const r = await c.client.get(`${CONNECT}/hrv-service/hrv/${dateStr}`)
    const h = r?.hrvSummary
    if (!h || h.lastNightAvg == null) return null
    const key = h.status || null
    return {
      lastNight: h.lastNightAvg, weeklyAvg: h.weeklyAvg ?? null,
      statusKey: key, statusRu: (key && HRV_STATUS_RU[key]) || null,
      low: h.baseline?.balancedLow ?? h.baseline?.lowUpper ?? null,
      high: h.baseline?.balancedUpper ?? h.baseline?.markerValue ?? null
    }
  } catch { return null }
}

async function getRacePredictions(c, displayName) {
  if (!displayName) return null
  try {
    const r = await c.client.get(`${CONNECT}/metrics-service/metrics/racepredictions/latest/${displayName}`)
    const d = Array.isArray(r) ? r[0] : r
    if (!d) return null
    const out = { fiveK: fmtRace(d.time5K), tenK: fmtRace(d.time10K), half: fmtRace(d.timeHalfMarathon), marathon: fmtRace(d.timeMarathon) }
    return (out.fiveK || out.tenK || out.half || out.marathon) ? out : null
  } catch { return null }
}

async function getEnduranceScore(c, dateStr) {
  try {
    const r = await c.client.get(`${CONNECT}/metrics-service/metrics/endurancescore?calendarDate=${dateStr}`)
    const score = r?.overallScore ?? r?.avg ?? null
    return score != null ? { score: Math.round(score), levelRu: null } : null
  } catch { return null }
}

async function getHillScore(c, dateStr) {
  try {
    const r = await c.client.get(`${CONNECT}/metrics-service/metrics/hillscore?startDate=${dateStr}&endDate=${dateStr}`)
    const d = Array.isArray(r?.hillScoreDTOList) ? r.hillScoreDTOList[0] : (Array.isArray(r) ? r[0] : r)
    const score = d?.overallScore ?? d?.hillScore ?? null
    return score != null ? { score: Math.round(score), levelRu: null } : null
  } catch { return null }
}

async function getIntensityMinutes(c, displayName, dateStr) {
  if (!displayName) return null
  try {
    const r = await c.client.get(`${CONNECT}/usersummary-service/usersummary/daily/${displayName}?calendarDate=${dateStr}`)
    const mod = r?.moderateIntensityMinutes ?? 0, vig = r?.vigorousIntensityMinutes ?? 0
    const goal = r?.intensityMinutesGoal ?? 150
    const weekly = mod + vig * 2   // Garmin counts vigorous minutes double
    return (mod || vig) ? { weekly, goal } : null
  } catch { return null }
}

// Collect every advanced metric in parallel (each one guarded on its own)
async function getAdvancedMetrics(c, dateStr) {
  const displayName = await getDisplayName(c)
  const [tsl, hrvStatus, racePredictions, enduranceScore, hillScore, intensityMinutes] = await Promise.all([
    getTrainingStatusLoad(c, dateStr), getHrvStatus(c, dateStr), getRacePredictions(c, displayName),
    getEnduranceScore(c, dateStr), getHillScore(c, dateStr), getIntensityMinutes(c, displayName, dateStr)
  ])
  return { trainingStatus: tsl.trainingStatus, trainingLoad: tsl.trainingLoad, hrvStatus, racePredictions, enduranceScore, hillScore, intensityMinutes }
}

// Running pace from average speed (m/s) → a "min:sec / km" string
function paceFromSpeed(mps) {
  if (!mps || mps <= 0) return null
  const secPerKm = 1000 / mps
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function clientFromToken(t) {
  // The library's constructor demands credentials even when we load a ready-made token — hand it a stub
  const c = new GarminConnect({ username: 'token', password: 'token' })
  c.loadToken(t.oauth1, t.oauth2)
  return c
}

function mapActivity(a) {
  const typeKey = a.activityType?.typeKey || 'other'
  const isRun = /run/.test(typeKey)
  const isCycle = /cycl|bik/.test(typeKey)
  return {
    id: a.activityId || null,
    type: typeKey,
    title: a.activityName || TYPE_RU[typeKey] || 'Тренировка',
    label: TYPE_RU[typeKey] || typeKey,
    distanceKm: a.distance ? round(a.distance / 1000, 1) : null,
    durationMin: a.duration ? Math.round(a.duration / 60) : null,
    avgHr: a.averageHR ? Math.round(a.averageHR) : null,
    maxHr: a.maxHR ? Math.round(a.maxHR) : null,
    calories: a.calories ? Math.round(a.calories) : null,
    date: (a.startTimeLocal || '').slice(0, 10),
    // advanced metrics (we surface only what's actually there)
    pace: isRun ? paceFromSpeed(a.averageSpeed) : null,                                   // min/km for runs
    speedKmh: (isCycle && a.averageSpeed) ? round(a.averageSpeed * 3.6, 1) : null,         // km/h for rides
    elevationGain: a.elevationGain ? Math.round(a.elevationGain) : null,                   // elevation gain, m
    cadence: a.averageRunningCadenceInStepsPerMinute ? Math.round(a.averageRunningCadenceInStepsPerMinute) : null,
    avgPower: a.avgPower ? Math.round(a.avgPower) : null,                                  // average power, W
    vo2Max: a.vO2MaxValue ? Math.round(a.vO2MaxValue) : null,
    trainingEffect: a.aerobicTrainingEffect ? round(a.aerobicTrainingEffect, 1) : null,   // 0–5
    trainingLabel: a.trainingEffectLabel ? (TE_RU[a.trainingEffectLabel] || null) : null
  }
}

// Connect: sign in with login/password → store the session token.
// This forwards a username and password to Garmin, so without a limit anyone with an account
// here could use this server to try password lists against other people's Garmin accounts —
// from our IP, which Garmin would then block for everyone. Failed attempts are capped per IP.
const GARMIN_MAX_FAILS = 6

router.post('/connect', requireAuth, async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ success: false, message: uiMsg(req, 'garminCreds') })
  const key = attemptKey('garmin', req)
  if (await tooManyFails(key, GARMIN_MAX_FAILS)) {
    return res.status(429).json({ success: false, error: 'too_many_attempts', retryInMinutes: minutesLeft() })
  }
  try {
    const c = new GarminConnect({ username: email, password })
    await c.login(email, password)
    const token = c.exportToken()
    await kvSetScoped(TOKEN_KEY, scopeOf(req), token)
    res.json({ success: true })
  } catch (err) {
    await recordFail(key)
    const msg = String(err?.message || '')
    if (/mfa|two|verification|code/i.test(msg)) {
      return res.json({ success: false, mfa: true, message: uiMsg(req, 'garminMfa') })
    }
    res.json({ success: false, message: uiMsg(req, 'garminFailed') + msg.slice(0, 120) })
  }
})

router.get('/status', requireAuth, async (req, res) => {
  const t = await kvGetScoped(TOKEN_KEY, scopeOf(req))
  res.json({ connected: !!t?.oauth2 })
})

// Disconnects YOUR OWN integration: the key carries the data owner's id, so nobody else's can be touched.
// A guest has no business here (they have no slot of their own) — app.js turns them away as well.
router.post('/disconnect', requireAuth, async (req, res) => {
  if (!scopeOf(req)) return res.status(403).json({ error: 'forbidden' })
  await kvDelScoped(TOKEN_KEY, scopeOf(req))
  res.json({ ok: true })
})

// Data for the Sport page
router.get('/data', requireAuth, async (req, res) => {
  const t = await kvGetScoped(TOKEN_KEY, scopeOf(req))
  if (!t?.oauth2) return res.json({ connected: false })
  try {
    const c = clientFromToken(t)
    let activities = []
    try { activities = await c.getActivities(0, 8) } catch { /* ignore */ }
    const mapped = (activities || []).map(mapActivity).filter(a => a.date)

    let steps = null, restingHr = null
    try { const s = await c.getSteps(new Date()); steps = typeof s === 'number' ? s : (s?.totalSteps ?? null) } catch { /* ignore */ }
    try { const hr = await c.getHeartRate(new Date()); restingHr = hr?.restingHeartRate ?? null } catch { /* ignore */ }

    // Body Battery (the day's charge left), stress and training readiness — by the Moscow date
    const today = mskDateStr()
    const [bodyBattery, stress, readiness] = await Promise.all([getBodyBattery(c, today), getStress(c, today), getTrainingReadiness(c, today)])

    // VO2max — taken from the most recent workout that reports one
    const vo2Max = mapped.find(w => w.vo2Max)?.vo2Max ?? null
    // Volume over the last 7 days (total distance) + the number of workouts
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    const lastWeek = mapped.filter(w => w.date >= weekAgo)
    const weekKm = round(lastWeek.reduce((s, w) => s + (w.distanceKm || 0), 0), 1)
    const weekCount = lastWeek.length

    res.json({
      connected: true,
      garmin: {
        steps,
        restingHr,
        vo2Max,
        bodyBattery,
        stress,
        readiness,
        weekKm,
        weekCount,
        lastWorkout: mapped[0] || null,
        workouts: mapped
      }
    })
  } catch (err) {
    res.json({ connected: true, error: String(err?.message || '').slice(0, 120), garmin: null })
  }
})

// Advanced Garmin metrics (Training Status/Load, HRV, race predictions, Endurance/Hill,
// lactate threshold, intensity minutes) — SEPARATE and lazy: these are ~7 heavy requests
// to Garmin, and they must not slow the main /data down (body battery / stress / readiness).
router.get('/insights', requireAuth, async (req, res) => {
  const t = await kvGetScoped(TOKEN_KEY, scopeOf(req))
  if (!t?.oauth2) return res.json({ connected: false })
  try {
    const c = clientFromToken(t)
    const advanced = await getAdvancedMetrics(c, mskDateStr())
    res.json({ connected: true, ...advanced })
  } catch (err) {
    res.json({ connected: true, error: String(err?.message || '').slice(0, 120) })
  }
})

// Upcoming planned workouts (including TrainingPeaks ones that come through Garmin)
router.get('/planned', requireAuth, async (req, res) => {
  const t = await kvGetScoped(TOKEN_KEY, scopeOf(req))
  if (!t?.oauth2) return res.json({ connected: false, planned: [] })
  try {
    const c = clientFromToken(t)
    const { planned, debug } = await getPlanned(c)
    res.json({ connected: true, planned, debug })
  } catch (e) {
    res.json({ connected: true, planned: [], error: String(e?.message || '').slice(0, 120) })
  }
})

// Details of a single workout: per-km splits + time series (heart rate/pace/elevation/power/cadence) + the GPS track
const ACT_BASE = 'https://connectapi.garmin.com/activity-service/activity/'

router.get('/activity/:id', requireAuth, async (req, res) => {
  const t = await kvGetScoped(TOKEN_KEY, scopeOf(req))
  if (!t?.oauth2) return res.json({ connected: false })
  const id = req.params.id
  try {
    const c = clientFromToken(t)

    // Splits (laps/kilometres)
    let splits = []
    try {
      const sp = await c.client.get(`${ACT_BASE}${id}/splits`)
      const laps = sp?.lapDTOs || []
      splits = laps.map((l, i) => ({
        index: i + 1,
        distanceKm: l.distance ? round(l.distance / 1000, 2) : null,
        durationSec: l.duration ? Math.round(l.duration) : null,
        pace: paceFromSpeed(l.averageSpeed),
        speedKmh: l.averageSpeed ? round(l.averageSpeed * 3.6, 1) : null,
        avgHr: l.averageHR ? Math.round(l.averageHR) : null,
        maxHr: l.maxHR ? Math.round(l.maxHR) : null,
        elevationGain: l.elevationGain != null ? Math.round(l.elevationGain) : null,
        avgPower: l.averagePower ? Math.round(l.averagePower) : null,
        cadence: l.averageRunCadence ? Math.round(l.averageRunCadence) : null
      }))
    } catch { /* ignore */ }

    // Time series + track
    let series = null, route = null
    try {
      const det = await c.client.get(`${ACT_BASE}${id}/details`, { params: { maxChartSize: 250, maxPolylineSize: 250 } })
      const idx = {}
      ;(det.metricDescriptors || []).forEach(m => { idx[m.key] = m.metricsIndex })
      const rows = det.activityDetailMetrics || []
      const col = (row, key) => { const i = idx[key]; return i == null ? null : row.metrics[i] }
      const step = Math.max(1, Math.floor(rows.length / 120))   // thin the data down to ~120 points
      const dist = [], hr = [], speed = [], elev = [], power = [], cad = []
      for (let i = 0; i < rows.length; i += step) {
        const r = rows[i]
        dist.push(col(r, 'sumDistance'))
        hr.push(col(r, 'directHeartRate'))
        speed.push(col(r, 'directSpeed'))
        elev.push(col(r, 'directElevation'))
        power.push(col(r, 'directPower'))
        cad.push(col(r, 'directRunCadence') ?? col(r, 'directDoubleCadence'))
      }
      const has = arr => arr.some(v => v != null && v !== 0)
      series = {
        distanceM: dist,
        hr: has(hr) ? hr : null,
        speed: has(speed) ? speed : null,
        elevation: has(elev) ? elev : null,
        power: has(power) ? power : null,
        cadence: has(cad) ? cad : null
      }
      const poly = det.geoPolylineDTO?.polyline
      if (poly?.length) {
        const pstep = Math.max(1, Math.floor(poly.length / 200))
        route = []
        for (let i = 0; i < poly.length; i += pstep) route.push([poly[i].lat, poly[i].lon])
      }
    } catch { /* ignore */ }

    res.json({ connected: true, id, splits, series, route })
  } catch (err) {
    res.json({ connected: true, error: String(err?.message || '').slice(0, 150) })
  }
})

export default router
