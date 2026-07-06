import { Router } from 'express'
import { GarminConnect } from 'garmin-connect'
import { requireAuth } from '../authGuard.js'
import { kvGet, kvSet, kvDel } from '../store.js'

const router = Router()
const TOKEN_KEY = 'garmin:token'

// Названия типов тренировок Garmin → по-русски
const TYPE_RU = {
  running: 'Бег', treadmill_running: 'Бег (дорожка)', trail_running: 'Трейл',
  cycling: 'Велосипед', indoor_cycling: 'Велотренажёр', road_biking: 'Велосипед',
  walking: 'Ходьба', hiking: 'Поход',
  lap_swimming: 'Плавание', open_water_swimming: 'Плавание',
  strength_training: 'Силовая', cardio: 'Кардио', yoga: 'Йога', fitness_equipment: 'Тренажёры',
  elliptical: 'Эллипсоид'
}

// Метки тренировочного эффекта Garmin → по-русски
const TE_RU = {
  RECOVERY: 'Восстановительная', BASE: 'Базовая', AEROBIC_BASE: 'Аэробная база',
  TEMPO: 'Темповая', THRESHOLD: 'Пороговая', LACTATE_THRESHOLD: 'Лактатный порог',
  VO2MAX: 'МПК', ANAEROBIC_CAPACITY: 'Анаэробная', SPRINT: 'Спринт',
  MAINTAINING: 'Поддержание', IMPACTING: 'Развивающая', HIGHLY_IMPACTING: 'Высокая нагрузка',
  NO_BENEFIT: 'Без эффекта', OVERREACHING: 'Перегрузка'
}

const round = (n, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f }

// База внутреннего API Garmin (тот же хост, что и для деталей тренировки)
const CONNECT = 'https://connectapi.garmin.com'
// Дата «сегодня» по Москве (владелец в Москве; сервер на Vercel в UTC — иначе у полуночи путаница)
function mskDateStr() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Плановые (приближающиеся) тренировки из календаря Garmin.
// Сюда попадают и планы из TrainingPeaks, если он связан с Garmin.
// Берём текущий и следующий месяц, оставляем будущие. Месяц у Garmin 0-индексный.
// Плановая (не выполненная) тренировка?
function isPlannedItem(it) {
  const t = String(it.itemType || '').toLowerCase()
  if (t === 'activity') return false                 // уже выполнена
  if (/workout/.test(t)) return true                 // структурная плановая
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

// Body Battery — «остаток заряда»: текущее значение + сколько заряжено/потрачено за день.
// Это ЖИВОЙ показатель (меняется в течение дня), в отличие от утреннего Recovery Whoop.
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

// Стресс Garmin (0–100). Массив замеров каждые ~3 мин: [метка_времени_мс, значение].
// Возвращаем последний валидный замер + его метку времени (чтобы подписать «обновлено HH:MM»),
// скользящее среднее за ~последний час (близко к «сейчас», но без шума одного пика), плюс avg/max дня.
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
    // Среднее за последние 60 минут валидных замеров (относительно последнего замера)
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

// Готовность к тренировкам (Training Readiness, 0–100) — сводный балл Garmin: сон,
// восстановление, ВЧП/HRV, острая нагрузка, история стресса. Внутренний эндпоинт
// возвращает массив замеров за день — берём самый свежий. Уровень и факторы —
// как в приложении Garmin (для текста «почему такая готовность»).
const TR_LEVEL_RU = { NONE: 'нет данных', LOW: 'низкая', MODERATE: 'средняя', HIGH: 'высокая', MAXIMUM: 'высокая' }
async function getTrainingReadiness(c, dateStr) {
  try {
    const r = await c.client.get(`${CONNECT}/metrics-service/metrics/trainingreadiness/${dateStr}`)
    const arr = Array.isArray(r) ? r : (r ? [r] : [])
    if (!arr.length) return null
    // самый свежий по timestamp
    const d = arr.slice().sort((a, b) => (b?.timestamp || 0) > (a?.timestamp || 0) ? 1 : -1)[0]
    if (d?.score == null) return null
    return {
      score: d.score,
      level: d.level || null,
      levelRu: TR_LEVEL_RU[d.level] || null,
      feedback: d.feedbackLong || d.feedbackShort || null,
      sleepScore: d.sleepScore ?? null,
      recoveryTime: d.recoveryTime ?? null,      // минут до полного восстановления
      hrvFactor: d.hrvFactorPercent ?? null,
      acuteLoad: d.acuteLoad ?? null,
      timestamp: d.timestamp ?? null
    }
  } catch { return null }
}

// ── Расширенные метрики Garmin (Training Status/Load, HRV, прогнозы, Endurance/Hill,
//    лактатный порог, интенсивные минуты). Внутренние эндпоинты Garmin; поля могут
//    отличаться между прошивками — всё парсим ТОЛЕРАНТНО (опциональные цепочки, на любой
//    сбой конкретной метрики → null, остальные не страдают). Провалидируем при первом
//    реальном синке Garmin владельца.
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
    // Training Status (последнее устройство)
    const tsDev = firstDev(r.mostRecentTrainingStatus?.latestTrainingStatusData)
    let trainingStatus = null
    if (tsDev) {
      const key = tsDev.trainingStatusFeedbackPhrase?.split('_')?.[0] || (typeof tsDev.trainingStatus === 'string' ? tsDev.trainingStatus : null)
      trainingStatus = {
        status: key || null,
        statusRu: (key && TS_STATUS_RU[key]) || null,
        feedback: tsDev.trainingStatusFeedbackPhrase ? null : null,   // фраза-подсказка приходит кодом; текст задаём на фронте по статусу
        vo2Max: tsDev.vo2Max ?? tsDev.maxMetCategoryValue ?? null
      }
    }
    // Training Load balance + острая/хроническая
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
    const weekly = mod + vig * 2   // Garmin считает интенсивные вдвойне
    return (mod || vig) ? { weekly, goal } : null
  } catch { return null }
}

