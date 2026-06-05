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
