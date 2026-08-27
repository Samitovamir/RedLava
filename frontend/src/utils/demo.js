// Демо-данные для гостевого входа. Гость НЕ видит реальные данные владельца
// (бэкенд их не отдаёт под гостевым токеном) — вместо них показываем эти примеры,
// чтобы можно было посмотреть, как работает дашборд.
//
// Демо сеется НА ЯЗЫКЕ ИНТЕРФЕЙСА: настоящие события/приёмы приходят из Google Calendar
// и дневника одной строкой (без пары title/titleEn), поэтому и в localStorage кладём
// уже выбранную половину — иначе рендер, который читает только `title`, показал бы
// русские названия в английском UI.
import { WHOOP, WHOOP_DAYS } from './whoop.js'
import { mskNow } from './time.js'

const dk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

// Схлопывает пары `foo`/`fooEn` в одно поле `foo` по языку и убирает `fooEn`.
const loc = (lang, obj) => {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (k.endsWith('En') && Object.prototype.hasOwnProperty.call(obj, k.slice(0, -2))) continue
    const enKey = `${k}En`
    out[k] = (lang === 'en' && Object.prototype.hasOwnProperty.call(obj, enKey)) ? obj[enKey] : v
  }
  return out
}

const demoWhoop = () => ({
  ...WHOOP,
  recovery: 78, hrv: 68, rhr: 47, spo2: 97, respiratoryRate: 14.1, strain: 12.4,
  sleep: { ...WHOOP.sleep, hoursSlept: 7.3, hoursNeeded: 8.1, performance: 84, efficiency: 91, start: '23:34', end: '06:52', cycles: 5, disturbances: 6 },
  week: WHOOP_DAYS
})

// Недавние тренировки (как из Garmin Connect): даты за последние ~10 дней.
// Поля совпадают с тем, что рендерит GarminLive/WorkoutModal.
const demoWorkouts = (lang) => {
  const t = mskNow()
  const k = (o) => dk(addDays(t, o))   // o<0 — дни назад
  return [
    {
      id: 'demo-w0', type: 'running', label: 'Бег', labelEn: 'Run', title: 'Темповый бег', titleEn: 'Tempo run', date: k(0),
      distanceKm: 7.2, durationMin: 39, pace: '5:25', avgHr: 150, maxHr: 168,
      calories: 470, elevationGain: 40, cadence: 172, trainingEffect: 3.2, trainingLabel: 'аэробный', trainingLabelEn: 'aerobic'
    },
    {
      id: 'demo-w1', type: 'running', label: 'Бег', labelEn: 'Run', title: 'Утренняя пробежка', titleEn: 'Morning run', date: k(-1),
      distanceKm: 10.4, durationMin: 53, pace: '5:06', avgHr: 142, maxHr: 161,
      calories: 612, elevationGain: 74, cadence: 173, trainingEffect: 3.4, trainingLabel: 'аэробный', trainingLabelEn: 'aerobic'
    },
    {
      id: 'demo-w2', type: 'lap_swimming', label: 'Плавание', labelEn: 'Swim', title: 'Бассейн · техника', titleEn: 'Pool · technique', date: k(-2),
      distanceKm: 2.0, durationMin: 42, avgHr: 128, maxHr: 148, calories: 430
    },
    {
      id: 'demo-w3', type: 'cycling', label: 'Велосипед', labelEn: 'Bike', title: 'Велозаезд по набережной', titleEn: 'Waterfront bike ride', date: k(-4),
      distanceKm: 42.6, durationMin: 88, speedKmh: 29.0, avgHr: 134, maxHr: 156,
      calories: 980, elevationGain: 312, avgPower: 198, trainingEffect: 3.1, trainingLabel: 'аэробный', trainingLabelEn: 'aerobic'
    },
    {
      id: 'demo-w4', type: 'running', label: 'Бег', labelEn: 'Run', title: 'Интервалы 6×800', titleEn: 'Intervals 6×800', date: k(-6),
      distanceKm: 8.1, durationMin: 41, pace: '5:04', avgHr: 158, maxHr: 182,
      calories: 540, elevationGain: 38, cadence: 178, trainingEffect: 4.2, trainingLabel: 'анаэробный', trainingLabelEn: 'anaerobic'
    },
    {
      id: 'demo-w5', type: 'cycling', label: 'Велосипед', labelEn: 'Bike', title: 'Восстановительный велозаезд', titleEn: 'Recovery bike ride', date: k(-8),
      distanceKm: 28.3, durationMin: 64, speedKmh: 26.5, avgHr: 118, maxHr: 138,
      calories: 620, elevationGain: 145, avgPower: 162
    },
    {
      id: 'demo-w6', type: 'running', label: 'Бег', labelEn: 'Run', title: 'Длительная пробежка', titleEn: 'Long run', date: k(-10),
      distanceKm: 18.2, durationMin: 99, pace: '5:26', avgHr: 138, maxHr: 154,
      calories: 1080, elevationGain: 126, cadence: 169, trainingEffect: 3.8, trainingLabel: 'аэробный', trainingLabelEn: 'aerobic'
    }
  ].map(w => loc(lang, w))
}

