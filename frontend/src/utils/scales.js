/*
  One reading of each score, shared by every screen that shows it.

  Before this, each screen carried its own thresholds. Home called a stress of 26 "low" and
  painted it amber while its own dial put the marker in the green band; Health used a third set
  of cut-offs. A score now has one set of bands, one word and one color wherever it appears.
*/

// Garmin stress, 0–100, lower is better. Garmin's own bands: rest 0–25, low 26–50,
// medium 51–75, high 76–100. Rest and low are both a good state, so they share the green band.
export const STRESS_ZONES = [
  { from: 0, to: 50, color: 'var(--status-ok)' },
  { from: 50, to: 75, color: 'var(--status-warn)' },
  { from: 75, to: 100, color: 'var(--status-crit)' },
]
const STRESS_WORDS = {
  ru: { rest: 'покой', low: 'низкий', medium: 'средний', high: 'высокий' },
  en: { rest: 'rest', low: 'low', medium: 'medium', high: 'high' },
}
const stressKey = v => (v <= 25 ? 'rest' : v <= 50 ? 'low' : v <= 75 ? 'medium' : 'high')
export const stressColor = v => (v <= 50 ? 'var(--status-ok)' : v <= 75 ? 'var(--status-warn)' : 'var(--status-crit)')
export const stressWord = (v, lang) => (STRESS_WORDS[lang] || STRESS_WORDS.ru)[stressKey(v)]

// Garmin Body Battery, 0–100, higher is better.
export const batteryColor = v => (v >= 50 ? 'var(--status-ok)' : v >= 25 ? 'var(--status-warn)' : 'var(--status-crit)')

// Training readiness (Garmin), 0–100, higher is better.
export const READINESS_ZONES = [
  { from: 0, to: 50, color: 'var(--status-crit)' },
  { from: 50, to: 75, color: 'var(--status-warn)' },
  { from: 75, to: 100, color: 'var(--status-ok)' },
]

// A plain three-band scale where less is better (how packed the day is, FODMAP).
export const LOW_GOOD_ZONES = [
  { from: 0, to: 33, color: 'var(--status-ok)' },
  { from: 33, to: 66, color: 'var(--status-warn)' },
  { from: 66, to: 100, color: 'var(--status-crit)' },
]