// Собрать все расширенные метрики параллельно (каждая защищена по отдельности)
async function getAdvancedMetrics(c, dateStr) {
  const displayName = await getDisplayName(c)
  const [tsl, hrvStatus, racePredictions, enduranceScore, hillScore, intensityMinutes] = await Promise.all([
    getTrainingStatusLoad(c, dateStr), getHrvStatus(c, dateStr), getRacePredictions(c, displayName),
    getEnduranceScore(c, dateStr), getHillScore(c, dateStr), getIntensityMinutes(c, displayName, dateStr)
  ])
  return { trainingStatus: tsl.trainingStatus, trainingLoad: tsl.trainingLoad, hrvStatus, racePredictions, enduranceScore, hillScore, intensityMinutes }
}

// Темп бега из средней скорости (м/с) → строка «мин:сек / км»
function paceFromSpeed(mps) {
  if (!mps || mps <= 0) return null
  const secPerKm = 1000 / mps
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function clientFromToken(t) {
  // Конструктор библиотеки требует креды, даже когда грузим готовый токен — даём заглушку
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
    // расширенные метрики (показываем только то, что есть)
    pace: isRun ? paceFromSpeed(a.averageSpeed) : null,                                   // мин/км для бега
    speedKmh: (isCycle && a.averageSpeed) ? round(a.averageSpeed * 3.6, 1) : null,         // км/ч для вело
    elevationGain: a.elevationGain ? Math.round(a.elevationGain) : null,                   // набор высоты, м
    cadence: a.averageRunningCadenceInStepsPerMinute ? Math.round(a.averageRunningCadenceInStepsPerMinute) : null,
    avgPower: a.avgPower ? Math.round(a.avgPower) : null,                                  // средняя мощность, Вт
    vo2Max: a.vO2MaxValue ? Math.round(a.vO2MaxValue) : null,
    trainingEffect: a.aerobicTrainingEffect ? round(a.aerobicTrainingEffect, 1) : null,   // 0–5
    trainingLabel: a.trainingEffectLabel ? (TE_RU[a.trainingEffectLabel] || null) : null
  }
}