const demoGarmin = (lang) => {
  const en = lang === 'en'
  const workouts = demoWorkouts(lang)
  return {
    steps: 8420, restingHr: 47, vo2Max: 51,
    bodyBattery: { current: 64, charged: 70, drained: 44 },
    stress: { current: 26, avg: 33, max: 68 },
    readiness: {
      score: 68, level: 'MODERATE', levelRu: en ? null : 'средняя',
      feedback: en ? 'Recovery is the priority, but an easy session is fine' : 'Восстановление в приоритете, но лёгкая нагрузка по силам',
      sleepScore: 78, recoveryTime: 540, hrvFactor: 55, acuteLoad: 320
    },
    // Продвинутые метрики Garmin (Training Status/Load, HRV, прогнозы забегов и т.д.)
    trainingStatus: {
      status: 'PRODUCTIVE', statusRu: en ? null : 'Продуктивно',
      feedback: en ? 'Load is building fitness — keep it up' : 'Нагрузка растит форму — так держать',
      vo2Max: 51
    },
    trainingLoad: { acute: 320, chronic: 372, ratio: 0.86, balanceRu: en ? null : 'Оптимально', balanceKey: 'OPTIMAL', focus: { low: 52, high: 31, anaerobic: 17 } },
    hrvStatus: { lastNight: 62, weeklyAvg: 58, statusRu: en ? null : 'Сбалансировано', statusKey: 'BALANCED', low: 48, high: 70 },
    racePredictions: { fiveK: '21:20', tenK: '44:30', half: '1:38:40', marathon: '3:27:10' },
    enduranceScore: { score: 6840, levelRu: en ? null : 'Тренирован' },
    hillScore: { score: 61, levelRu: en ? null : 'Средне' },
    lactateThreshold: { hr: 164, pace: '4:38' },
    intensityMinutes: { weekly: 210, goal: 150 },
    weekKm: 38.5, weekCount: 5,
    lastWorkout: workouts[0], workouts
  }
}

// Плановые тренировки (как из TrainingPeaks/Garmin): ближайшие дни.
// Поля совпадают с секцией «Приближающиеся тренировки» в GarminLive.
export function demoPlanned(lang = 'ru') {
  const t = mskNow()
  const k = (o) => dk(addDays(t, o))
  return [
    { id: 'demo-p1', title: 'Темповый бег', titleEn: 'Tempo run', date: k(0), sport: 'running', durationMin: 50, distanceKm: 9, time: '06:30' },
    { id: 'demo-p2', title: 'Плавание · интервалы', titleEn: 'Swim · intervals', date: k(1), sport: 'lap_swimming', durationMin: 45, distanceKm: 2 },
    { id: 'demo-p3', title: 'Длинный велозаезд', titleEn: 'Long bike ride', date: k(2), sport: 'cycling', durationMin: 120, distanceKm: 55 },
    { id: 'demo-p4', title: 'Лёгкая восстановительная пробежка', titleEn: 'Easy recovery run', date: k(4), sport: 'running', durationMin: 35, distanceKm: 6 }
  ].map(w => loc(lang, w))
}

