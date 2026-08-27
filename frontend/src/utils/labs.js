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
// name — русское название, оно же ключ сопоставления при разборе PDF анализов (не переводить).
// nameEn — только для показа в английском UI.
const L = (name, group, unit, min, max, priority, aliases = [], nameEn = null) => ({ name, group, unit, min, max, priority, aliases, nameEn })
export const MARKER_LIBRARY = [
  // Общий анализ крови
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
  // Липиды
  L('Холестерин общий', 'lipids', 'ммоль/л', 3.0, 5.2, 'key', ['холестерин', 'общий холестерин'], 'Total cholesterol'),
  L('ЛПНП («плохой»)', 'lipids', 'ммоль/л', null, 3.0, 'key', ['лпнп', 'ldl', 'холестерин лпнп', 'плохой холестерин'], 'LDL (bad)'),
  L('ЛПВП («хороший»)', 'lipids', 'ммоль/л', 1.0, null, 'key', ['лпвп', 'hdl', 'хороший холестерин'], 'HDL (good)'),
  L('Триглицериды', 'lipids', 'ммоль/л', null, 1.7, 'key', ['тг', 'triglycerides'], 'Triglycerides'),
  L('ЛПОНП', 'lipids', 'ммоль/л', 0.1, 1.0, 'minor', ['vldl'], 'VLDL'),
  L('Коэффициент атерогенности', 'lipids', '', null, 3.0, 'minor', ['индекс атерогенности', 'ка'], 'Atherogenic index'),
  // Сахар и обмен
  L('Глюкоза', 'metabolic', 'ммоль/л', 3.9, 5.6, 'key', ['сахар', 'глюкоза крови'], 'Glucose'),
  L('Гликированный гемоглобин', 'metabolic', '%', 4.0, 6.0, 'key', ['hba1c', 'гликогемоглобин', 'гликированный гемоглобин a1c'], 'HbA1c'),
  L('Инсулин', 'metabolic', 'мкЕд/мл', 2.6, 24.9, 'minor', [], 'Insulin'),
  L('С-пептид', 'metabolic', 'нг/мл', 1.1, 4.4, 'minor', ['c-пептид'], 'C-peptide'),
  L('Мочевая кислота', 'metabolic', 'мкмоль/л', 200, 420, 'minor', ['urate'], 'Uric acid'),
  // Печень
  L('АЛТ', 'liver', 'Ед/л', null, 41, 'key', ['alt', 'аланинаминотрансфераза'], 'ALT'),
  L('АСТ', 'liver', 'Ед/л', null, 40, 'key', ['ast', 'аспартатаминотрансфераза'], 'AST'),
  L('Билирубин общий', 'liver', 'мкмоль/л', 3.4, 20.5, 'key', ['билирубин'], 'Total bilirubin'),
  L('ГГТ', 'liver', 'Ед/л', null, 60, 'minor', ['ггтп', 'гамма-гт', 'gamma-gt'], 'GGT'),
  L('Билирубин прямой', 'liver', 'мкмоль/л', null, 5.1, 'minor', ['прямой билирубин'], 'Direct bilirubin'),
  L('Щелочная фосфатаза', 'liver', 'Ед/л', 40, 130, 'minor', ['щф', 'alp'], 'Alkaline phosphatase'),
  L('Общий белок', 'liver', 'г/л', 64, 83, 'minor', ['белок общий'], 'Total protein'),
  L('Альбумин', 'liver', 'г/л', 35, 52, 'minor', [], 'Albumin'),
  L('ЛДГ', 'liver', 'Ед/л', 125, 220, 'minor', ['ldh'], 'LDH'),
  // Почки
  L('Креатинин', 'kidney', 'мкмоль/л', 62, 106, 'key', [], 'Creatinine'),
  L('Мочевина', 'kidney', 'ммоль/л', 2.5, 8.3, 'key', ['urea'], 'Urea'),
  L('СКФ', 'kidney', 'мл/мин', 90, null, 'minor', ['скорость клубочковой фильтрации', 'egfr', 'gfr'], 'eGFR'),
  L('Цистатин C', 'kidney', 'мг/л', 0.5, 1.0, 'minor', [], 'Cystatin C'),
  // Обмен железа
  L('Железо', 'iron', 'мкмоль/л', 11, 28, 'key', ['сывороточное железо', 'iron'], 'Iron'),
  L('Ферритин', 'iron', 'нг/мл', 30, 400, 'key', [], 'Ferritin'),
  L('Трансферрин', 'iron', 'г/л', 2.0, 3.6, 'minor', [], 'Transferrin'),
  L('ОЖСС', 'iron', 'мкмоль/л', 45, 77, 'minor', ['общая железосвязывающая способность', 'tibc'], 'TIBC'),
  L('Насыщение трансферрина', 'iron', '%', 20, 50, 'minor', [], 'Transferrin saturation'),
  // Витамины
  L('Витамин D', 'vitamins', 'нг/мл', 30, 100, 'key', ['25-oh витамин d', 'витамин д', '25(oh)d', '25-он витамин d'], 'Vitamin D'),
  L('Витамин B12', 'vitamins', 'пг/мл', 200, 900, 'key', ['b12', 'цианокобаламин', 'витамин в12'], 'Vitamin B12'),
  L('Фолиевая кислота', 'vitamins', 'нг/мл', 3.0, 17.0, 'minor', ['фолаты', 'b9', 'витамин b9'], 'Folate'),
  // Электролиты
  L('Калий', 'electrolytes', 'ммоль/л', 3.5, 5.1, 'key', ['k'], 'Potassium'),
  L('Натрий', 'electrolytes', 'ммоль/л', 136, 145, 'minor', ['na'], 'Sodium'),
  L('Кальций', 'electrolytes', 'ммоль/л', 2.15, 2.55, 'minor', ['ca', 'кальций общий'], 'Calcium'),
  L('Кальций ионизированный', 'electrolytes', 'ммоль/л', 1.12, 1.32, 'minor', [], 'Ionized calcium'),
  L('Магний', 'electrolytes', 'ммоль/л', 0.66, 1.07, 'minor', ['mg'], 'Magnesium'),
  L('Фосфор', 'electrolytes', 'ммоль/л', 0.81, 1.45, 'minor', ['фосфор неорганический'], 'Phosphorus'),
  L('Хлор', 'electrolytes', 'ммоль/л', 98, 107, 'minor', ['cl', 'хлориды'], 'Chloride'),
  // Щитовидная железа
  L('ТТГ', 'thyroid', 'мЕд/л', 0.4, 4.0, 'key', ['tsh'], 'TSH'),
  L('Т4 свободный', 'thyroid', 'пмоль/л', 9.0, 22.0, 'minor', ['ft4', 'свободный т4', 'т4 св'], 'Free T4'),
  L('Т3 свободный', 'thyroid', 'пмоль/л', 2.6, 5.7, 'minor', ['ft3', 'свободный т3', 'т3 св'], 'Free T3'),
  L('Антитела к ТПО', 'thyroid', 'Ед/мл', null, 34, 'minor', ['анти-тпо', 'ат-тпо', 'антитела к тиреопероксидазе'], 'Anti-TPO antibodies'),
  // Гормоны
  L('Тестостерон', 'hormones', 'нмоль/л', 8.6, 29, 'key', ['тестостерон общий', 'общий тестостерон'], 'Testosterone'),
  L('ПСА общий', 'hormones', 'нг/мл', null, 4.0, 'key', ['пса', 'psa', 'простатический специфический антиген'], 'Total PSA'),
  L('Кортизол', 'hormones', 'нмоль/л', 171, 536, 'key', [], 'Cortisol'),
  L('Тестостерон свободный', 'hormones', 'пг/мл', 4.5, 42, 'minor', ['свободный тестостерон'], 'Free testosterone'),
  L('ГСПГ', 'hormones', 'нмоль/л', 18.3, 54.1, 'minor', ['глобулин связывающий половые гормоны', 'shbg'], 'SHBG'),
  L('ЛГ', 'hormones', 'мЕд/мл', 1.7, 8.6, 'minor', ['лютеинизирующий гормон', 'lh'], 'LH'),
  L('ФСГ', 'hormones', 'мЕд/мл', 1.5, 12.4, 'minor', ['фолликулостимулирующий гормон', 'fsh'], 'FSH'),
  L('Пролактин', 'hormones', 'мЕд/л', 73, 407, 'minor', [], 'Prolactin'),
  L('ДГЭА-С', 'hormones', 'мкмоль/л', 1.0, 11.7, 'minor', ['dheas', 'дгэа сульфат'], 'DHEA-S'),
  // Воспаление
  L('СРБ', 'inflammation', 'мг/л', null, 5.0, 'key', ['с-реактивный белок', 'црб', 'crp', 'c реактивный белок'], 'CRP'),
  L('Ревматоидный фактор', 'inflammation', 'Ед/мл', null, 14, 'minor', ['рф', 'rf'], 'Rheumatoid factor'),
  L('Гомоцистеин', 'inflammation', 'мкмоль/л', null, 15, 'minor', [], 'Homocysteine'),
  // Свёртываемость
  L('МНО', 'coagulation', '', 0.8, 1.2, 'minor', ['inr'], 'INR'),
  L('Протромбин по Квику', 'coagulation', '%', 70, 130, 'minor', ['пти', 'протромбиновый индекс'], 'Prothrombin (Quick)'),
  L('АЧТВ', 'coagulation', 'сек', 25, 38, 'minor', ['aptt'], 'aPTT'),
  L('Фибриноген', 'coagulation', 'г/л', 2.0, 4.0, 'minor', [], 'Fibrinogen'),
  L('Д-димер', 'coagulation', 'нг/мл', null, 500, 'minor', ['d-dimer', 'д димер'], 'D-dimer')
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

// Сравнение единиц измерения (нормализуем регистр/пробелы/точки). Нужно, чтобы не
// подставлять норму справочника, если в документе показатель в ДРУГИХ единицах
// (например, Креатинин в г/л против справочных мкмоль/л — иначе ложное «понижен»).
const normUnit = u => String(u || '').toLowerCase().replace(/ё/g, 'е').replace(/[\s.]/g, '')
function unitsMatch(a, b) {
  const x = normUnit(a), y = normUnit(b)
  if (!x || !y) return true       // если единиц нет — не мешаем
  return x === y
}

// Найти определение показателя по «сырому» имени из файла.
// ТОЧНОЕ совпадение со справочником → каноническое имя/группа/важность, норму берём
// из документа, а из справочника только если её нет И совпадают единицы.
// ЧАСТИЧНОЕ совпадение → берём лишь ГРУППУ, имя и норму оставляем как в документе
// (чтобы варианты «Кортизол 8:00 / слюна / в крови» не сливались и не тянули чужую норму).
export function resolveMarker(rawName, last) {
  const key = normName(rawName)
  const docUnit = (last && last.unit) || ''
  const docHasRange = last && (last.min != null || last.max != null)
  const exact = MARKER_INDEX[key]

  if (exact) {
    const useLib = !docHasRange && unitsMatch(docUnit, exact.unit)
    return {
      name: exact.name,
      nameEn: exact.nameEn || null,     // для показа в английском UI (name — ключ разбора)
      group: exact.group,
      unit: docUnit || exact.unit || '',
      min: docHasRange ? (last.min ?? null) : (useLib ? exact.min : null),
      max: docHasRange ? (last.max ?? null) : (useLib ? exact.max : null),
      priority: exact.priority
    }
  }

  // Нет точного совпадения — определяем только группу
  const sub = MARKER_LIBRARY.find(m => {
    const n = normName(m.name)
    return n.length > 3 && (key.includes(n) || n.includes(key))
  })
  let group = sub ? sub.group : 'other'
  // Эвристика: антитела/иммуноглобулины — в «Инфекции и антитела»
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

// Собрать ВСЕ показатели из истории в группы по системам организма.
// Внутри группы: важные (key) и второстепенные (minor) отдельно. Возвращает только
// непустые группы в порядке MARKER_GROUPS. item: { key, def, h, last }.
export function buildGroups(history) {
  const items = Object.keys(history).map(name => {
    const h = history[name]
    const last = h[h.length - 1]
    return { key: name, h, last, def: resolveMarker(name, last) }
  })
  // Отклонения — выше, чтобы их было видно сразу; внутри — по алфавиту
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
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function fmtDate(iso, lang = 'ru') {
  const [y, m, d] = iso.split('-').map(Number)
  return lang === 'en' ? `${MONTHS_EN[m - 1]} ${d}` : `${d} ${MONTHS[m - 1]}`
}
export function todayIso() {
  const d = mskNow()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Единицы в справочнике и в русских бланках записаны кириллицей. Для английского UI
// показываем международную запись; сами значения и нормы не трогаем.
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
