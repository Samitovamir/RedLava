// Приоритет источника данных здоровья: Whoop → Garmin.
// владелец: «есть Whoop — показываем по нему, нет — по Garmin, и экран меняется».
// Пользователь может зафиксировать источник вручную; по умолчанию — авто.

const KEY = 'albert-health-source'   // 'auto' | 'whoop' | 'garmin'

export const SOURCE_OPTIONS = ['auto', 'whoop', 'garmin']

export function loadSourcePref() {
  try { const s = localStorage.getItem(KEY); if (SOURCE_OPTIONS.includes(s)) return s } catch { /* ignore */ }
  return 'auto'
}

export function saveSourcePref(v) {
  try { localStorage.setItem(KEY, SOURCE_OPTIONS.includes(v) ? v : 'auto') } catch { /* ignore */ }
}

// Считаем Whoop «живым», если есть свежий балл восстановления/сна.
export function hasWhoopData(whoop) {
  return !!(whoop && (whoop.recovery != null || whoop.sleep));
}

// Garmin «живой», если есть заряд тела / стресс / VO2max / пульс покоя.
export function hasGarminData(garmin) {
  return !!(garmin && (garmin.bodyBattery?.current != null || garmin.stress || garmin.vo2Max != null || garmin.restingHr != null));
}

// Итоговый активный источник с учётом ручного выбора и реального наличия данных.
// Возвращает 'whoop' | 'garmin' | null.
export function resolveSource(pref, whoop, garmin) {
  const hasW = hasWhoopData(whoop)
  const hasG = hasGarminData(garmin)
  if (pref === 'whoop') return hasW ? 'whoop' : (hasG ? 'garmin' : null)
  if (pref === 'garmin') return hasG ? 'garmin' : (hasW ? 'whoop' : null)
  // auto — приоритет Whoop
  if (hasW) return 'whoop'
  if (hasG) return 'garmin'
  return null
}
