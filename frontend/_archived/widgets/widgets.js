// Система редактируемых виджетов (Здоровье/Спорт) в духе Apple.
// Каждая метрика — виджет с выбором ФОРМЫ: 'num' (число 1×1), 'ring' (бублик с
// зонами 2×1), 'detail' (крупный: график/бублик + пояснение ИИ 2×2).
// Здесь: сбор всех метрик Whoop/Garmin, каталог, тексты-пояснения, сохранение раскладки.

function readLS(key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null } catch { return null } }

export function buildMetrics() {
  const w = readLS('albert-whoop-live')
  const g = readLS('albert-garmin-live')
  const s = w?.sleep || {}
  const bb = g?.bodyBattery || null
  const st = g?.stress || null
  return {
    hasWhoop: !!(w && (w.recovery != null || w.sleep)),
    hasGarmin: !!(g && (g.steps != null || g.vo2Max != null || bb || st)),
    recovery: w?.recovery ?? null, strain: w?.strain ?? null, strainMax: w?.strainMax || 21,
    hrv: w?.hrv ?? null, rhr: w?.rhr ?? null, spo2: w?.spo2 ?? null, respiratory: w?.respiratoryRate ?? null,
    skinTemp: w?.skinTemp ?? null, skinTempDelta: w?.skinTempDelta ?? null,
    sleepScore: s.performance ?? null, sleepHours: s.hoursSlept ?? null, sleepNeeded: s.hoursNeeded ?? null,
    sleepStages: s.stages ?? null, sleepStart: s.start ?? null, sleepEnd: s.end ?? null,
    sleepEfficiency: s.efficiency ?? null, sleepCycles: s.cycles ?? null, sleepDisturbances: s.disturbances ?? null,
    week: Array.isArray(w?.week) ? w.week : [],
    steps: g?.steps ?? null, restingHr: g?.restingHr ?? null, vo2Max: g?.vo2Max ?? null,
    bbCurrent: bb?.current ?? null, bbCharged: bb?.charged ?? null, bbDrained: bb?.drained ?? null,
    stress: st ? (st.current ?? st.avg ?? null) : null, stressAvg: st?.avg ?? null, stressMax: st?.max ?? null,
    weekKm: g?.weekKm ?? null, weekCount: g?.weekCount ?? null,
    workouts: g?.workouts || [], lastWorkout: g?.lastWorkout || (g?.workouts && g.workouts[0]) || null
  }
}

