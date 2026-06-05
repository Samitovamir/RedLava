// Анализы крови. Ключевая особенность: результаты приходят НЕ одним файлом
// и НЕ одновременно (ОАК сдал в марте, гормоны в мае, биохимию пересдал позже).
// Поэтому данные хранятся как ОТЧЁТЫ с датами, а маркеры накапливаются во времени —
// для каждого показателя собирается история значений и тренд.
//
// При реальной интеграции backend парсит каждый загруженный PDF/фото в такой отчёт
// и добавляет его в общий журнал. UI ниже от этого не меняется.

// Справочник показателей с нормами, сгруппированный по панелям.
export const PANELS = [
  {
    name: 'Общий анализ крови', icon: '🩸',
    markers: [
      { name: 'Гемоглобин',  unit: 'г/л',     min: 130, max: 170 },
      { name: 'Эритроциты',  unit: '×10¹²/л', min: 4.0, max: 5.5 },
      { name: 'Лейкоциты',   unit: '×10⁹/л',  min: 4.0, max: 9.0 },
      { name: 'Тромбоциты',  unit: '×10⁹/л',  min: 150, max: 400 },
      { name: 'Гематокрит',  unit: '%',       min: 39,  max: 49 },
      { name: 'СОЭ',         unit: 'мм/ч',    min: 1,   max: 15 }
    ]
  },
  {
    name: 'Биохимия крови', icon: '🧪',
    markers: [
      { name: 'Глюкоза',          unit: 'ммоль/л',  min: 3.9,  max: 5.6 },
      { name: 'Холестерин общий', unit: 'ммоль/л',  min: 3.0,  max: 5.2 },
      { name: 'ЛПНП («плохой»)',  unit: 'ммоль/л',  min: null, max: 3.0 },
      { name: 'ЛПВП («хороший»)', unit: 'ммоль/л',  min: 1.0,  max: null },
      { name: 'Креатинин',        unit: 'мкмоль/л', min: 62,   max: 106 },
      { name: 'АЛТ',              unit: 'Ед/л',     min: null, max: 41 },
      { name: 'АСТ',              unit: 'Ед/л',     min: null, max: 40 }
    ]
  },
  {
    name: 'Гормоны', icon: '⚗️',
    markers: [
      { name: 'ТТГ',         unit: 'мЕд/л',   min: 0.4, max: 4.0 },
      { name: 'Тестостерон', unit: 'нмоль/л', min: 8.6, max: 29 },
      { name: 'Кортизол',    unit: 'нмоль/л', min: 171, max: 536 },
      { name: 'Витамин D',   unit: 'нг/мл',   min: 30,  max: 100 }
    ]
  }
]

// Журнал полученных отчётов (пришли в разные даты, разными файлами).
export const INITIAL_REPORTS = [
  {
    id: 1, date: '2026-03-15', fileName: 'ОАК_биохимия_15.03.pdf',
    values: {
      'Гемоглобин': 141, 'Эритроциты': 4.7, 'Лейкоциты': 5.9, 'Тромбоциты': 232, 'Гематокрит': 42, 'СОЭ': 10,
      'Глюкоза': 5.6, 'Холестерин общий': 6.1, 'ЛПНП («плохой»)': 3.9, 'ЛПВП («хороший»)': 1.2,
      'Креатинин': 90, 'АЛТ': 30, 'АСТ': 26
    }
  },
  {
    id: 2, date: '2026-05-02', fileName: 'Гормоны_май.pdf',
    values: { 'ТТГ': 2.3, 'Тестостерон': 17, 'Кортизол': 410, 'Витамин D': 21 }
  },
  {
    id: 3, date: '2026-05-28', fileName: 'ОАК_биохимия_28.05.pdf',
    values: {
      'Гемоглобин': 145, 'Эритроциты': 4.8, 'Лейкоциты': 6.2, 'Тромбоциты': 240, 'Гематокрит': 43, 'СОЭ': 8,
      'Глюкоза': 5.4, 'Холестерин общий': 5.8, 'ЛПНП («плохой»)': 3.6, 'ЛПВП («хороший»)': 1.3,
      'Креатинин': 88, 'АЛТ': 28, 'АСТ': 24
    }
  }
]

// Собрать историю по каждому маркеру из всех отчётов (по возрастанию даты).
export function buildHistory(reports) {
  const sorted = [...reports].sort((a, b) => a.date.localeCompare(b.date))
  const hist = {}
  sorted.forEach(r =>
    Object.entries(r.values).forEach(([name, value]) => {
      (hist[name] ||= []).push({ date: r.date, value })
    })
  )
  return hist
}

// Статус значения относительно нормы: 'low' | 'high' | 'ok'
export function markerStatus(value, min, max) {
  if (min != null && value < min) return 'low'
  if (max != null && value > max) return 'high'
  return 'ok'
}

export const STATUS_INFO = {
  ok:   { label: 'норма',   color: 'var(--green)' },
  low:  { label: 'понижен', color: 'var(--yellow)' },
  high: { label: 'повышен', color: 'var(--red)' }
}

export function rangeText(min, max) {
  if (min != null && max != null) return `${min}–${max}`
  if (max != null) return `до ${max}`
  if (min != null) return `от ${min}`
  return '—'
}

// Геометрия шкалы: положение значения и референсной зоны в процентах.
export function barGeom(value, min, max) {
  let lo = min, hi = max, dispLo, dispHi
  if (lo != null && hi != null) {
    const r = hi - lo
    dispLo = lo - r * 0.45; dispHi = hi + r * 0.45
  } else if (hi != null) {
    lo = 0; dispLo = 0; dispHi = hi * 1.7
  } else {
    hi = Math.max(value, lo) * 1.5; dispLo = 0; dispHi = hi
  }
  const pad = (dispHi - dispLo) * 0.08
  dispLo = Math.min(dispLo, value - pad)
  dispHi = Math.max(dispHi, value + pad)
  const span = dispHi - dispLo || 1
  const pct = v => Math.max(0, Math.min(100, ((v - dispLo) / span) * 100))
  return { bandLeft: pct(lo), bandRight: pct(hi), valuePos: pct(value) }
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
export function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}
export function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
