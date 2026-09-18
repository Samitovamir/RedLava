// Mock workout data (as if it came from Garmin Connect). To be replaced by the real API.

export const WORKOUT_TYPES = {
  run:   { label: 'Бег',        iconKey: 'sport-run',  colorKey: 'sport-run' },
  bike:  { label: 'Велосипед',  iconKey: 'sport-bike', colorKey: 'sport-bike' },
  swim:  { label: 'Плавание',   iconKey: 'sport-swim', colorKey: 'sport-swim' },
  gym:   { label: 'Силовая',    iconKey: 'sport-gym',  colorKey: 'sport-gym' },
  walk:  { label: 'Ходьба',     iconKey: 'sport-walk', colorKey: 'sport-walk' }
}

// A random heart-rate series for the mini chart
function hrSeries(base, spread, n = 24) {
  const arr = []
  let v = base
  for (let i = 0; i < n; i++) {
    v += (Math.random() - 0.5) * spread
    v = Math.max(base - spread, Math.min(base + spread, v))
    arr.push(Math.round(v))
  }
  return arr
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

// The user's estimated maximum heart rate — the single basis for every zone.
// Points are classified against it both on the chart and in the zone bar.
export const ZONE_MAX_HR = 185

// Zone bounds as fractions of max heart rate: Z1<0.6, Z2 .6–.7, Z3 .7–.8, Z4 .8–.9, Z5≥0.9
const ZONE_BOUNDS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]

// A heart-rate series that agrees with the zone distribution.
// The share of points in each zone matches the given percentage → chart and bar line up.
function hrFromZones(zones, n = 30) {
  const counts = zones.map(p => (p > 0 ? Math.max(1, Math.round((p / 100) * n)) : 0))
  const all = []
  counts.forEach((c, z) => {
    const lo = ZONE_BOUNDS[z] * ZONE_MAX_HR
    const hi = ZONE_BOUNDS[z + 1] * ZONE_MAX_HR
    const mid = (lo + hi) / 2
    for (let i = 0; i < c; i++) {
      const v = mid + (Math.random() - 0.5) * (hi - lo) * 0.5
      all.push(Math.round(Math.max(lo + 1, Math.min(hi - 1, v))))
    }
  })
  // A "mountain" profile: a climb to the peak and a descent — every zone shows, percentages hold.
  all.sort((a, b) => a - b)
  const up = [], down = []
  all.forEach((v, i) => (i % 2 === 0 ? up.push(v) : down.unshift(v)))
  return [...up, ...down]
}

// The latest workout: the heart-rate series and the metrics are derived from the zone
// distribution, so the chart, the avg/max heart rate and the zone bar stay consistent.
const W1_ZONES = [12, 28, 42, 15, 3]
const W1_HR = hrFromZones(W1_ZONES)
const W1_AVG = Math.round(W1_HR.reduce((a, b) => a + b, 0) / W1_HR.length)
const W1_MAX = Math.max(...W1_HR)

