// Демо-данные для гостевого входа. Гость НЕ видит реальные данные владельца
// (бэкенд их не отдаёт под гостевым токеном) — вместо них показываем эти примеры,
// чтобы можно было посмотреть, как работает дашборд.
import { WHOOP, WHOOP_DAYS } from './whoop.js'
import { mskNow } from './time.js'

const dk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

const demoWhoop = () => ({
  ...WHOOP,
  recovery: 78, hrv: 68, rhr: 47, spo2: 97, respiratoryRate: 14.1, strain: 12.4,
  sleep: { ...WHOOP.sleep, hoursSlept: 7.3, hoursNeeded: 8.1, performance: 84, efficiency: 91, start: '23:34', end: '06:52', cycles: 5, disturbances: 6 },
  week: WHOOP_DAYS
})

// Недавние тренировки (как из Garmin Connect): даты за последние ~10 дней.
// Поля совпадают с тем, что рендерит GarminLive/WorkoutModal.
const demoWorkouts = () => {
  const t = mskNow()
  const k = (o) => dk(addDays(t, o))   // o<0 — дни назад
  return [
    {
      id: 'demo-w1', type: 'running', label: 'Бег', title: 'Утренняя пробежка', date: k(-1),
      distanceKm: 10.4, durationMin: 53, pace: '5:06', avgHr: 142, maxHr: 161,
      calories: 612, elevationGain: 74, cadence: 173, trainingEffect: 3.4, trainingLabel: 'аэробный'
    },
    {
      id: 'demo-w2', type: 'lap_swimming', label: 'Плавание', title: 'Бассейн · техника', date: k(-2),
      distanceKm: 2.0, durationMin: 42, avgHr: 128, maxHr: 148, calories: 430
    },
    {
      id: 'demo-w3', type: 'cycling', label: 'Велосипед', title: 'Велозаезд по набережной', date: k(-4),
      distanceKm: 42.6, durationMin: 88, speedKmh: 29.0, avgHr: 134, maxHr: 156,
      calories: 980, elevationGain: 312, avgPower: 198, trainingEffect: 3.1, trainingLabel: 'аэробный'
    },
    {
      id: 'demo-w4', type: 'running', label: 'Бег', title: 'Интервалы 6×800', date: k(-6),
      distanceKm: 8.1, durationMin: 41, pace: '5:04', avgHr: 158, maxHr: 182,
      calories: 540, elevationGain: 38, cadence: 178, trainingEffect: 4.2, trainingLabel: 'анаэробный'
    },
    {
      id: 'demo-w5', type: 'cycling', label: 'Велосипед', title: 'Восстановительный велозаезд', date: k(-8),
      distanceKm: 28.3, durationMin: 64, speedKmh: 26.5, avgHr: 118, maxHr: 138,
      calories: 620, elevationGain: 145, avgPower: 162
    },
    {
      id: 'demo-w6', type: 'running', label: 'Бег', title: 'Длительная пробежка', date: k(-10),
      distanceKm: 18.2, durationMin: 99, pace: '5:26', avgHr: 138, maxHr: 154,
      calories: 1080, elevationGain: 126, cadence: 169, trainingEffect: 3.8, trainingLabel: 'аэробный'
    }
  ]
}

const demoGarmin = () => {
  const workouts = demoWorkouts()
  return {
    steps: 8420, restingHr: 47, vo2Max: 51,
    bodyBattery: { current: 64, charged: 70, drained: 44 },
    stress: { current: 26, avg: 33, max: 68 },
    weekKm: 38.5, weekCount: 5,
    lastWorkout: workouts[0], workouts
  }
}

// Плановые тренировки (как из TrainingPeaks/Garmin): ближайшие дни.
// Поля совпадают с секцией «Приближающиеся тренировки» в GarminLive.
export function demoPlanned() {
  const t = mskNow()
  const k = (o) => dk(addDays(t, o))
  return [
    { id: 'demo-p1', title: 'Темповый бег', date: k(0), sport: 'running', durationMin: 50, distanceKm: 9, time: '06:30' },
    { id: 'demo-p2', title: 'Плавание · интервалы', date: k(1), sport: 'lap_swimming', durationMin: 45, distanceKm: 2 },
    { id: 'demo-p3', title: 'Длинный велозаезд', date: k(2), sport: 'cycling', durationMin: 120, distanceKm: 55 },
    { id: 'demo-p4', title: 'Лёгкая восстановительная пробежка', date: k(4), sport: 'running', durationMin: 35, distanceKm: 6 }
  ]
}

const demoEvents = () => {
  const t = mskNow()
  const k = (o) => dk(addDays(t, o))
  return [
    { type: 'meeting', title: 'Утренняя пробежка', date: k(0), start: '06:30', end: '07:15', who: 'Личное', priority: 3 },
    { type: 'call', title: 'Созвон по проекту', date: k(0), start: '11:00', end: '11:30', who: 'Команда', priority: 2 },
    { type: 'calendar', title: 'Обед с контактем', date: k(0), start: '13:30', end: '14:30', who: 'контакт', priority: 3 },
    { type: 'meeting', title: 'Бассейн', date: k(1), start: '07:00', end: '08:00', who: 'Личное', priority: 3 },
    { type: 'email', title: 'Отправить отчёт', date: k(1), start: '10:00', end: '10:30', who: '', priority: 1 },
    { type: 'calendar', title: 'Велотренировка', date: k(2), start: '08:00', end: '09:30', who: 'Личное', priority: 3 }
  ]
}

const set = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* ignore */ } }
const has = (key) => { try { return !!localStorage.getItem(key) } catch { return false } }

// Заполнить localStorage демо-данными. force=true — перезаписать (свежий демо при входе).
export function seedGuestDemo({ force = false } = {}) {
  if (force || !has('albert-whoop-live')) set('albert-whoop-live', demoWhoop())
  if (force || !has('albert-garmin-live')) set('albert-garmin-live', demoGarmin())
  if (force || !has('albert-events')) set('albert-events', demoEvents())
}
