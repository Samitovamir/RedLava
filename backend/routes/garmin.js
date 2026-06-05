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

export default router
