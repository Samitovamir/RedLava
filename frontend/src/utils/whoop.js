// Mock-данные Whoop (как из приложения Whoop). Заменятся на реальный API
// (OAuth 2.0, WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET).

export const WHOOP = {
  recovery: 78,          // % восстановления — главная метрика Whoop
  strain: 12.4,          // дневная нагрузка по шкале 0–21
  strainMax: 21,
  hrv: 68,               // вариабельность пульса, мс
  rhr: 48,               // пульс покоя, уд/мин
  respiratoryRate: 14.2, // частота дыхания во сне, вдох/мин
  spo2: 97,              // насыщение крови кислородом, %
  skinTemp: 33.4,        // температура кожи, °C
  skinTempDelta: -0.2,   // отклонение от нормы, °C
  sleep: {
    performance: 84,     // % выполнения потребности во сне
    hoursSlept: 7.3,     // фактически проспал, ч
    hoursNeeded: 8.1,    // потребность во сне, ч
    efficiency: 91,      // эффективность сна, %
    // длительность фаз сна, минут
    stages: { awake: 22, light: 198, rem: 96, deep: 122 }
  }
}

// Тренд за неделю (сегодня — последний день)
export const WHOOP_DAYS = [
  { day: 'Пн', recovery: 64, strain: 14.2 },
  { day: 'Вт', recovery: 72, strain: 9.8 },
  { day: 'Ср', recovery: 55, strain: 16.1 },
  { day: 'Чт', recovery: 81, strain: 8.4 },
  { day: 'Пт', recovery: 69, strain: 13.7 },
  { day: 'Сб', recovery: 74, strain: 11.2 },
  { day: 'Вс', recovery: 78, strain: 12.4 }
]

// Цвет восстановления по уровню Whoop: зелёный / жёлтый / красный
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

// Фазы сна — для полосы и легенды (порядок: бодрствование → лёгкий → REM → глубокий)
export const SLEEP_STAGES = [
  { key: 'awake', label: 'Бодрствование', color: '#9ca3af' },
  { key: 'light', label: 'Лёгкий сон',    color: '#6E8CA8' },
  { key: 'rem',   label: 'REM (быстрый)', color: '#B07B52' },
  { key: 'deep',  label: 'Глубокий сон',  color: '#7E9B6E' }
]

// Часы:минуты из минут
export function fmtHm(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return `${h} ч ${m} мин`
}
