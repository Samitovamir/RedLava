// Blood tests. The key thing about them: results do NOT arrive as a single file and NOT
// at the same time (the CBC was taken in March, hormones in May, the metabolic panel
// retaken later still). So the data is stored as dated REPORTS and the markers accumulate
// over time — each one gets a history of values and a trend.
//
// In the real integration the backend parses every uploaded PDF/photo into such a report
// and appends it to the shared log. None of the UI below changes because of that.

import { mskNow } from './time.js'

// Reference table of markers with their normal ranges, grouped by panel.
export const PANELS = [
  {
    name: 'Общий анализ крови', nameEn: 'Complete blood count', iconKey: 'lab-blood',
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
    name: 'Биохимия крови', iconKey: 'lab-liver',
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
    name: 'Гормоны', nameEn: 'Hormones', iconKey: 'lab-hormones',
    markers: [
      { name: 'ТТГ',         unit: 'мЕд/л',   min: 0.4, max: 4.0 },
      { name: 'Тестостерон', unit: 'нмоль/л', min: 8.6, max: 29 },
      { name: 'Кортизол',    unit: 'нмоль/л', min: 171, max: 536 },
      { name: 'Витамин D',   unit: 'нг/мл',   min: 30,  max: 100 }
    ]
  }
]

// Real blood tests come from Yandex.Disk (parsed by the AI). The demo data was removed so
// it cannot get mixed in with the real thing. Empty until the folder/recognition is hooked up.
export const INITIAL_REPORTS = []

// One-off cleanup: a browser may still hold a cached copy of the old demo blood tests (we
// used to load them as an example). On a version mismatch we wipe it — once and for good.
// Runs on the first import of labs.js (from any page: Home, Health, the snapshot for the AI).
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

// A value in a report can be a number (the old format) or an object {v, unit, min, max} —
// the latter comes from the AI parser, with the ranges taken straight from the document.
const valNum = v => (v && typeof v === 'object') ? v.v : v

// Build the history of every marker out of all the reports (by ascending date).
// Each point keeps the number plus the units and range from the document, when it had them.
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

// A value's status against its range: 'low' | 'high' | 'ok' | 'unknown' (no range at all)
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

// Markers missing from our PANELS reference table (Ferritin, CRP or Triglycerides, say) that
// nevertheless turned up in the files. Units and ranges are taken from the document itself.
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
// Reference table of markers by body system. Its job is to put any marker found in the
// files into a group people understand, give it a range (when the document had none) and
// an importance flag: 'key' (important — shown up front) or 'minor' (collapsed away).
// The ranges are the usual adult reference values; when the document states a range of its
// own we use THAT one (the lab knows its own method) and the table only fills in the gaps.
// ────────────────────────────────────────────────────────────────────────────

export const MARKER_GROUPS = [
  { key: 'blood',        name: 'Общий анализ крови', nameEn: 'Complete blood count', iconKey: 'lab-blood' },
  { key: 'lipids',       name: 'Липиды и сердце', nameEn: 'Lipids & heart',         iconKey: 'lab-lipids' },
  { key: 'metabolic',    name: 'Сахар и обмен', nameEn: 'Glucose & metabolism',           iconKey: 'lab-metabolic' },
  { key: 'liver',        name: 'Печень', nameEn: 'Liver',                  iconKey: 'lab-liver' },
  { key: 'kidney',       name: 'Почки', nameEn: 'Kidneys',                   iconKey: 'lab-kidney' },
  { key: 'iron',         name: 'Обмен железа', nameEn: 'Iron metabolism',            iconKey: 'lab-iron' },
  { key: 'vitamins',     name: 'Витамины', nameEn: 'Vitamins',                iconKey: 'lab-vitamins' },
  { key: 'electrolytes', name: 'Электролиты и минералы', nameEn: 'Electrolytes & minerals',  iconKey: 'lab-electrolytes' },
  { key: 'thyroid',      name: 'Щитовидная железа', nameEn: 'Thyroid',       iconKey: 'lab-thyroid' },
  { key: 'hormones',     name: 'Гормоны', nameEn: 'Hormones', iconKey: 'lab-hormones' },
  { key: 'inflammation', name: 'Воспаление и иммунитет', nameEn: 'Inflammation & immunity',  iconKey: 'lab-inflammation' },
  { key: 'coagulation',  name: 'Свёртываемость', nameEn: 'Coagulation',          iconKey: 'lab-coagulation' },
  { key: 'infections',   name: 'Инфекции и антитела', nameEn: 'Infections & antibodies',     iconKey: 'lab-infections' },
  { key: 'other',        name: 'Другие показатели', nameEn: 'Other markers',       iconKey: 'lab-other' }
]