// Дневник питания на сегодня (как из фото-дневника): пара приёмов с FODMAP-метками.
const demoIntake = (lang) => {
  const today = dk(mskNow())
  const items = [
    { name: 'Куриная грудка с рисом', nameEn: 'Chicken breast with rice', kcal: 520 },
    { name: 'Овсянка с бананом', nameEn: 'Oatmeal with banana', kcal: 340 },
    { name: 'Греческий салат', nameEn: 'Greek salad', kcal: 320 }
  ].map(i => loc(lang, i))
  const entries = [
    { id: 'di1', name: 'Куриная грудка с рисом', nameEn: 'Chicken breast with rice', kcal: 520, protein: 48, fat: 12, carb: 56, fodmap: 'low' },
    { id: 'di2', name: 'Овсянка с бананом', nameEn: 'Oatmeal with banana', kcal: 340, protein: 12, fat: 8, carb: 58, fodmap: 'low' },
    { id: 'di3', name: 'Греческий салат', nameEn: 'Greek salad', kcal: 320, protein: 22, fat: 18, carb: 12, fodmap: 'mod', fodmapReason: 'лук', fodmapReasonEn: 'onion' }
  ].map(e => loc(lang, e))
  return {
    [today]: { source: 'photo', kcal: 1180, protein: 82, fat: 38, carb: 120, items, entries }
  }
}

const demoEvents = (lang) => {
  const t = mskNow()
  const k = (o) => dk(addDays(t, o))
  return [
    { type: 'meeting', title: 'Утренняя пробежка', titleEn: 'Morning run', date: k(0), start: '06:30', end: '07:15', who: 'Личное', whoEn: 'Personal', priority: 3 },
    { type: 'call', title: 'Созвон по проекту', titleEn: 'Project call', date: k(0), start: '11:00', end: '11:30', who: 'Команда', whoEn: 'Team', priority: 2 },
    { type: 'calendar', title: 'Обед с Иваном', titleEn: 'Lunch with Ivan', date: k(0), start: '13:30', end: '14:30', who: 'Иван', whoEn: 'Ivan', priority: 3 },
    { type: 'meeting', title: 'Бассейн', titleEn: 'Pool', date: k(1), start: '07:00', end: '08:00', who: 'Личное', whoEn: 'Personal', priority: 3 },
    { type: 'email', title: 'Отправить отчёт', titleEn: 'Send report', date: k(1), start: '10:00', end: '10:30', who: '', whoEn: '', priority: 1 },
    { type: 'calendar', title: 'Велотренировка', titleEn: 'Bike workout', date: k(2), start: '08:00', end: '09:30', who: 'Личное', whoEn: 'Personal', priority: 3 }
  ].map(e => loc(lang, e))
}

const set = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* ignore */ } }
const has = (key) => { try { return !!localStorage.getItem(key) } catch { return false } }

// Версия демо-данных. Меняй при изменении содержимого, чтобы вернувшиеся гости
// получили обновлённый набор. Язык входит в ключ: сменил язык — демо пересеется.
const DEMO_VERSION = '5'

// Заполнить localStorage демо-данными. force=true — перезаписать (свежий демо при входе).
// Несовпадение версии/языка (albert-demo-ver !== стамп) тоже считается force.
export function seedGuestDemo({ force = false, lang = 'ru' } = {}) {
  const stamp = `${DEMO_VERSION}:${lang}`
  let ver = null
  try { ver = localStorage.getItem('albert-demo-ver') } catch { /* ignore */ }
  const overwrite = force || ver !== stamp
  if (overwrite || !has('albert-whoop-live')) set('albert-whoop-live', demoWhoop())
  if (overwrite || !has('albert-garmin-live')) set('albert-garmin-live', demoGarmin(lang))
  if (overwrite || !has('albert-events')) set('albert-events', demoEvents(lang))
  if (overwrite || !has('albert-intake')) set('albert-intake', demoIntake(lang))
  try { localStorage.setItem('albert-demo-ver', stamp) } catch { /* ignore */ }
}
