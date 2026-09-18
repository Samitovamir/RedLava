// Mock Whoop data (shaped like the Whoop app's). To be replaced by the real API
// (OAuth 2.0, WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET).

export const WHOOP = {
  recovery: 78,          // recovery %, Whoop's headline metric
  strain: 12.4,          // the day's strain on a 0–21 scale
  strainMax: 21,
  hrv: 68,               // heart rate variability, ms
  rhr: 48,               // resting heart rate, bpm
  respiratoryRate: 14.2, // respiratory rate during sleep, breaths/min
  spo2: 97,              // blood oxygen saturation, %
  skinTemp: 33.4,        // skin temperature, °C
  skinTempDelta: -0.2,   // deviation from the norm, °C
  sleep: {
    performance: 84,     // % of the sleep need met
    hoursSlept: 7.3,     // hours actually slept
    hoursNeeded: 8.1,    // sleep need, hours
    efficiency: 91,      // sleep efficiency, %
    // sleep stage durations, in minutes
    stages: { awake: 22, light: 198, rem: 96, deep: 122 }
  }
}

// The week's trend (today is the last day)
export const WHOOP_DAYS = [
  { day: 'Пн', recovery: 64, strain: 14.2 },
  { day: 'Вт', recovery: 72, strain: 9.8 },
  { day: 'Ср', recovery: 55, strain: 16.1 },
  { day: 'Чт', recovery: 81, strain: 8.4 },
  { day: 'Пт', recovery: 69, strain: 13.7 },
  { day: 'Сб', recovery: 74, strain: 11.2 },
  { day: 'Вс', recovery: 78, strain: 12.4 }
]

// Recovery color by Whoop's bands: green / yellow / red
export function recoveryColor(r) {
  if (r >= 67) return 'var(--green)'
  if (r >= 34) return 'var(--yellow)'
  return 'var(--red)'
}
export function recoveryLabel(r) {
  if (r >= 67) return 'Высокое'
  if (r >= 34) return 'Среднее'
  return 'Низкое'
}

// Sleep stages — for the bar and the legend (order: awake → light → REM → deep).
// Colors are the theme palette's category tokens, not hex: these used to be hard-coded
// dark-theme colors, which fell outside the palette on the light ones. The labels are a
// fallback: both consumers (MetricsView, SleepHypnogram) substitute translations by key.
export const SLEEP_STAGES = [
  { key: 'awake', label: 'Бодрствование', color: 'var(--c-neutral)' },
  { key: 'light', label: 'Лёгкий сон',    color: 'var(--c-steel)' },
  { key: 'rem',   label: 'REM (быстрый)', color: 'var(--c-warm)' },
  { key: 'deep',  label: 'Глубокий сон',  color: 'var(--c-sage)' }
]

// Hours:minutes from minutes
export function fmtHm(min, lang = 'ru') {
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return lang === 'en' ? `${h}h ${m}m` : `${h} ч ${m} мин`
}
