// Priority of the health data source: Whoop → Garmin.
// the user: "if there's Whoop, show that; if not, Garmin, and the screen changes".
// The source can also be pinned by hand; auto is the default.

const KEY = 'albert-health-source'   // 'auto' | 'whoop' | 'garmin'

export const SOURCE_OPTIONS = ['auto', 'whoop', 'garmin']

export function loadSourcePref() {
  try { const s = localStorage.getItem(KEY); if (SOURCE_OPTIONS.includes(s)) return s } catch { /* ignore */ }
  return 'auto'
}

export function saveSourcePref(v) {
  try { localStorage.setItem(KEY, SOURCE_OPTIONS.includes(v) ? v : 'auto') } catch { /* ignore */ }
}

// We treat Whoop as "live" when there's a recent recovery/sleep score.
export function hasWhoopData(whoop) {
  return !!(whoop && (whoop.recovery != null || whoop.sleep));
}

// Garmin counts as "live" when there's body battery / stress / VO2max / resting heart rate.
export function hasGarminData(garmin) {
  return !!(garmin && (garmin.bodyBattery?.current != null || garmin.stress || garmin.vo2Max != null || garmin.restingHr != null));
}

// The resulting active source, given the manual choice and what data actually exists.
// Returns 'whoop' | 'garmin' | null.
export function resolveSource(pref, whoop, garmin) {
  const hasW = hasWhoopData(whoop)
  const hasG = hasGarminData(garmin)
  if (pref === 'whoop') return hasW ? 'whoop' : (hasG ? 'garmin' : null)
  if (pref === 'garmin') return hasG ? 'garmin' : (hasW ? 'whoop' : null)
  // auto — Whoop takes priority
  if (hasW) return 'whoop'
  if (hasG) return 'garmin'
  return null
}
