// Анализы крови. Ключевая особенность: результаты приходят НЕ одним файлом
// и НЕ одновременно (ОАК сдал в марте, гормоны в мае, биохимию пересдал позже).
// Поэтому данные хранятся как ОТЧЁТЫ с датами, а маркеры накапливаются во времени —
// для каждого показателя собирается история значений и тренд.
//
// При реальной интеграции backend парсит каждый загруженный PDF/фото в такой отчёт
// и добавляет его в общий журнал. UI ниже от этого не меняется.

import { mskNow } from './time.js'

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

// Реальные анализы приходят из Яндекс.Диска (разбор ИИ). Демо-данные убраны,
// чтобы не смешивались с настоящими. Пусто до подключения папки/распознавания.
export const INITIAL_REPORTS = []

// Одноразовая чистка: в браузере мог остаться сохранённый кэш старых демо-анализов
// (мы их подгружали как пример). При несовпадении версии стираем его — раз и навсегда.
// Запускается при первом импорте labs.js (любая страница: Главная, Здоровье, снимок для ИИ).
export const LABS_STORE_KEY = 'albert-labs'
export const LABS_STORE_VERSION = '2'
;(function purgeStaleLabs() {
  try {
    if (typeof localStorage === 'undefined') return
    if (localStorage.getItem('albert-labs-ver') !== LABS_STORE_VERSION) {
      localStorage.removeItem(LABS_STORE_KEY)
      localStorage.setItem('albert-labs-ver', LABS_STORE_VERSION)
    }
  } catch { /* ignore */ }
})()

// Значение в отчёте может быть числом (старый формат) или объектом {v, unit, min, max}
// — последнее приходит от ИИ-парсера с нормами прямо из документа.
const valNum = v => (v && typeof v === 'object') ? v.v : v

// Собрать историю по каждому маркеру из всех отчётов (по возрастанию даты).
// В каждой точке храним число + единицы/границы нормы из документа (если были).
export function buildHistory(reports) {
  const sorted = [...reports].sort((a, b) => a.date.localeCompare(b.date))
  const hist = {}
  sorted.forEach(r =>
    Object.entries(r.values).forEach(([name, value]) => {
      const meta = (value && typeof value === 'object') ? value : {}
      ;(hist[name] ||= []).push({ date: r.date, value: valNum(value), unit: meta.unit, min: meta.min ?? null, max: meta.max ?? null })
    })
  )
  return hist
}

// Статус значения относительно нормы: 'low' | 'high' | 'ok' | 'unknown' (нет границ)
export function markerStatus(value, min, max) {
  if (min == null && max == null) return 'unknown'
  if (min != null && value < min) return 'low'
  if (max != null && value > max) return 'high'
  return 'ok'
}

export const STATUS_INFO = {
  ok:      { label: 'норма',    color: 'var(--green)' },
  low:     { label: 'понижен',  color: 'var(--yellow)' },
  high:    { label: 'повышен',  color: 'var(--red)' },
  unknown: { label: 'нет нормы', color: 'var(--muted)' }
}

// Маркеры, которых нет в нашем справочнике PANELS (например, Ферритин, СРБ, Триглицериды),
// но которые встретились в файлах. Берём единицы и нормы из самого документа.
export function extraMarkers(history) {
  const known = new Set(PANELS.flatMap(p => p.markers.map(m => m.name)))
  return Object.keys(history)
    .filter(n => !known.has(n))
    .map(name => {
      const last = history[name][history[name].length - 1]
      return { name, unit: last.unit || '', min: last.min ?? null, max: last.max ?? null }
    })
}

// ────────────────────────────────────────────────────────────────────────────
// Справочник показателей по системам организма. Нужен, чтобы любой показатель из
// файлов лёг в понятную группу, получил норму (если её не было в документе) и
// пометку важности: 'key' (важный — на виду) или 'minor' (второстепенный — свёрнут).
// Нормы — общие референсные значения для взрослого; если в документе указана своя
// норма, мы используем ЕЁ (лаборатория знает свой метод), а справочник лишь дополняет.
// ────────────────────────────────────────────────────────────────────────────