// def: [name, group, unit, min, max, priority, ...aliases]
// name — the Russian name, which doubles as the matching key when parsing lab PDFs (do not translate).
// nameEn — for display in the English UI only.
const L = (name, group, unit, min, max, priority, aliases = [], nameEn = null) => ({ name, group, unit, min, max, priority, aliases, nameEn })
export const MARKER_LIBRARY = [
  // Complete blood count
  L('Гемоглобин', 'blood', 'г/л', 130, 170, 'key', ['hb', 'hgb'], 'Hemoglobin'),
  L('Эритроциты', 'blood', '×10¹²/л', 4.0, 5.5, 'key', ['rbc'], 'Red blood cells'),
  L('Лейкоциты', 'blood', '×10⁹/л', 4.0, 9.0, 'key', ['wbc'], 'White blood cells'),
  L('Тромбоциты', 'blood', '×10⁹/л', 150, 400, 'key', ['plt'], 'Platelets'),
  L('Гематокрит', 'blood', '%', 39, 49, 'minor', ['hct'], 'Hematocrit'),
  L('MCV (средний объём эритроцита)', 'blood', 'фл', 80, 100, 'minor', ['mcv', 'средний объем эритроцитов'], 'MCV (mean corpuscular volume)'),
  L('MCH (среднее содержание Hb)', 'blood', 'пг', 27, 34, 'minor', ['mch'], 'MCH (mean corpuscular hemoglobin)'),
  L('MCHC', 'blood', 'г/л', 320, 360, 'minor', [], 'MCHC'),
  L('Цветовой показатель', 'blood', '', 0.85, 1.05, 'minor', [], 'Color index'),
  L('СОЭ', 'blood', 'мм/ч', 1, 20, 'minor', ['esr'], 'ESR'),
  L('Ретикулоциты', 'blood', '‰', 2, 12, 'minor', [], 'Reticulocytes'),
  L('Нейтрофилы', 'blood', '%', 47, 72, 'minor', [], 'Neutrophils'),
  L('Лимфоциты', 'blood', '%', 19, 37, 'minor', [], 'Lymphocytes'),
  L('Моноциты', 'blood', '%', 3, 11, 'minor', [], 'Monocytes'),
  L('Эозинофилы', 'blood', '%', 0.5, 5, 'minor', [], 'Eosinophils'),
  L('Базофилы', 'blood', '%', 0, 1, 'minor', [], 'Basophils'),
  // Lipids
  L('Холестерин общий', 'lipids', 'ммоль/л', 3.0, 5.2, 'key', ['холестерин', 'общий холестерин'], 'Total cholesterol'),
  L('ЛПНП («плохой»)', 'lipids', 'ммоль/л', null, 3.0, 'key', ['лпнп', 'ldl', 'холестерин лпнп', 'плохой холестерин'], 'LDL (bad)'),
  L('ЛПВП («хороший»)', 'lipids', 'ммоль/л', 1.0, null, 'key', ['лпвп', 'hdl', 'хороший холестерин'], 'HDL (good)'),
  L('Триглицериды', 'lipids', 'ммоль/л', null, 1.7, 'key', ['тг', 'triglycerides'], 'Triglycerides'),
  L('ЛПОНП', 'lipids', 'ммоль/л', 0.1, 1.0, 'minor', ['vldl'], 'VLDL'),
  L('Коэффициент атерогенности', 'lipids', '', null, 3.0, 'minor', ['индекс атерогенности', 'ка'], 'Atherogenic index'),
  // Glucose & metabolism
  L('Глюкоза', 'metabolic', 'ммоль/л', 3.9, 5.6, 'key', ['сахар', 'глюкоза крови'], 'Glucose'),
  L('Гликированный гемоглобин', 'metabolic', '%', 4.0, 6.0, 'key', ['hba1c', 'гликогемоглобин', 'гликированный гемоглобин a1c'], 'HbA1c'),
  L('Инсулин', 'metabolic', 'мкЕд/мл', 2.6, 24.9, 'minor', [], 'Insulin'),
  L('С-пептид', 'metabolic', 'нг/мл', 1.1, 4.4, 'minor', ['c-пептид'], 'C-peptide'),
  L('Мочевая кислота', 'metabolic', 'мкмоль/л', 200, 420, 'minor', ['urate'], 'Uric acid'),
  // Liver
  L('АЛТ', 'liver', 'Ед/л', null, 41, 'key', ['alt', 'аланинаминотрансфераза'], 'ALT'),
  L('АСТ', 'liver', 'Ед/л', null, 40, 'key', ['ast', 'аспартатаминотрансфераза'], 'AST'),
  L('Билирубин общий', 'liver', 'мкмоль/л', 3.4, 20.5, 'key', ['билирубин'], 'Total bilirubin'),
  L('ГГТ', 'liver', 'Ед/л', null, 60, 'minor', ['ггтп', 'гамма-гт', 'gamma-gt'], 'GGT'),
  L('Билирубин прямой', 'liver', 'мкмоль/л', null, 5.1, 'minor', ['прямой билирубин'], 'Direct bilirubin'),
  L('Щелочная фосфатаза', 'liver', 'Ед/л', 40, 130, 'minor', ['щф', 'alp'], 'Alkaline phosphatase'),
  L('Общий белок', 'liver', 'г/л', 64, 83, 'minor', ['белок общий'], 'Total protein'),
  L('Альбумин', 'liver', 'г/л', 35, 52, 'minor', [], 'Albumin'),
  L('ЛДГ', 'liver', 'Ед/л', 125, 220, 'minor', ['ldh'], 'LDH'),
  // Kidneys
  L('Креатинин', 'kidney', 'мкмоль/л', 62, 106, 'key', [], 'Creatinine'),
  L('Мочевина', 'kidney', 'ммоль/л', 2.5, 8.3, 'key', ['urea'], 'Urea'),
  L('СКФ', 'kidney', 'мл/мин', 90, null, 'minor', ['скорость клубочковой фильтрации', 'egfr', 'gfr'], 'eGFR'),
  L('Цистатин C', 'kidney', 'мг/л', 0.5, 1.0, 'minor', [], 'Cystatin C'),
  // Iron metabolism
  L('Железо', 'iron', 'мкмоль/л', 11, 28, 'key', ['сывороточное железо', 'iron'], 'Iron'),
  L('Ферритин', 'iron', 'нг/мл', 30, 400, 'key', [], 'Ferritin'),
  L('Трансферрин', 'iron', 'г/л', 2.0, 3.6, 'minor', [], 'Transferrin'),
  L('ОЖСС', 'iron', 'мкмоль/л', 45, 77, 'minor', ['общая железосвязывающая способность', 'tibc'], 'TIBC'),
  L('Насыщение трансферрина', 'iron', '%', 20, 50, 'minor', [], 'Transferrin saturation'),
  // Vitamins
  L('Витамин D', 'vitamins', 'нг/мл', 30, 100, 'key', ['25-oh витамин d', 'витамин д', '25(oh)d', '25-он витамин d'], 'Vitamin D'),
  L('Витамин B12', 'vitamins', 'пг/мл', 200, 900, 'key', ['b12', 'цианокобаламин', 'витамин в12'], 'Vitamin B12'),
  L('Фолиевая кислота', 'vitamins', 'нг/мл', 3.0, 17.0, 'minor', ['фолаты', 'b9', 'витамин b9'], 'Folate'),
  // Electrolytes
  L('Калий', 'electrolytes', 'ммоль/л', 3.5, 5.1, 'key', ['k'], 'Potassium'),
  L('Натрий', 'electrolytes', 'ммоль/л', 136, 145, 'minor', ['na'], 'Sodium'),
  L('Кальций', 'electrolytes', 'ммоль/л', 2.15, 2.55, 'minor', ['ca', 'кальций общий'], 'Calcium'),
  L('Кальций ионизированный', 'electrolytes', 'ммоль/л', 1.12, 1.32, 'minor', [], 'Ionized calcium'),
  L('Магний', 'electrolytes', 'ммоль/л', 0.66, 1.07, 'minor', ['mg'], 'Magnesium'),
  L('Фосфор', 'electrolytes', 'ммоль/л', 0.81, 1.45, 'minor', ['фосфор неорганический'], 'Phosphorus'),
  L('Хлор', 'electrolytes', 'ммоль/л', 98, 107, 'minor', ['cl', 'хлориды'], 'Chloride'),
  // Thyroid
  L('ТТГ', 'thyroid', 'мЕд/л', 0.4, 4.0, 'key', ['tsh'], 'TSH'),
  L('Т4 свободный', 'thyroid', 'пмоль/л', 9.0, 22.0, 'minor', ['ft4', 'свободный т4', 'т4 св'], 'Free T4'),
  L('Т3 свободный', 'thyroid', 'пмоль/л', 2.6, 5.7, 'minor', ['ft3', 'свободный т3', 'т3 св'], 'Free T3'),
  L('Антитела к ТПО', 'thyroid', 'Ед/мл', null, 34, 'minor', ['анти-тпо', 'ат-тпо', 'антитела к тиреопероксидазе'], 'Anti-TPO antibodies'),
  // Hormones
  L('Тестостерон', 'hormones', 'нмоль/л', 8.6, 29, 'key', ['тестостерон общий', 'общий тестостерон'], 'Testosterone'),
  L('ПСА общий', 'hormones', 'нг/мл', null, 4.0, 'key', ['пса', 'psa', 'простатический специфический антиген'], 'Total PSA'),
  L('Кортизол', 'hormones', 'нмоль/л', 171, 536, 'key', [], 'Cortisol'),
  L('Тестостерон свободный', 'hormones', 'пг/мл', 4.5, 42, 'minor', ['свободный тестостерон'], 'Free testosterone'),
  L('ГСПГ', 'hormones', 'нмоль/л', 18.3, 54.1, 'minor', ['глобулин связывающий половые гормоны', 'shbg'], 'SHBG'),
  L('ЛГ', 'hormones', 'мЕд/мл', 1.7, 8.6, 'minor', ['лютеинизирующий гормон', 'lh'], 'LH'),
  L('ФСГ', 'hormones', 'мЕд/мл', 1.5, 12.4, 'minor', ['фолликулостимулирующий гормон', 'fsh'], 'FSH'),
  L('Пролактин', 'hormones', 'мЕд/л', 73, 407, 'minor', [], 'Prolactin'),
  L('ДГЭА-С', 'hormones', 'мкмоль/л', 1.0, 11.7, 'minor', ['dheas', 'дгэа сульфат'], 'DHEA-S'),
  // Inflammation
  L('СРБ', 'inflammation', 'мг/л', null, 5.0, 'key', ['с-реактивный белок', 'црб', 'crp', 'c реактивный белок'], 'CRP'),
  L('Ревматоидный фактор', 'inflammation', 'Ед/мл', null, 14, 'minor', ['рф', 'rf'], 'Rheumatoid factor'),
  L('Гомоцистеин', 'inflammation', 'мкмоль/л', null, 15, 'minor', [], 'Homocysteine'),
  // Coagulation
  L('МНО', 'coagulation', '', 0.8, 1.2, 'minor', ['inr'], 'INR'),
  L('Протромбин по Квику', 'coagulation', '%', 70, 130, 'minor', ['пти', 'протромбиновый индекс'], 'Prothrombin (Quick)'),
  L('АЧТВ', 'coagulation', 'сек', 25, 38, 'minor', ['aptt'], 'aPTT'),
  L('Фибриноген', 'coagulation', 'г/л', 2.0, 4.0, 'minor', [], 'Fibrinogen'),
  L('Д-димер', 'coagulation', 'нг/мл', null, 500, 'minor', ['d-dimer', 'д димер'], 'D-dimer')
]

