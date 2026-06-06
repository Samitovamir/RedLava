// Схематичная диаграмма сна по часам.
// Whoop отдаёт ИТОГИ по стадиям (сколько всего лёгкого/глубокого/REM/бодрствования)
// и время засыпания/пробуждения, но НЕ поминутную раскладку. Поэтому строим
// правдоподобную картину ночи из реальных итогов: глубокий сон — ближе к началу,
// REM — ближе к утру, короткие пробуждения между циклами. Это наглядно и честно
// (помечаем как «примерная картина»), точные минуты каждого часа Whoop не даёт.

export const hhmmToMin = (s) => {
  if (!s || typeof s !== 'string') return null
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  return m ? (+m[1]) * 60 + (+m[2]) : null
}
export const minToHHMM = (min) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// Порядок «глубины» для оси Y (сверху вниз): бодрствование → REM → лёгкий → глубокий
export const STAGE_LEVEL = { awake: 0, rem: 1, light: 2, deep: 3 }

export function buildHypnogram(stages, startHHMM) {
  if (!stages) return null
  const light = stages.light || 0, deep = stages.deep || 0, rem = stages.rem || 0, awake = stages.awake || 0
  const sleepMin = light + deep + rem
  if (sleepMin <= 0) return null

  const n = Math.max(3, Math.min(6, Math.round(sleepMin / 90)))   // циклы сна ~90 мин

  // Шаблон с весами: глубокий тяжелее в начале, REM — к утру, между циклами — пробуждение
  const tpl = []
  for (let i = 0; i < n; i++) {
    tpl.push({ stage: 'light', w: 1 })
    tpl.push({ stage: 'deep', w: (n - i) })
    tpl.push({ stage: 'light', w: 0.6 })
    tpl.push({ stage: 'rem', w: (i + 1) })
    if (i < n - 1) tpl.push({ stage: 'awake', w: 1 })
  }

  const real = { light, deep, rem, awake }
  const wsum = {}
  tpl.forEach(s => { wsum[s.stage] = (wsum[s.stage] || 0) + s.w })

  let t = 0
  const segments = tpl.map(s => {
    const dur = wsum[s.stage] ? real[s.stage] * (s.w / wsum[s.stage]) : 0
    const seg = { stage: s.stage, start: t, end: t + dur }
    t += dur
    return seg
  }).filter(s => s.end - s.start > 0.3)

  const startMin = hhmmToMin(startHHMM) ?? 0
  // Часовые отметки по реальному времени ночи
  const ticks = []
  const firstHour = Math.ceil(startMin / 60) * 60
  for (let m = firstHour; m <= startMin + t; m += 60) {
    ticks.push({ at: m - startMin, label: minToHHMM(m) })
  }

  return { segments, totalMin: t, startMin }
}
