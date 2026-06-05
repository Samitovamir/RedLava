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
  strength_training: 'Силовая', cardio: 'Кардио', yoga: 'Йога', fitness_equipment: 'Тренажёры'
}

function clientFromToken(t) {
  // Конструктор библиотеки требует креды, даже когда грузим готовый токен — даём заглушку
  const c = new GarminConnect({ username: 'token', password: 'token' })
  c.loadToken(t.oauth1, t.oauth2)
  return c
}

function mapActivity(a) {
  const typeKey = a.activityType?.typeKey || 'other'
  return {
    type: typeKey,
    title: a.activityName || TYPE_RU[typeKey] || 'Тренировка',
    label: TYPE_RU[typeKey] || typeKey,
    distanceKm: a.distance ? Math.round((a.distance / 1000) * 10) / 10 : null,
    durationMin: a.duration ? Math.round(a.duration / 60) : null,
    avgHr: a.averageHR ? Math.round(a.averageHR) : null,
    maxHr: a.maxHR ? Math.round(a.maxHR) : null,
    calories: a.calories ? Math.round(a.calories) : null,
    date: (a.startTimeLocal || '').slice(0, 10)
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

    res.json({
      connected: true,
      garmin: {
        steps,
        restingHr,
        lastWorkout: mapped[0] || null,
        workouts: mapped
      }
    })
  } catch (err) {
    res.json({ connected: true, error: String(err?.message || '').slice(0, 120), garmin: null })
  }
})

export default router