// Normalize a name for matching (case, ё, brackets, punctuation, whitespace)
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

// Compare units of measurement (normalizing case, spaces and dots). This keeps us from
// substituting the table's range when the document reports the marker in DIFFERENT units
// (creatinine in г/л against the table's мкмоль/л, say — which would read as a false "low").
const normUnit = u => String(u || '').toLowerCase().replace(/ё/g, 'е').replace(/[\s.]/g, '')
function unitsMatch(a, b) {
  const x = normUnit(a), y = normUnit(b)
  if (!x || !y) return true       // no units given — don't get in the way
  return x === y
}

// Find a marker definition from the raw name in the file.
// An EXACT match in the table → canonical name, group and importance; the range comes from
// the document, and from the table only if the document has none AND the units agree.
// A PARTIAL match → take the GROUP only, leaving the name and range as the document had them
// (so variants like "Кортизол 8:00 / слюна / в крови" neither merge nor borrow each other's range).
export function resolveMarker(rawName, last) {
  const key = normName(rawName)
  const docUnit = (last && last.unit) || ''
  const docHasRange = last && (last.min != null || last.max != null)
  const exact = MARKER_INDEX[key]

  if (exact) {
    const useLib = !docHasRange && unitsMatch(docUnit, exact.unit)
    return {
      name: exact.name,
      nameEn: exact.nameEn || null,     // for the English UI (name is the parsing key)
      group: exact.group,
      unit: docUnit || exact.unit || '',
      min: docHasRange ? (last.min ?? null) : (useLib ? exact.min : null),
      max: docHasRange ? (last.max ?? null) : (useLib ? exact.max : null),
      priority: exact.priority
    }
  }

  // No exact match — work out the group and nothing else
  const sub = MARKER_LIBRARY.find(m => {
    const n = normName(m.name)
    return n.length > 3 && (key.includes(n) || n.includes(key))
  })
  let group = sub ? sub.group : 'other'
  // Heuristic: antibodies and immunoglobulins belong under "Infections & antibodies"
  if (group === 'other' && /антител|иммуноглобулин|\big\s?[gma]\b/i.test(rawName)) group = 'infections'

  return {
    name: rawName,
    group,
    unit: docUnit,
    min: docHasRange ? (last.min ?? null) : null,
    max: docHasRange ? (last.max ?? null) : null,
    priority: 'minor'
  }
}

