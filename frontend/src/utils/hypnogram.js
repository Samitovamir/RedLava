// A schematic hour-by-hour chart of the night's sleep.
// Whoop hands back stage TOTALS (total light/deep/REM/awake time) and the times you fell
// asleep and woke up, but NOT a minute-by-minute breakdown. So we build a plausible picture
// of the night out of the real totals: deep sleep nearer the start, REM nearer the morning,
// short wakes between cycles. That is both readable and honest (we label it an "approximate
// picture") — Whoop simply doesn't give the exact minutes within each hour.

export const hhmmToMin = (s) => {
  if (!s || typeof s !== 'string') return null
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  return m ? (+m[1]) * 60 + (+m[2]) : null
}
export const minToHHMM = (min) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// The "depth" order for the Y axis (top to bottom): awake → REM → light → deep
export const STAGE_LEVEL = { awake: 0, rem: 1, light: 2, deep: 3 }

export function buildHypnogram(stages, startHHMM) {
  if (!stages) return null
  const light = stages.light || 0, deep = stages.deep || 0, rem = stages.rem || 0, awake = stages.awake || 0
  const sleepMin = light + deep + rem
  if (sleepMin <= 0) return null

  const n = Math.max(3, Math.min(6, Math.round(sleepMin / 90)))   // sleep cycles run ~90 min

  // A weighted template: deep weighs more early on, REM towards morning, a wake between cycles
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
  // Hour marks against the real clock time of the night
  const ticks = []
  const firstHour = Math.ceil(startMin / 60) * 60
  for (let m = firstHour; m <= startMin + t; m += 60) {
    ticks.push({ at: m - startMin, label: minToHHMM(m) })
  }

  return { segments, totalMin: t, startMin }
}