export const MARKER_GROUPS = [
  { key: 'blood',        name: 'Общий анализ крови',     icon: '🩸' },
  { key: 'lipids',       name: 'Липиды и сердце',         icon: '🫀' },
  { key: 'metabolic',    name: 'Сахар и обмен',           icon: '🍬' },
  { key: 'liver',        name: 'Печень',                  icon: '🧪' },
  { key: 'kidney',       name: 'Почки',                   icon: '🧫' },
  { key: 'iron',         name: 'Обмен железа',            icon: '🧲' },
  { key: 'vitamins',     name: 'Витамины',                icon: '💊' },
  { key: 'electrolytes', name: 'Электролиты и минералы',  icon: '🧂' },
  { key: 'thyroid',      name: 'Щитовидная железа',       icon: '🦋' },
  { key: 'hormones',     name: 'Гормоны',                 icon: '⚗️' },
  { key: 'inflammation', name: 'Воспаление и иммунитет',  icon: '🔥' },
  { key: 'coagulation',  name: 'Свёртываемость',          icon: '🩹' },
  { key: 'other',        name: 'Другие показатели',       icon: '🔬' }
]

// def: [name, group, unit, min, max, priority, ...aliases]
const L = (name, group, unit, min, max, priority, aliases = []) => ({ name, group, unit, min, max, priority, aliases })
export const MARKER_LIBRARY = [
  // Общий анализ крови
  L('Гемоглобин', 'blood', 'г/л', 130, 170, 'key', ['hb', 'hgb']),
  L('Эритроциты', 'blood', '×10¹²/л', 4.0, 5.5, 'key', ['rbc']),
  L('Лейкоциты', 'blood', '×10⁹/л', 4.0, 9.0, 'key', ['wbc']),
  L('Тромбоциты', 'blood', '×10⁹/л', 150, 400, 'key', ['plt']),
  L('Гематокрит', 'blood', '%', 39, 49, 'minor', ['hct']),
  L('MCV (средний объём эритроцита)', 'blood', 'фл', 80, 100, 'minor', ['mcv', 'средний объем эритроцитов']),
  L('MCH (среднее содержание Hb)', 'blood', 'пг', 27, 34, 'minor', ['mch']),
  L('MCHC', 'blood', 'г/л', 320, 360, 'minor', []),
  L('Цветовой показатель', 'blood', '', 0.85, 1.05, 'minor', []),
  L('СОЭ', 'blood', 'мм/ч', 1, 20, 'minor', ['esr']),
  L('Ретикулоциты', 'blood', '‰', 2, 12, 'minor', []),
  L('Нейтрофилы', 'blood', '%', 47, 72, 'minor', []),
  L('Лимфоциты', 'blood', '%', 19, 37, 'minor', []),
  L('Моноциты', 'blood', '%', 3, 11, 'minor', []),
  L('Эозинофилы', 'blood', '%', 0.5, 5, 'minor', []),
  L('Базофилы', 'blood', '%', 0, 1, 'minor', []),
  // Липиды
  L('Холестерин общий', 'lipids', 'ммоль/л', 3.0, 5.2, 'key', ['холестерин', 'общий холестерин']),
  L('ЛПНП («плохой»)', 'lipids', 'ммоль/л', null, 3.0, 'key', ['лпнп', 'ldl', 'холестерин лпнп', 'плохой холестерин']),
  L('ЛПВП («хороший»)', 'lipids', 'ммоль/л', 1.0, null, 'key', ['лпвп', 'hdl', 'хороший холестерин']),
  L('Триглицериды', 'lipids', 'ммоль/л', null, 1.7, 'key', ['тг', 'triglycerides']),
  L('ЛПОНП', 'lipids', 'ммоль/л', 0.1, 1.0, 'minor', ['vldl']),
  L('Коэффициент атерогенности', 'lipids', '', null, 3.0, 'minor', ['индекс атерогенности', 'ка']),
  // Сахар и обмен
  L('Глюкоза', 'metabolic', 'ммоль/л', 3.9, 5.6, 'key', ['сахар', 'глюкоза крови']),
  L('Гликированный гемоглобин', 'metabolic', '%', 4.0, 6.0, 'key', ['hba1c', 'гликогемоглобин', 'гликированный гемоглобин a1c']),
  L('Инсулин', 'metabolic', 'мкЕд/мл', 2.6, 24.9, 'minor', []),
  L('С-пептид', 'metabolic', 'нг/мл', 1.1, 4.4, 'minor', ['c-пептид']),
  L('Мочевая кислота', 'metabolic', 'мкмоль/л', 200, 420, 'minor', ['urate']),
  // Печень
  L('АЛТ', 'liver', 'Ед/л', null, 41, 'key', ['alt', 'аланинаминотрансфераза']),
  L('АСТ', 'liver', 'Ед/л', null, 40, 'key', ['ast', 'аспартатаминотрансфераза']),
  L('Билирубин общий', 'liver', 'мкмоль/л', 3.4, 20.5, 'key', ['билирубин']),
  L('ГГТ', 'liver', 'Ед/л', null, 60, 'minor', ['ггтп', 'гамма-гт', 'gamma-gt']),
  L('Билирубин прямой', 'liver', 'мкмоль/л', null, 5.1, 'minor', ['прямой билирубин']),
  L('Щелочная фосфатаза', 'liver', 'Ед/л', 40, 130, 'minor', ['щф', 'alp']),
  L('Общий белок', 'liver', 'г/л', 64, 83, 'minor', ['белок общий']),
  L('Альбумин', 'liver', 'г/л', 35, 52, 'minor', []),
  L('ЛДГ', 'liver', 'Ед/л', 125, 220, 'minor', ['ldh']),
  // Почки
  L('Креатинин', 'kidney', 'мкмоль/л', 62, 106, 'key', []),
  L('Мочевина', 'kidney', 'ммоль/л', 2.5, 8.3, 'key', ['urea']),
  L('СКФ', 'kidney', 'мл/мин', 90, null, 'minor', ['скорость клубочковой фильтрации', 'egfr', 'gfr']),
  L('Цистатин C', 'kidney', 'мг/л', 0.5, 1.0, 'minor', []),
  // Обмен железа
  L('Железо', 'iron', 'мкмоль/л', 11, 28, 'key', ['сывороточное железо', 'iron']),
  L('Ферритин', 'iron', 'нг/мл', 30, 400, 'key', []),
  L('Трансферрин', 'iron', 'г/л', 2.0, 3.6, 'minor', []),
  L('ОЖСС', 'iron', 'мкмоль/л', 45, 77, 'minor', ['общая железосвязывающая способность', 'tibc']),
  L('Насыщение трансферрина', 'iron', '%', 20, 50, 'minor', []),
  // Витамины
  L('Витамин D', 'vitamins', 'нг/мл', 30, 100, 'key', ['25-oh витамин d', 'витамин д', '25(oh)d', '25-он витамин d']),
  L('Витамин B12', 'vitamins', 'пг/мл', 200, 900, 'key', ['b12', 'цианокобаламин', 'витамин в12']),
  L('Фолиевая кислота', 'vitamins', 'нг/мл', 3.0, 17.0, 'minor', ['фолаты', 'b9', 'витамин b9']),
  // Электролиты
  L('Калий', 'electrolytes', 'ммоль/л', 3.5, 5.1, 'key', ['k']),
  L('Натрий', 'electrolytes', 'ммоль/л', 136, 145, 'minor', ['na']),
  L('Кальций', 'electrolytes', 'ммоль/л', 2.15, 2.55, 'minor', ['ca', 'кальций общий']),
  L('Кальций ионизированный', 'electrolytes', 'ммоль/л', 1.12, 1.32, 'minor', []),
  L('Магний', 'electrolytes', 'ммоль/л', 0.66, 1.07, 'minor', ['mg']),
  L('Фосфор', 'electrolytes', 'ммоль/л', 0.81, 1.45, 'minor', ['фосфор неорганический']),
  L('Хлор', 'electrolytes', 'ммоль/л', 98, 107, 'minor', ['cl', 'хлориды']),
  // Щитовидная железа
  L('ТТГ', 'thyroid', 'мЕд/л', 0.4, 4.0, 'key', ['tsh']),
  L('Т4 свободный', 'thyroid', 'пмоль/л', 9.0, 22.0, 'minor', ['ft4', 'свободный т4', 'т4 св']),
  L('Т3 свободный', 'thyroid', 'пмоль/л', 2.6, 5.7, 'minor', ['ft3', 'свободный т3', 'т3 св']),
  L('Антитела к ТПО', 'thyroid', 'Ед/мл', null, 34, 'minor', ['анти-тпо', 'ат-тпо', 'антитела к тиреопероксидазе']),
  // Гормоны
  L('Тестостерон', 'hormones', 'нмоль/л', 8.6, 29, 'key', ['тестостерон общий', 'общий тестостерон']),
  L('ПСА общий', 'hormones', 'нг/мл', null, 4.0, 'key', ['пса', 'psa', 'простатический специфический антиген']),
  L('Кортизол', 'hormones', 'нмоль/л', 171, 536, 'key', []),
  L('Тестостерон свободный', 'hormones', 'пг/мл', 4.5, 42, 'minor', ['свободный тестостерон']),
  L('ГСПГ', 'hormones', 'нмоль/л', 18.3, 54.1, 'minor', ['глобулин связывающий половые гормоны', 'shbg']),
  L('ЛГ', 'hormones', 'мЕд/мл', 1.7, 8.6, 'minor', ['лютеинизирующий гормон', 'lh']),
  L('ФСГ', 'hormones', 'мЕд/мл', 1.5, 12.4, 'minor', ['фолликулостимулирующий гормон', 'fsh']),
  L('Пролактин', 'hormones', 'мЕд/л', 73, 407, 'minor', []),
  L('ДГЭА-С', 'hormones', 'мкмоль/л', 1.0, 11.7, 'minor', ['dheas', 'дгэа сульфат']),
  // Воспаление
  L('СРБ', 'inflammation', 'мг/л', null, 5.0, 'key', ['с-реактивный белок', 'црб', 'crp', 'c реактивный белок']),
  L('Ревматоидный фактор', 'inflammation', 'Ед/мл', null, 14, 'minor', ['рф', 'rf']),
  L('Гомоцистеин', 'inflammation', 'мкмоль/л', null, 15, 'minor', []),
  // Свёртываемость
  L('МНО', 'coagulation', '', 0.8, 1.2, 'minor', ['inr']),
  L('Протромбин по Квику', 'coagulation', '%', 70, 130, 'minor', ['пти', 'протромбиновый индекс']),
  L('АЧТВ', 'coagulation', 'сек', 25, 38, 'minor', ['aptt']),
  L('Фибриноген', 'coagulation', 'г/л', 2.0, 4.0, 'minor', []),
  L('Д-димер', 'coagulation', 'нг/мл', null, 500, 'minor', ['d-dimer', 'д димер'])
]