// Gather EVERY marker in the history into groups by body system.
// Within a group the important ones (key) and the secondary ones (minor) are kept apart.
// Returns only the non-empty groups, in MARKER_GROUPS order. item: { key, def, h, last }.
export function buildGroups(history) {
  const items = Object.keys(history).map(name => {
    const h = history[name]
    const last = h[h.length - 1]
    return { key: name, h, last, def: resolveMarker(name, last) }
  })
  // Out-of-range values go on top so they are seen at once; alphabetical within a tier
  const sev = it => {
    const s = markerStatus(it.last.value, it.def.min, it.def.max)
    return s === 'high' || s === 'low' ? 0 : s === 'unknown' ? 2 : 1
  }
  const bySeverity = (a, b) => sev(a) - sev(b) || a.def.name.localeCompare(b.def.name)
  const byGroup = {}
  items.forEach(it => { (byGroup[it.def.group] ||= []).push(it) })
  return MARKER_GROUPS.filter(g => byGroup[g.key]?.length).map(g => {
    const list = byGroup[g.key]
    const major = list.filter(i => i.def.priority === 'key').sort(bySeverity)
    const minor = list.filter(i => i.def.priority !== 'key').sort(bySeverity)
    return { ...g, major, minor }
  })
}

export function rangeText(min, max, lang = 'ru') {
  const en = lang === 'en'
  if (min != null && max != null) return `${min}–${max}`
  if (max != null) return en ? `up to ${max}` : `до ${max}`
  if (min != null) return en ? `from ${min}` : `от ${min}`
  return '—'
}