// forms: доступные формы (по возрастанию). def: форма по умолчанию.
// kind: 'gauge' (бублик со шкалой) | 'number' (нет осмысленной шкалы) | 'series' (график).
// core: показывать в раскладке по умолчанию. explain: пояснение для «переворота».
export const WIDGETS = {
  // ── Здоровье ──
  recovery:     { page: 'health', title: 'Восстановление', icon: 'heart', kind: 'gauge', forms: ['num', 'ring', 'detail'], def: 'ring', graph: 'week', core: true, unit: '%', explain: 'Готовность организма к нагрузке — утренний балл Whoop. Выше — тело лучше восстановилось за ночь.', available: m => m.recovery != null },
  sleep:        { page: 'health', title: 'Сон', icon: 'moon', kind: 'series', forms: ['num', 'ring', 'detail'], def: 'ring', graph: 'sleep', core: true, unit: '%', explain: 'Качество сна — насколько сон закрыл потребность организма. Складывается из фаз: глубокий, лёгкий, REM.', available: m => m.sleepScore != null },
  strain:       { page: 'health', title: 'Нагрузка', icon: 'activity', kind: 'gauge', forms: ['num', 'ring', 'detail'], def: 'num', core: true, unit: '', explain: 'Суточная нагрузка на сердечно-сосудистую систему (шкала Whoop 0–21). Выше — тяжелее был день.', available: m => m.strain != null },
  stress:       { page: 'health', title: 'Стресс', icon: 'gauge', kind: 'gauge', forms: ['num', 'ring', 'detail'], def: 'ring', core: true, unit: '', explain: 'Уровень напряжения по пульсу (Garmin 0–100). Ниже — спокойнее; меняется в течение дня.', available: m => m.stress != null },
  bodyBattery:  { page: 'health', title: 'Заряд тела', icon: 'battery', kind: 'gauge', forms: ['num', 'ring', 'detail'], def: 'ring', core: true, unit: '', explain: 'Живой запас энергии (Garmin 0–100): заряжается во сне и отдыхе, тратится активностью и стрессом.', available: m => m.bbCurrent != null },
  balance:      { page: 'health', title: 'Восстановление ↔ Нагрузка', icon: 'scale', kind: 'series', forms: ['ring', 'detail'], def: 'detail', core: true, unit: '', explain: 'Сопоставление восстановления и текущей нагрузки: есть ли запас для тренировки или лучше отдых.', available: m => m.recovery != null && m.strain != null },
  recoveryWeek: { page: 'health', title: 'Восстановление за неделю', icon: 'chart', kind: 'series', forms: ['ring', 'detail'], def: 'ring', graph: 'week', unit: '', explain: 'Восстановление по дням недели — виден тренд формы: набираешь или устаёшь.', available: m => m.week.length > 0 },
  hrv:          { page: 'health', title: 'HRV', icon: 'waves', kind: 'gauge', forms: ['num', 'ring', 'detail'], def: 'num', unit: ' мс', explain: 'Вариабельность пульса (мс) — разброс между ударами сердца. Выше — лучше восстановление и стрессоустойчивость.', available: m => m.hrv != null },
  rhr:          { page: 'health', title: 'Пульс покоя', icon: 'heart', kind: 'gauge', forms: ['num', 'ring', 'detail'], def: 'num', unit: '', explain: 'Пульс в состоянии покоя (уд/мин). Ниже — обычно лучше тренированность сердца.', available: m => (m.rhr ?? m.restingHr) != null },
  spo2:         { page: 'health', title: 'SpO₂', icon: 'droplet', kind: 'gauge', forms: ['num', 'ring', 'detail'], def: 'num', unit: '%', explain: 'Насыщение крови кислородом. Норма — 95–100%. Низкие значения во сне — повод присмотреться к дыханию.', available: m => m.spo2 != null },
  respiratory:  { page: 'health', title: 'Дыхание во сне', icon: 'wind', kind: 'number', forms: ['num', 'detail'], def: 'num', unit: '', explain: 'Частота дыхания во сне (вдохов/мин). Стабильность из ночи в ночь — признак нормы.', available: m => m.respiratory != null },
  skinTemp:     { page: 'health', title: 'Температура кожи', icon: 'thermo', kind: 'number', forms: ['num', 'detail'], def: 'num', unit: '°', explain: 'Температура кожи относительно твоей нормы. Резкие отклонения — ранний сигнал (болезнь, недосып, алкоголь).', available: m => m.skinTemp != null },
  sleepEff:     { page: 'health', title: 'Эффективность сна', icon: 'moon', kind: 'gauge', forms: ['num', 'ring', 'detail'], def: 'num', unit: '%', explain: 'Доля времени в постели, которое ты реально спал. Ниже 85% — часто просыпался или долго засыпал.', available: m => m.sleepEfficiency != null },
  // ── Спорт ──
  steps:        { page: 'sport', title: 'Шаги', icon: 'footprints', kind: 'gauge', forms: ['num', 'ring', 'detail'], def: 'ring', core: true, unit: '', explain: 'Шаги за день. Дневная цель — 10 000. Базовая бытовая активность помимо тренировок.', available: m => m.steps != null },
  vo2max:       { page: 'sport', title: 'VO₂max', icon: 'run', kind: 'gauge', forms: ['num', 'ring', 'detail'], def: 'ring', core: true, unit: '', explain: 'VO₂max — максимальное потребление кислорода, ключевой показатель выносливости. Выше — лучше аэробная форма.', available: m => m.vo2Max != null },
  restingHr:    { page: 'sport', title: 'Пульс покоя', icon: 'heart', kind: 'gauge', forms: ['num', 'ring', 'detail'], def: 'num', core: true, unit: '', explain: 'Пульс в покое (Garmin). Снижение со временем — признак роста тренированности.', available: m => (m.restingHr ?? m.rhr) != null },
  bbSport:      { page: 'sport', title: 'Заряд тела', icon: 'battery', kind: 'gauge', forms: ['num', 'ring', 'detail'], def: 'ring', core: true, unit: '', explain: 'Запас энергии (Garmin 0–100): заряжается во сне и отдыхе, тратится нагрузкой и стрессом.', available: m => m.bbCurrent != null },
  calories:     { page: 'sport', title: 'Калории тренировок', icon: 'flame', kind: 'series', forms: ['ring', 'detail'], def: 'ring', core: true, unit: '', explain: 'Активные калории тренировок за сегодня и за неделю (по данным Garmin).', available: m => m.workouts.length > 0 },
  weekVolume:   { page: 'sport', title: 'Объём за неделю', icon: 'route', kind: 'number', forms: ['num', 'detail'], def: 'num', core: true, unit: ' км', explain: 'Суммарный объём тренировок за последние 7 дней (км).', available: m => m.weekKm != null },
  stressSport:  { page: 'sport', title: 'Стресс', icon: 'gauge', kind: 'gauge', forms: ['num', 'ring', 'detail'], def: 'num', unit: '', explain: 'Уровень напряжения по пульсу (Garmin 0–100). Ниже — спокойнее.', available: m => m.stress != null }
}

// Раскладка по умолчанию: core-виджеты в их форме по умолчанию.
export function defaultLayout(page, metrics) {
  return Object.entries(WIDGETS)
    .filter(([, w]) => w.page === page && w.core && w.available(metrics))
    .map(([id, w]) => ({ id, form: w.def }))
}

const KEY = page => `albert-widgets-${page}`

export function loadLayout(page, metrics) {
  try {
    const s = localStorage.getItem(KEY(page))
    if (s) {
      const saved = JSON.parse(s)
      if (Array.isArray(saved) && saved.length) {
        // миграция старого size→form; фильтр недоступных
        const SZ = { s: 'num', m: 'ring', l: 'detail' }
        return saved
          .map(it => ({ id: it.id, form: it.form || SZ[it.size] || (WIDGETS[it.id]?.def) }))
          .filter(it => WIDGETS[it.id] && WIDGETS[it.id].available(metrics) && WIDGETS[it.id].forms.includes(it.form))
      }
    }
  } catch { /* ignore */ }
  return defaultLayout(page, metrics)
}

export function saveLayout(page, layout) {
  try { localStorage.setItem(KEY(page), JSON.stringify(layout)) } catch { /* ignore */ }
}

export function availableToAdd(page, layout, metrics) {
  const inUse = new Set(layout.map(it => it.id))
  return Object.entries(WIDGETS)
    .filter(([id, w]) => w.page === page && w.available(metrics) && !inUse.has(id))
    .map(([id, w]) => ({ id, title: w.title, icon: w.icon }))
}

// ── Настройка: показывать Здоровье/Спорт виджет-сеткой (альтернативный вид) ──
const VIEW_KEY = 'albert-widgets-view'
export function widgetsViewEnabled() {
  try { const v = localStorage.getItem(VIEW_KEY); return v == null ? true : v === '1' } catch { return true }
}
export function setWidgetsView(on) {
  try { localStorage.setItem(VIEW_KEY, on ? '1' : '0') } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('albert-widgets-view', { detail: !!on }))
}