// Нормализация имени для сопоставления (регистр, ё, скобки, пунктуация, пробелы)
const normName = s => String(s || '').toLowerCase().replace(/ё/g, 'е')
  .replace(/[()«»".,/]/g, ' ').replace(/\s+/g, ' ').trim()

const MARKER_INDEX = (() => {
  const idx = {}
  MARKER_LIBRARY.forEach(m => {
    idx[normName(m.name)] = m
    m.aliases.forEach(a => { idx[normName(a)] = m })
  })
  return idx
})()

// Найти определение показателя по «сырому» имени из файла. Возвращает группу,
// единицы, нормы и важность. Нормы предпочитаем из документа (last), справочник дополняет.
export function resolveMarker(rawName, last) {
  const key = normName(rawName)
  let def = MARKER_INDEX[key]
  if (!def) {
    def = MARKER_LIBRARY.find(m => {
      const n = normName(m.name)
      return n.length > 3 && (key.includes(n) || n.includes(key))
    })
  }
  const docHasRange = last && (last.min != null || last.max != null)
  const min = docHasRange ? (last.min ?? null) : (def ? def.min : null)
  const max = docHasRange ? (last.max ?? null) : (def ? def.max : null)
  return {
    name: def ? def.name : rawName,
    group: def ? def.group : 'other',
    unit: (last && last.unit) || (def ? def.unit : '') || '',
    min, max,
    priority: def ? def.priority : 'minor'
  }
}

// Собрать ВСЕ показатели из истории в группы по системам организма.
// Внутри группы: важные (key) и второстепенные (minor) отдельно. Возвращает только
// непустые группы в порядке MARKER_GROUPS. item: { key, def, h, last }.
export function buildGroups(history) {
  const items = Object.keys(history).map(name => {
    const h = history[name]
    const last = h[h.length - 1]
    return { key: name, h, last, def: resolveMarker(name, last) }
  })
  const byGroup = {}
  items.forEach(it => { (byGroup[it.def.group] ||= []).push(it) })
  const order = MARKER_GROUPS
  return order.filter(g => byGroup[g.key]?.length).map(g => {
    const list = byGroup[g.key]
    const major = list.filter(i => i.def.priority === 'key').sort((a, b) => a.def.name.localeCompare(b.def.name))
    const minor = list.filter(i => i.def.priority !== 'key').sort((a, b) => a.def.name.localeCompare(b.def.name))
    return { ...g, major, minor }
  })
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
  const d = mskNow()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