// Bar geometry: the position of the value and of the reference band, in percent.
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
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function fmtDate(iso, lang = 'ru') {
  const [y, m, d] = iso.split('-').map(Number)
  return lang === 'en' ? `${MONTHS_EN[m - 1]} ${d}` : `${d} ${MONTHS[m - 1]}`
}
export function todayIso() {
  const d = mskNow()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Units in the table and on Russian lab forms are spelled in Cyrillic. In the English UI we
// show the international notation; the values and ranges themselves are left alone.
const UNITS_EN = {
  'г/л': 'g/L', 'мг/л': 'mg/L', 'ммоль/л': 'mmol/L', 'мкмоль/л': 'µmol/L',
  'нмоль/л': 'nmol/L', 'пмоль/л': 'pmol/L', 'Ед/л': 'U/L', 'ед/л': 'U/L',
  'мЕд/л': 'mIU/L', 'мЕд/мл': 'mIU/mL', 'мкЕд/мл': 'µIU/mL',
  'нг/мл': 'ng/mL', 'пг/мл': 'pg/mL', 'мкг/л': 'µg/L', 'мкг/дл': 'µg/dL',
  'мм/ч': 'mm/h', 'мл/мин': 'mL/min', 'мл/мин/1.73м²': 'mL/min/1.73m²',
  '×10⁹/л': '×10⁹/L', '×10¹²/л': '×10¹²/L', 'г/дл': 'g/dL', 'фл': 'fL', 'пг': 'pg',
  'нг/дл': 'ng/dL', 'мкмоль/сут': 'µmol/day', 'сек': 's', 'с': 's',
}

export function unitLabel(unit, lang = 'ru') {
  if (!unit || lang !== 'en') return unit || ''
  return UNITS_EN[unit] || unit
}
