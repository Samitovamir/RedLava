// The "Health" signal for the Home screen.
// By default it shows a CALM status (recovery/readiness/sleep) and does not go hunting for
// abnormal results. The warning look is reserved ONLY for an action that genuinely has to
// happen today: retaking a blood test. Medical abnormalities themselves are never raised on
// Home as an alarm — they sit quietly in the "Health" section.

import { buildHistory, markerStatus, resolveMarker } from './labs.js'
import { mskNow } from './time.js'

// Marker groups worth RETESTING after an interval when a result is off: they respond to
// supplements/treatment, and the trend is what matters. The value is how many days after
// the last test it makes sense to check again. The groups come from labs.js.
const RETEST_DAYS = {
  vitamins: 90,      // vitamin D, B12 — check on supplementation after ~3 months
  iron: 90,          // iron, ferritin — after therapy
  lipids: 90,        // cholesterol, LDL — after a diet/statins
  metabolic: 90,     // glucose, glycated hemoglobin
  thyroid: 60,       // TSH — after a dose adjustment
  liver: 60,         // ALT, AST — follow-up
  inflammation: 30   // CRP — a quick check on inflammation
}

// How many whole days have passed since the test date (against Moscow "today").
function daysSince(iso, now) {
  const [y, m, d] = iso.split('-').map(Number)
  const then = Date.UTC(y, m - 1, d)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((today - then) / 86400000)
}

// The markers that REALLY are due for a retest: out of range, part of a "retestable"
// group, and past the follow-up interval since the last test.
// This is exactly the action the signal surfaces on Home.
export function dueRetests(reports, now = mskNow()) {
  if (!Array.isArray(reports) || !reports.length) return []
  const hist = buildHistory(reports)
  const due = []
  Object.keys(hist).forEach(name => {
    const h = hist[name]
    const last = h[h.length - 1]
    const def = resolveMarker(name, last)
    const interval = RETEST_DAYS[def.group]
    if (!interval) return
    const st = markerStatus(last.value, def.min, def.max)
    if (st !== 'low' && st !== 'high') return
    const days = daysSince(last.date, now)
    if (days >= interval) due.push({ name: def.name, date: last.date, daysAgo: days, status: st })
  })
  // The longest outstanding ones go first: those are the most overdue for a retest.
  return due.sort((a, b) => b.daysAgo - a.daysAgo)
}

// A calm readiness status based on Whoop's morning recovery score.
// tone: 'good' | 'mid' | 'low' — drives the color and an encouraging line (NOT an alarm).
export function readinessTone(recovery) {
  if (recovery == null) return null
  if (recovery >= 67) return 'good'
  if (recovery >= 34) return 'mid'
  return 'low'
}
