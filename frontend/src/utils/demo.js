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

const demoGarmin = () => ({
  steps: 8420, restingHr: 47, vo2Max: 51,
  bodyBattery: { current: 64, charged: 70, drained: 44 },
  stress: { current: 26, avg: 33, max: 68 },
  weekKm: 38.5, weekCount: 5, lastWorkout: null, workouts: []
})

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