// Подключить: вход по логину/паролю → сохраняем токен сессии
router.post('/connect', requireAuth, async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ success: false, message: 'Введите email и пароль' })
  try {
    const c = new GarminConnect({ username: email, password })
    await c.login(email, password)
    const token = c.exportToken()
    await kvSet(TOKEN_KEY, token)
    res.json({ success: true })
  } catch (err) {
    const msg = String(err?.message || '')
    if (/mfa|two|verification|code/i.test(msg)) {
      return res.json({ success: false, mfa: true, message: 'Аккаунт требует код двухфакторной проверки — настроим на созвоне.' })
    }
    res.json({ success: false, message: 'Не удалось войти в Garmin. Проверьте логин/пароль. ' + msg.slice(0, 120) })
  }
})

router.get('/status', requireAuth, async (_req, res) => {
  const t = await kvGet(TOKEN_KEY)
  res.json({ connected: !!t?.oauth2 })
})

router.post('/disconnect', requireAuth, async (_req, res) => {
  await kvDel(TOKEN_KEY)
  res.json({ ok: true })
})

// Данные для страницы «Спорт»
router.get('/data', requireAuth, async (_req, res) => {
  const t = await kvGet(TOKEN_KEY)
  if (!t?.oauth2) return res.json({ connected: false })
  try {
    const c = clientFromToken(t)
    let activities = []
    try { activities = await c.getActivities(0, 8) } catch { /* ignore */ }
    const mapped = (activities || []).map(mapActivity).filter(a => a.date)

    let steps = null, restingHr = null
    try { const s = await c.getSteps(new Date()); steps = typeof s === 'number' ? s : (s?.totalSteps ?? null) } catch { /* ignore */ }
    try { const hr = await c.getHeartRate(new Date()); restingHr = hr?.restingHeartRate ?? null } catch { /* ignore */ }

    // Body Battery (остаток заряда дня), стресс и готовность к тренировкам — по московской дате
    const today = mskDateStr()
    const [bodyBattery, stress, readiness, advanced] = await Promise.all([getBodyBattery(c, today), getStress(c, today), getTrainingReadiness(c, today), getAdvancedMetrics(c, today)])

    // VO2max — берём из свежайшей тренировки, где он есть
    const vo2Max = mapped.find(w => w.vo2Max)?.vo2Max ?? null
    // Объём за последние 7 дней (сумма дистанций) + число тренировок
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
        ...advanced,
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

// Приближающиеся плановые тренировки (в т.ч. из TrainingPeaks через Garmin)
router.get('/planned', requireAuth, async (_req, res) => {
  const t = await kvGet(TOKEN_KEY)
  if (!t?.oauth2) return res.json({ connected: false, planned: [] })
  try {
    const c = clientFromToken(t)
    const { planned, debug } = await getPlanned(c)
    res.json({ connected: true, planned, debug })
  } catch (e) {
    res.json({ connected: true, planned: [], error: String(e?.message || '').slice(0, 120) })
  }
})

// Подробности одной тренировки: сплиты по км + тайм-серии (пульс/темп/высота/мощность/каденс) + GPS-трек
const ACT_BASE = 'https://connectapi.garmin.com/activity-service/activity/'

router.get('/activity/:id', requireAuth, async (req, res) => {
  const t = await kvGet(TOKEN_KEY)
  if (!t?.oauth2) return res.json({ connected: false })
  const id = req.params.id
  try {
    const c = clientFromToken(t)

    // Сплиты (круги/километры)
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

    // Тайм-серии + трек
    let series = null, route = null
    try {
      const det = await c.client.get(`${ACT_BASE}${id}/details`, { params: { maxChartSize: 250, maxPolylineSize: 250 } })
      const idx = {}
      ;(det.metricDescriptors || []).forEach(m => { idx[m.key] = m.metricsIndex })
      const rows = det.activityDetailMetrics || []
      const col = (row, key) => { const i = idx[key]; return i == null ? null : row.metrics[i] }
      const step = Math.max(1, Math.floor(rows.length / 120))   // прореживаем до ~120 точек
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