export const WORKOUTS = [
  {
    id: 1, type: 'run', date: daysAgo(0), duration: 42, distance: 8.2,
    avgHr: W1_AVG, maxHr: W1_MAX, calories: 540, hr: W1_HR,
    pace: '5:07', cadence: 172, elevation: 86, aerobicTE: 3.4, anaerobicTE: 1.2,
    zones: W1_ZONES, // % of time in zones 1–5 (the heart-rate series is built from these)
    score: 8.5, aiComment: 'Отличный темп — держал зону 3 почти всю дистанцию. Пульс восстанавливался быстро, форма растёт.'
  },
  {
    id: 2, type: 'gym', date: daysAgo(1), duration: 55, distance: null,
    avgHr: 118, maxHr: 145, calories: 320, hr: hrSeries(118, 25),
    score: 7.8, aiComment: 'Силовая прошла продуктивно. Рекомендую добавить день отдыха перед следующей интенсивной.'
  },
  {
    id: 3, type: 'bike', date: daysAgo(2), duration: 78, distance: 31.4,
    avgHr: 132, maxHr: 158, calories: 690, hr: hrSeries(132, 28),
    score: 9.0, aiComment: 'Длинная поездка в аэробной зоне — идеально для базовой выносливости.'
  },
  {
    id: 4, type: 'swim', date: daysAgo(4), duration: 35, distance: 1.5,
    avgHr: 124, maxHr: 150, calories: 410, hr: hrSeries(124, 22),
    score: 8.2, aiComment: 'Хорошая техника, ровный пульс. Можно увеличить дистанцию на 200 м.'
  },
  {
    id: 5, type: 'run', date: daysAgo(5), duration: 28, distance: 5.0,
    avgHr: 155, maxHr: 178, calories: 360, hr: hrSeries(155, 32),
    score: 7.5, aiComment: 'Интервальная — высокий пульс. Следи за восстановлением между ускорениями.'
  },
  {
    id: 6, type: 'walk', date: daysAgo(6), duration: 50, distance: 4.2,
    avgHr: 98, maxHr: 115, calories: 210, hr: hrSeries(98, 15),
    score: 6.5, aiComment: 'Лёгкая восстановительная активность — хорошо для разгрузочного дня.'
  },
  {
    id: 7, type: 'gym', date: daysAgo(7), duration: 60, distance: null,
    avgHr: 122, maxHr: 150, calories: 350, hr: hrSeries(122, 26),
    score: 8.0, aiComment: 'Полноценная силовая. Объём в норме, прогресс по весам заметен.'
  }
]

// Stats for the week
export const WEEK_STATS = {
  activityPercent: 82,           // progress against the weekly activity target
  workoutsCount: WORKOUTS.length,
  totalMinutes: WORKOUTS.reduce((a, w) => a + w.duration, 0),
  totalCalories: WORKOUTS.reduce((a, w) => a + w.calories, 0),
  avgHr: Math.round(WORKOUTS.reduce((a, w) => a + w.avgHr, 0) / WORKOUTS.length),
  hrZonePercent: 68              // % of time in the target heart-rate zone
}

// Distribution by type (for the chart)
export const TYPE_DISTRIBUTION = Object.entries(
  WORKOUTS.reduce((acc, w) => { acc[w.type] = (acc[w.type] || 0) + 1; return acc }, {})
).map(([type, count]) => ({ type, count, percent: Math.round(count / WORKOUTS.length * 100) }))

// Garmin profile figures (as reported by the high-end watches: Fenix/Forerunner/Epix)
export const GARMIN = {
  bodyBattery: 64,          // energy 0–100
  bodyBatteryMax: 92,
  stress: 34,               // average stress for the day 0–100
  vo2max: 52,               // ml/kg/min
  fitnessAge: 31,           // fitness age
  restingHr: 48,            // resting heart rate
  hrv: 68,                  // variability, ms
  steps: 8420, stepsGoal: 10000,
  intensityMin: 145, intensityGoal: 150,  // intensity minutes for the week
  floors: 14, floorsGoal: 10,
  trainingStatus: 'Продуктивный',         // Garmin Training Status
  trainingLoad: 612,                      // 7-day load
  trainingLoadOptimal: [450, 760],        // the optimal range
  recoveryTime: 18,                       // hours until fully recovered
  spo2: 97,                               // oxygen saturation %
  respiration: 14,                        // respiration, breaths/min
  sleepScore: 81                          // sleep score (Garmin reports one too)
}

export const HR_ZONE_LABELS = ['Зона 1 · Разминка', 'Зона 2 · Лёгкая', 'Зона 3 · Аэробная', 'Зона 4 · Порог', 'Зона 5 · Максимум']

export function formatWorkoutDate(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const wd = new Date(d); wd.setHours(0, 0, 0, 0)
  const diff = Math.round((today - wd) / 86400000)
  if (diff === 0) return 'Сегодня'
  if (diff === 1) return 'Вчера'
  const days = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`
}
