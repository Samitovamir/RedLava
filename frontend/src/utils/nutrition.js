// Расчёт целевого КБЖУ + хранилища профиля, плана меню, вкусов и списка покупок.
// Цель считаем детерминированно (формула Миффлина-Сан Жеора), ИИ — только подбор блюд.

import { mskNow, mskDateKey } from './time.js'

export const PROFILE_KEY = 'albert-nutrition-profile'
export const SHOPPING_KEY = 'albert-shopping-2'   // v2: копим в базовых единицах, показываем продуктами
export const TASTE_KEY = 'albert-taste'
export const PLAN_KEY = 'albert-meal-plan'

// Профиль по умолчанию — реальные данные пользователя.
// Уровень активности больше не выбирается: тренировки берём из Garmin (реальный расход).
export const DEFAULT_PROFILE = {
  weight: 75, height: 175, age: 35, sex: 'male',
  goal: 'lose'
}

// Множитель повседневной активности (быт без спорта): обмен покоя × NEAT.
// Сами тренировки НЕ зашиты сюда — они приходят отдельно из Garmin (реальные калории).
const NEAT_MULT = 1.35

export const GOALS = [
  { key: 'lose', label: 'Снизить вес', delta: -400 },
  { key: 'maintain', label: 'Поддержать', delta: 0 },
  { key: 'gain', label: 'Набрать массу', delta: 300 }
]

export function loadProfile() {
  try { const s = localStorage.getItem(PROFILE_KEY); if (s) return { ...DEFAULT_PROFILE, ...JSON.parse(s) } } catch { /* ignore */ }
  return { ...DEFAULT_PROFILE }
}
export function saveProfile(p) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)) } catch { /* ignore */ } }

// BMR по Миффлину-Сан Жеору
export function mifflinBMR({ weight, height, age, sex }) {
  return 10 * weight + 6.25 * height - 5 * age + (sex === 'female' ? -161 : 5)
}

// Целевое КБЖУ из профиля (с защитой от пустых/мусорных полей)
export function computeTarget(profile) {
  const weight = Math.min(250, Math.max(30, +profile.weight || 70))
  const height = Math.min(230, Math.max(120, +profile.height || 170))
  const age = Math.min(100, Math.max(14, +profile.age || 40))
  const sex = profile.sex
  const bmr = mifflinBMR({ weight, height, age, sex })
  const goal = GOALS.find(g => g.key === profile.goal) || GOALS[1]
  // База = обмен покоя × быт (NEAT), БЕЗ спорта. Тренировки добавляются отдельно из Garmin.
  const neat = bmr * NEAT_MULT
  const kcal = Math.round((neat + goal.delta) / 10) * 10
  // Белок: 2.0 г/кг при наборе, иначе 1.8; жир ~27% ккал; остальное — углеводы
  const protein = Math.round(weight * (profile.goal === 'gain' ? 2.0 : 1.8))
  const fat = Math.round((kcal * 0.27) / 9)
  const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
  return { kcal, protein, fat, carb, bmr: Math.round(bmr), neat: Math.round(neat) }
}

// Приёмы пищи: доля от дневной цели + ориентир по времени (для напоминания «оцени блюдо»)
export const MEALS = [
  { key: 'Завтрак', share: 0.3, hour: 9, iconKey: 'meal-breakfast' },
  { key: 'Обед', share: 0.35, hour: 14, iconKey: 'meal-lunch' },
  { key: 'Перекус', share: 0.1, hour: 17, iconKey: 'meal-snack' },
  { key: 'Ужин', share: 0.25, hour: 20, iconKey: 'meal-dinner' }
]
export const MEAL_KEYS = MEALS.map(m => m.key)

// Текущий приём пищи по времени суток (МСК). Пороги: <11 завтрак, <15:30 обед, <18:30 перекус, иначе ужин.
export function currentMeal() {
  const now = mskNow()
  const h = now.getHours() + now.getMinutes() / 60
  if (h < 11) return 'Завтрак'
  if (h < 15.5) return 'Обед'
  if (h < 18.5) return 'Перекус'
  return 'Ужин'
}

export function mealTarget(dayTarget, share) {
  return {
    kcal: Math.round(dayTarget.kcal * share / 10) * 10,
    protein: Math.round(dayTarget.protein * share),
    fat: Math.round(dayTarget.fat * share),
    carb: Math.round(dayTarget.carb * share)
  }
}

// ── Динамическая цель на день (тренировки + восстановление + перенос со вчера) ──
export function loadGarmin() { try { const s = localStorage.getItem('albert-garmin-live'); if (s) return JSON.parse(s) } catch { /* ignore */ } return null }
export function loadWhoop() { try { const s = localStorage.getItem('albert-whoop-live'); if (s) return JSON.parse(s) } catch { /* ignore */ } return null }

// АКТИВНЫЕ калории тренировок за дату (из Garmin), т.е. СВЕРХ повседневного расхода.
// Garmin отдаёт полные калории активности (включая обмен покоя за время тренировки),
// поэтому вычитаем повседневный расход за минуты тренировки — иначе он бы посчитался
// дважды: один раз в базе (BMR × NEAT за все 1440 мин суток), второй — здесь.
// ВАЖНО: вычитаем по той же ставке, что заложена в базу — BMR × NEAT_MULT / 1440,
// а не «голый» BMR/1440, иначе остаётся остаток ~(NEAT_MULT−1)×BMR/мин, который
// раздувал дневную норму на ~100 ккал за час тренировки (баг «задвоения калорий»).
export function workoutKcal(garmin, dateKey, bmr = 0) {
  if (!garmin?.workouts) return 0
  const perMin = bmr > 0 ? (bmr * NEAT_MULT) / 1440 : 0
  return Math.round(
    garmin.workouts
      .filter(w => w.date === dateKey)
      .reduce((s, w) => s + Math.max(0, (w.calories || 0) - perMin * (w.durationMin || 0)), 0)
  )
}

// Сколько примерно уже съедено в этот день: приёмы, оценённые или у которых время уже прошло
export function eatenKcal(plan, dateKey) {
  const day = plan[dateKey] || {}
  const todayKey = mskDateKey()
  const hour = mskNow().getHours()
  let kcal = 0
  for (const m of MEALS) {
    const dish = day[m.key]
    if (!dish) continue
    const passed = dateKey < todayKey || dish.rated || hour >= m.hour
    if (passed) kcal += dish.kcal || 0
  }
  return Math.round(kcal)
}

// Динамическая цель на конкретный день.
// База = обмен покоя + быт (без спорта). Сверху ПОЛНОСТЬЮ добавляем реальный активный
// расход тренировок из Garmin — без срезающих клампов, чтобы тяжёлый день (длинная
// тренировка на 1500+ ккал) не недодавал. Верхний предел — только защита от сбоя трекера.
export function dynamicTarget(base, profile, opts = {}) {
  const { burned = 0, hasGarmin = false, recovery = null, carry = 0 } = opts
  const trainDelta = hasGarmin ? Math.max(0, Math.min(3000, Math.round(burned))) : 0
  // Восстановление НЕ трогает калории: расход уже регулируется тренировками (burned из Garmin),
  // а урезать еду при плохом восстановлении вредно — телу нужны белок/энергия на восстановление.
  // Оставляем только текстовую подсказку по нагрузке.
  const recDelta = 0
  let recNote = ''
  if (typeof recovery === 'number' && recovery > 0) {
    if (recovery < 34) recNote = 'низкое восстановление — сегодня без тяжёлого, не голодай'
    else if (recovery >= 67) recNote = 'высокое восстановление — можно нагрузиться'
  }
  const carryDelta = Math.max(-300, Math.min(300, Math.round(carry)))
  const floor = Math.round(base.bmr * 1.2)
  const kcal = Math.max(floor, Math.round((base.kcal + trainDelta + carryDelta) / 10) * 10)
  const weight = Math.min(250, Math.max(30, +profile.weight || 70))
  const protein = Math.round(weight * (profile.goal === 'gain' ? 2.0 : 1.8))
  const fat = Math.round(kcal * 0.27 / 9)
  const carbG = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
  return { kcal, protein, fat, carb: carbG, base: base.kcal, trainDelta, recDelta, recNote, carryDelta, burned }
}

// Мягкий перенос со вчера: переел → сегодня чуть меньше, недоел → чуть больше.
// Считаем по ФАКТИЧЕСКИ съеденному (intake: фото-дневник/CalAI/довески), фолбэк — план.
export function carryFromYesterday(plan, intake, dateKey, prevTargetKcal) {
  const prev = new Date(dateKey + 'T00:00:00'); prev.setDate(prev.getDate() - 1)
  const p = n => String(n).padStart(2, '0')
  const prevKey = `${prev.getFullYear()}-${p(prev.getMonth() + 1)}-${p(prev.getDate())}`
  const ate = eatenForDay(plan, intake, prevKey)
  if (ate <= 0) return 0
  return Math.round((prevTargetKcal - ate) * 0.5)
}

// ── Вкусовые предпочтения ──
export const CUISINES = ['Русская', 'Итальянская', 'Грузинская', 'Японская', 'Средиземноморская', 'Азиатская', 'Мексиканская']

export const DEFAULT_PREFS = {
  spicy: 2, sweet: 4,
  pork: true, beef: true, chicken: true, fish: true, seafood: true, dairy: true, eggs: true, mushrooms: true,
  cuisines: [], cookTime: 'any',  // 'fast' | 'any'
  allergies: '', avoid: '',
  fodmap: true,                    // диета Low-FODMAP — по умолчанию включена (назначено врачом)
  // регулярные «довески», которые тоже идут в КБЖУ
  coffee: 'no',        // 'no' | 'black' | 'milk' | 'milk_sugar'
  coffeeCups: 1,
  proteinBar: false, proteinShake: false,
  likes: [], dislikes: []          // копятся из обратной связи (названия блюд)
}

// Быстрый учёт «довесков» (приблизительные КБЖУ за штуку/чашку)
export const QUICK_ADD = [
  { key: 'coffee_milk', label: 'Кофе с молоком', kcal: 60, protein: 3, fat: 3, carb: 5 },
  { key: 'coffee_milk_sugar', label: 'Кофе с молоком и сахаром', kcal: 100, protein: 3, fat: 3, carb: 15 },
  { key: 'coffee_black', label: 'Кофе чёрный', kcal: 5, protein: 0, fat: 0, carb: 1 },
  { key: 'protein_bar', label: 'Протеиновый батончик', kcal: 200, protein: 20, fat: 7, carb: 22 },
  { key: 'protein_shake', label: 'Протеиновый коктейль', kcal: 160, protein: 27, fat: 3, carb: 8 }
]

// FODMAP-светофор: уровень → подпись + цвет (токены статуса). null, если уровня нет.
export function fodmapMeta(band, lang = 'ru') {
  const en = lang === 'en'
  if (band === 'high') return { key: 'high', label: en ? 'High' : 'Высокий', color: 'var(--status-crit)' }
  if (band === 'mod') return { key: 'mod', label: en ? 'Moderate' : 'Умеренный', color: 'var(--status-warn)' }
  if (band === 'low') return { key: 'low', label: en ? 'Low' : 'Низкий', color: 'var(--status-ok)' }
  return null
}

// Грубая оценка FODMAP по названию/составу — для уже залогированной еды без метки ИИ.
const FOD_HIGH = [['чеснок', 'чеснок'], ['лук', 'лук'], ['пшениц', 'пшеница'], ['хлеб', 'хлеб'], ['булк', 'выпечка'], ['паста', 'паста'], ['макарон', 'макароны'], ['блин', 'пшеница (блин)'], ['кесадиль', 'пшеница (кесадилья)'], ['тортиль', 'тортилья'], ['лаваш', 'лаваш'], ['пельмен', 'пшеница'], ['вареник', 'пшеница'], ['фасол', 'бобовые'], ['бобов', 'бобовые'], ['горох', 'горох'], ['чечевиц', 'чечевица'], ['нут', 'нут'], ['молоко', 'лактоза'], ['сливочн', 'сливки'], ['сливк', 'сливки'], ['сметан', 'сметана'], ['сгущ', 'сгущёнка'], ['йогурт', 'лактоза'], ['мороженое', 'лактоза'], ['яблок', 'яблоко'], ['груш', 'груша'], ['манго', 'манго'], ['медов', 'мёд'], ['гриб', 'грибы'], ['спаржа', 'спаржа'], ['цветная капуст', 'цветная капуста']]
const FOD_MOD = [['авокадо', 'авокадо'], ['батат', 'батат'], ['свекл', 'свёкла'], ['кукуруз', 'кукуруза'], ['брокколи', 'брокколи'], ['сельдер', 'сельдерей'], ['вишн', 'вишня'], ['черешн', 'черешня'], ['изюм', 'изюм'], ['кешью', 'кешью'], ['фисташ', 'фисташки']]
// Оценка по НАЗВАНИЮ (items не берём — ИИ мог их додумать и дать ложные срабатывания, напр. «лук» в говядине).
function guessFodmap(name) {
  const hay = (name || '').toLowerCase().replace(/ё/g, 'е')
  for (const [k, label] of FOD_HIGH) if (hay.includes(k)) return { band: 'high', reason: label }
  for (const [k, label] of FOD_MOD) if (hay.includes(k)) return { band: 'mod', reason: label }
  return { band: 'low', reason: '' }
}
// Уровень FODMAP записи: метка от ИИ если есть, иначе оценка по названию (estimated: true).
export function entryFodmap(entry) {
  if (!entry) return null
  if (entry.fodmap) return { band: entry.fodmap, reason: entry.fodmapReason || '', estimated: false }
  const g = guessFodmap(entry.name)
  return { band: g.band, reason: g.reason, estimated: true }
}

export function loadPrefs() {
  try { const s = localStorage.getItem(TASTE_KEY); if (s) return { ...DEFAULT_PREFS, ...JSON.parse(s) } } catch { /* ignore */ }
  return { ...DEFAULT_PREFS }
}
export function savePrefs(p) { try { localStorage.setItem(TASTE_KEY, JSON.stringify(p)) } catch { /* ignore */ } }

// Запомнить реакцию на блюдо (из оценки)
export function rememberDish(prefs, name, liked) {
  if (!name) return prefs
  const likes = new Set(prefs.likes || []), dislikes = new Set(prefs.dislikes || [])
  if (liked) { likes.add(name); dislikes.delete(name) } else { dislikes.add(name); likes.delete(name) }
  // не разрастаемся бесконечно
  const trim = arr => [...arr].slice(-30)
  return { ...prefs, likes: trim(likes), dislikes: trim(dislikes) }
}

// ── План меню на дни ──
// plan[dateKey][mealKey] = { name, short, kcal, protein, fat, carb, ingredients, steps, chosenAt, rated, rating, feedback }
export function loadPlan() {
  try { const s = localStorage.getItem(PLAN_KEY); if (s) return JSON.parse(s) } catch { /* ignore */ }
  return {}
}
export function savePlan(p) { try { localStorage.setItem(PLAN_KEY, JSON.stringify(p)) } catch { /* ignore */ } }

export function setPlanMeal(plan, dateKey, mealKey, dish) {
  const day = { ...(plan[dateKey] || {}) }
  day[mealKey] = dish
  return { ...plan, [dateKey]: day }
}
export function clearPlanMeal(plan, dateKey, mealKey) {
  const day = { ...(plan[dateKey] || {}) }
  delete day[mealKey]
  return { ...plan, [dateKey]: day }
}
export function rateMeal(plan, dateKey, mealKey, rating, feedback) {
  const day = { ...(plan[dateKey] || {}) }
  if (day[mealKey]) day[mealKey] = { ...day[mealKey], rated: true, rating, feedback: feedback || '' }
  return { ...plan, [dateKey]: day }
}

// Дни текущей недели (Пн–Вс) по московскому времени
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const pad = n => String(n).padStart(2, '0')
const fmtKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function weekDays() {
  const todayKey = mskDateKey()
  const base = new Date(todayKey + 'T00:00:00')
  const dow = (base.getDay() + 6) % 7  // Пн = 0
  const mon = new Date(base); mon.setDate(base.getDate() - dow)
  const out = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon); d.setDate(mon.getDate() + i)
    const key = fmtKey(d)
    out.push({ key, wd: WD[i], day: d.getDate(), month: MONTHS[d.getMonth()], isToday: key === todayKey })
  }
  return out
}

// Подсчёт калорий, уже выбранных на день
export function dayPlanned(plan, dateKey) {
  const day = plan[dateKey] || {}
  let kcal = 0, count = 0
  MEAL_KEYS.forEach(k => { if (day[k]) { kcal += day[k].kcal || 0; count++ } })
  return { kcal: Math.round(kcal), count }
}

// Найти первое блюдо, которое пора оценить (время приёма прошло, оценки ещё нет)
export function pendingRating(plan) {
  const todayKey = mskDateKey()
  const hour = mskNow().getHours()
  const dates = Object.keys(plan).filter(k => k <= todayKey).sort()
  for (const dateKey of dates) {
    const day = plan[dateKey]
    for (const m of MEALS) {
      const dish = day[m.key]
      if (!dish || dish.rated) continue
      const passed = dateKey < todayKey || hour >= m.hour
      if (passed) return { dateKey, mealKey: m.key, dish }
    }
  }
  return null
}

// ── Список покупок (копится за неделю; копим в базовых единицах, показываем продуктами) ──
const daysSince = iso => { try { return Math.floor((new Date(mskDateKey()) - new Date(iso)) / 86400000) } catch { return 0 } }
export function loadShopping() {
  try {
    const s = localStorage.getItem(SHOPPING_KEY)
    if (s) {
      const list = JSON.parse(s)
      if (!list.weekStart || daysSince(list.weekStart) >= 7) return { weekStart: mskDateKey(), items: [] }
      return list
    }
  } catch { /* ignore */ }
  return { weekStart: mskDateKey(), items: [] }  // items: [{name, base, qty, from}]
}
export function saveShopping(list) { try { localStorage.setItem(SHOPPING_KEY, JSON.stringify(list)) } catch { /* ignore */ } }

const normIng = s => String(s || '').trim().toLowerCase()
const ru = n => String(n).replace('.', ',')

// Кладовка: дома и так есть — в список покупок не добавляем
const PANTRY_RE = /^(соль|перец|вода|специ|приправ|сахар ванил|ванилин)/i

// Единица измерения → [базовая единица, множитель]
const UNIT_MAP = {
  'мл': ['ml', 1], 'ml': ['ml', 1], 'миллилитр': ['ml', 1],
  'л': ['ml', 1000], 'l': ['ml', 1000], 'литр': ['ml', 1000], 'литра': ['ml', 1000], 'литров': ['ml', 1000],
  'г': ['g', 1], 'гр': ['g', 1], 'грамм': ['g', 1], 'грамма': ['g', 1], 'граммов': ['g', 1], 'g': ['g', 1],
  'кг': ['g', 1000], 'kg': ['g', 1000], 'килограмм': ['g', 1000],
  'шт': ['pcs', 1], 'шт.': ['pcs', 1], 'штук': ['pcs', 1], 'штука': ['pcs', 1], 'штуки': ['pcs', 1], 'pcs': ['pcs', 1],
  'зубчик': ['pcs', 1], 'зубчика': ['pcs', 1], 'зубчиков': ['pcs', 1], 'долька': ['pcs', 1],
  'ч.л.': ['ml', 5], 'чл': ['ml', 5], 'ч.л': ['ml', 5], 'чайнаяложка': ['ml', 5],
  'ст.л.': ['ml', 15], 'стл': ['ml', 15], 'ст.л': ['ml', 15], 'столоваяложка': ['ml', 15],
  'стакан': ['ml', 200], 'стакана': ['ml', 200], 'стаканов': ['ml', 200]
}

// Канонизация названий: одинаковый продукт под разными именами → одно имя (чтобы не дублировался в списке).
// Порядок важен: более узкие правила идут раньше общих.
// (\w в JS не ловит кириллицу — используем [а-я]; clean уже в нижнем регистре и ё→е)
const CANON = [
  { label: 'Томатная паста', re: /томатн[а-я]* паст|томат паст/ },
  { label: 'Помидоры', re: /помидор|томат/ },
  { label: 'Куриное филе', re: /кур[а-я]* (фил|груд)|(фил|груд)[а-я]* кур/ },
  { label: 'Индейка', re: /индейк|индюш/ },
  { label: 'Говядина', re: /говядин|телятин/ },
  { label: 'Свинина', re: /свинин/ },
  { label: 'Курица', re: /кур(иц|ин|е)/ },
  { label: 'Оливковое масло', re: /оливк/ },
  { label: 'Растительное масло', re: /(растительн|подсолнечн)[а-я]* масл/ },
  { label: 'Сливочное масло', re: /сливочн[а-я]* масл|масл[а-я]* сливочн/ },
  { label: 'Зелёный лук', re: /зелен[а-я]* лук|лук[а-я]* (зелен|пер)/ },
  { label: 'Лук репчатый', re: /лук|репчат/ },
  { label: 'Молоко', re: /молок/ },
  { label: 'Кефир', re: /кефир/ },
  { label: 'Сметана', re: /сметан/ },
  { label: 'Творог', re: /творог|творож[а-я]* масс/ },
  { label: 'Йогурт', re: /йогурт/ },
  { label: 'Сливочный сыр', re: /сливочн[а-я]* сыр|крем.?сыр|творожн[а-я]* сыр/ },
  { label: 'Яйца', re: /яйц|яиц/ },
  { label: 'Чеснок', re: /чеснок/ },
  { label: 'Морковь', re: /морков/ },
  { label: 'Картофель', re: /картоф|картош/ },
  { label: 'Овсяные хлопья', re: /овсян|геркулес/ },
  { label: 'Гречка', re: /гречк|гречнев/ },
  { label: 'Рис', re: /рис/ },
  { label: 'Грецкие орехи', re: /грецк[а-я]* орех|орех[а-я]* грецк/ },
  { label: 'Мёд', re: /мед/ },
  { label: 'Банан', re: /банан/ },
  { label: 'Яблоко', re: /яблок/ },
  { label: 'Мука', re: /мука|муки/ },
  { label: 'Сахар', re: /сахар/ },
  { label: 'Изюм', re: /изюм/ },
  { label: 'Ягоды', re: /ягод/ },
  { label: 'Огурец', re: /огурц|огурец/ },
  { label: 'Рыба', re: /рыб/ },
  { label: 'Сыр', re: /сыр/ }
]
function canonName(raw) {
  const clean = String(raw || '').toLowerCase().replace(/ё/g, 'е').replace(/\([^)]*\)/g, ' ').replace(/\d+[.,]?\d*\s*%/g, ' ').replace(/\s+/g, ' ').trim()
  for (const c of CANON) { if (c.re.test(clean)) return c.label }
  // не нашли — оставляем как есть, но аккуратно (первая буква заглавная)
  const t = String(raw || '').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Привести ингредиент рецепта к {name, base, qty в базовой единице}; null = пропустить (кладовка)
export function normalizeIngredient(ing) {
  const raw = String(ing.name || '').trim()
  if (!raw) return null
  if (PANTRY_RE.test(raw)) return null
  const name = canonName(raw)
  const rawUnit = String(ing.unit || '').trim().toLowerCase().replace(/\s+/g, '')
  const qty = typeof ing.qty === 'number' ? ing.qty : null
  const m = UNIT_MAP[rawUnit]
  if (qty == null || !m) return { name, base: '', qty: null }  // нет числа/неизвестная единица — просто продукт
  return { name, base: m[0], qty: qty * m[1] }
}

// Добавить ингредиенты в список, суммируя одинаковые (имя + базовая единица)
export function addToShopping(list, ingredients, from) {
  const items = list.items.map(x => ({ ...x }))
  ingredients.forEach(raw => {
    const ing = normalizeIngredient(raw)
    if (!ing) return
    const i = items.findIndex(x => normIng(x.name) === normIng(ing.name) && (x.base || '') === (ing.base || ''))
    if (i === -1) items.push({ name: ing.name, base: ing.base, qty: ing.qty, from: from || '' })
    else if (ing.qty != null) items[i].qty = (typeof items[i].qty === 'number' ? items[i].qty : 0) + ing.qty
  })
  return { ...list, items }
}

// Сколько ПОКУПАТЬ: округляем накопленное до товарных объёмов (0,5 л → 1 л и т.п.)
export function formatProduct(it) {
  const { base, qty } = it
  if (qty == null) return '—'
  if (base === 'ml') {
    const l = Math.ceil(qty / 500) / 2     // шаг 0,5 л, минимум 0,5 л
    return ru(l) + ' л'
  }
  if (base === 'pcs') return Math.ceil(qty) + ' шт'
  if (base === 'g') {
    if (qty >= 900) { const kg = Math.ceil(qty / 100) / 10; return ru(kg) + ' кг' }
    return Math.ceil(qty / 100) * 100 + ' г'   // шаг 100 г
  }
  return '—'
}

// ── Съеденное за день: CalAI-скриншот (точно) или «довески» вручную ──
export const INTAKE_KEY = 'albert-intake'
export function loadIntake() { try { const s = localStorage.getItem(INTAKE_KEY); if (s) return JSON.parse(s) } catch { /* ignore */ } return {} }
export function saveIntake(o) { try { localStorage.setItem(INTAKE_KEY, JSON.stringify(o)) } catch { /* ignore */ } }
// Записать итог дня из CalAI (авторитетно)
export function setCalaiIntake(intake, dateKey, data) {
  return { ...intake, [dateKey]: { source: 'calai', kcal: data.kcal || 0, protein: data.protein || 0, fat: data.fat || 0, carb: data.carb || 0, items: data.items || [] } }
}
// Добавить «довесок» вручную (кофе, батончик…). Если день уже ведётся фото-дневником —
// добавляем как его запись (суммируется), иначе legacy-режим manual.
export function addIntakeExtra(intake, dateKey, item) {
  if (intake[dateKey]?.source === 'photo') {
    return addPhotoIntake(intake, dateKey, { name: item.label || item.name, kcal: item.kcal || 0, protein: item.protein || 0, fat: item.fat || 0, carb: item.carb || 0, manual: true })
  }
  const cur = intake[dateKey]?.source === 'manual' ? intake[dateKey] : { source: 'manual', kcal: 0, protein: 0, fat: 0, carb: 0, items: [] }
  return {
    ...intake,
    [dateKey]: {
      source: 'manual',
      kcal: (cur.kcal || 0) + (item.kcal || 0), protein: (cur.protein || 0) + (item.protein || 0),
      fat: (cur.fat || 0) + (item.fat || 0), carb: (cur.carb || 0) + (item.carb || 0),
      items: [...(cur.items || []), { name: item.label || item.name, kcal: item.kcal || 0 }]
    }
  }
}
export function clearDayIntake(intake, dateKey) { const n = { ...intake }; delete n[dateKey]; return n }

// Съедено за день: точный итог (CalAI / фото-дневник) авторитетен; иначе оценка по плану + ручные довески
export function eatenForDay(plan, intake, dateKey) {
  const rec = intake?.[dateKey]
  if (rec?.source === 'calai' || rec?.source === 'photo') return Math.round(rec.kcal || 0)
  const planned = eatenKcal(plan, dateKey)
  const extra = rec?.source === 'manual' ? (rec.kcal || 0) : 0
  return Math.round(planned + extra)
}

// Сводка питания на СЕГОДНЯ для ИИ (статус/снимок/подбор на Главной). Считает ТО ЖЕ, что
// показывает страница «Питание» (динамическая цель: база + тренировка + восстановление +
// перенос со вчера, минус фактически съеденное) — один источник, чтобы ИИ и страница не
// противоречили. hasData=false, если профиль/данные недоступны.
export function nutritionToday() {
  try {
    const profile = loadProfile()
    const base = computeTarget(profile)
    const intake = loadIntake()
    const plan = loadPlan()
    const garmin = loadGarmin()
    const whoop = loadWhoop()
    const today = mskDateKey()
    const burned = workoutKcal(garmin, today, base.bmr)
    const carry = carryFromYesterday(plan, intake, today, base.kcal)
    const target = dynamicTarget(base, profile, { burned, hasGarmin: !!garmin, recovery: whoop?.recovery ?? null, carry })
    const eaten = eatenForDay(plan, intake, today)
    const rec = intake?.[today]
    const tracked = !!rec && (rec.source === 'photo' || rec.source === 'calai' || rec.source === 'manual')
    const macros = tracked
      ? { protein: Math.round(rec.protein || 0), fat: Math.round(rec.fat || 0), carb: Math.round(rec.carb || 0) }
      : { protein: 0, fat: 0, carb: 0 }
    const remaining = Math.max(0, target.kcal - eaten)
    const goalLabel = (GOALS.find(g => g.key === profile.goal) || {}).label || profile.goal
    return { hasData: true, target, eaten, remaining, macros, goalLabel }
  } catch { return { hasData: false } }
}

// Человеческая строка «питание сегодня» для снимков ИИ: цель + СКОЛЬКО УЖЕ СЪЕДЕНО и сколько
// осталось (а не только цель). Именно за счёт «съедено» меняется снимок → ИИ-статус
// перегенерируется при каждом новом логе еды (ключ кэша зависит от снимка).
export function nutritionTodayLine() {
  const n = nutritionToday()
  if (!n.hasData) return 'Данные питания недоступны.'
  const { target, eaten, remaining, macros, goalLabel } = n
  const goal = `Цель «${goalLabel}»: ${target.kcal} ккал/день (белок ${target.protein} г, жиры ${target.fat} г, углеводы ${target.carb} г); в дни тренировок растёт на реальный расход.`
  if (eaten < 30) return `${goal} Сегодня пока ничего не залогировано — впереди вся дневная норма.`
  const needProtein = Math.max(0, target.protein - macros.protein)
  return `${goal} Уже съедено сегодня: ${eaten} ккал (белок ${macros.protein} г, жиры ${macros.fat} г, углеводы ${macros.carb} г). Осталось: ${remaining} ккал${needProtein > 0 ? `, белка добрать ещё ~${needProtein} г` : ''}.`
}

// ── Фото-дневник: записи приёмов за день (фото/штрих-код/этикетка/сохранённое/довесок) ──
// Несколько записей за день суммируются. source:'photo' — авторитетный итог дня.
function rollupEntries(entries) {
  const sum = k => entries.reduce((s, e) => s + (e[k] || 0), 0)
  return {
    source: 'photo',
    kcal: Math.round(sum('kcal')), protein: Math.round(sum('protein')), fat: Math.round(sum('fat')), carb: Math.round(sum('carb')),
    items: entries.map(e => ({ name: e.name, kcal: e.kcal })),   // плоский items — для обратной совместимости
    entries
  }
}
export function addPhotoIntake(intake, dateKey, entry) {
  const cur = intake[dateKey]?.source === 'photo' ? intake[dateKey] : null
  const e = {
    id: entry.id || `e${Date.now()}${Math.round(Math.random() * 1000)}`,
    ts: entry.ts || Date.now(),
    name: entry.name || 'Приём пищи',
    kcal: Math.round(entry.kcal || 0), protein: Math.round(entry.protein || 0), fat: Math.round(entry.fat || 0), carb: Math.round(entry.carb || 0),
    items: entry.items || [], health: entry.health ?? null, grams: entry.grams ?? null, manual: !!entry.manual, hasPhoto: !!entry.hasPhoto,
    fodmap: entry.fodmap ?? null, fodmapReason: entry.fodmapReason || ''
  }
  return { ...intake, [dateKey]: rollupEntries([...((cur?.entries) || []), e]) }
}
export function removePhotoEntry(intake, dateKey, id) {
  const rec = intake[dateKey]
  if (rec?.source !== 'photo') return intake
  const entries = (rec.entries || []).filter(e => e.id !== id)
  if (!entries.length) { const n = { ...intake }; delete n[dateKey]; return n }
  return { ...intake, [dateKey]: rollupEntries(entries) }
}
export function updatePhotoEntry(intake, dateKey, id, patch) {
  const rec = intake[dateKey]
  if (rec?.source !== 'photo') return intake
  const entries = (rec.entries || []).map(e => e.id === id
    ? { ...e, ...patch, kcal: Math.round(patch.kcal ?? e.kcal), protein: Math.round(patch.protein ?? e.protein), fat: Math.round(patch.fat ?? e.fat), carb: Math.round(patch.carb ?? e.carb) }
    : e)
  return { ...intake, [dateKey]: rollupEntries(entries) }
}
// Из КБЖУ на 100 г + граммы → запись приёма (штрих-код/этикетка)
export function gramsToEntry(per100, grams, name) {
  const k = (grams || 0) / 100
  return {
    name: name || per100.name || 'Продукт',
    kcal: Math.round((per100.kcal || 0) * k), protein: Math.round((per100.protein || 0) * k),
    fat: Math.round((per100.fat || 0) * k), carb: Math.round((per100.carb || 0) * k),
    grams: Math.round(grams || 0)
  }
}

// ── Сохранённые блюда: быстрый повтор частых приёмов без новой фотографии (синкается) ──
export const SAVED_DISHES_KEY = 'albert-saved-dishes'
export function loadSavedDishes() { try { const s = localStorage.getItem(SAVED_DISHES_KEY); if (s) return JSON.parse(s) } catch { /* ignore */ } return [] }
export function saveSavedDishes(list) { try { localStorage.setItem(SAVED_DISHES_KEY, JSON.stringify(list)) } catch { /* ignore */ } }
export function addSavedDish(list, dish) {
  const key = String(dish.name || '').trim().toLowerCase()
  if (!key) return list || []
  const without = (list || []).filter(d => String(d.name || '').trim().toLowerCase() !== key)
  return [{ id: dish.id || `s${Date.now()}${Math.round(Math.random() * 1000)}`, name: dish.name, kcal: Math.round(dish.kcal || 0), protein: Math.round(dish.protein || 0), fat: Math.round(dish.fat || 0), carb: Math.round(dish.carb || 0), savedAt: Date.now() }, ...without].slice(0, 30)
}
export function removeSavedDish(list, id) { return (list || []).filter(d => d.id !== id) }

// ── Миниатюры фото-дневника: ОТДЕЛЬНЫЙ ключ, НЕ синкается (большой base64) ──
export const INTAKE_THUMBS_KEY = 'albert-intake-thumbs'
export function loadThumbs() { try { const s = localStorage.getItem(INTAKE_THUMBS_KEY); if (s) return JSON.parse(s) } catch { /* ignore */ } return {} }
export function saveThumbs(o) { try { localStorage.setItem(INTAKE_THUMBS_KEY, JSON.stringify(o)) } catch { /* ignore */ } }
export function setThumb(id, dataUrl) { const o = loadThumbs(); o[id] = dataUrl; saveThumbs(o) }
export function getThumb(id) { return loadThumbs()[id] || null }
// Держим миниатюры только за сегодня+вчера (записи дневника) + миниатюры сохранённых блюд
export function pruneIntakeThumbs(intake, savedDishes = []) {
  const p = n => String(n).padStart(2, '0')
  const y = mskNow(); y.setDate(y.getDate() - 1)
  const yKey = `${y.getFullYear()}-${p(y.getMonth() + 1)}-${p(y.getDate())}`
  const keep = new Set()
  for (const [dateKey, rec] of Object.entries(intake || {})) {
    if (dateKey < yKey) continue
    ;(rec?.entries || []).forEach(e => { if (e.id) keep.add(e.id) })
  }
  ;(savedDishes || []).forEach(d => { if (d.id) keep.add(d.id) })   // сохранённые блюда держат фото долго
  const thumbs = loadThumbs(); let changed = false
  for (const id of Object.keys(thumbs)) { if (!keep.has(id)) { delete thumbs[id]; changed = true } }
  if (changed) saveThumbs(thumbs)
}

// ── Память покупок: что брали раньше, чтобы не было излишков (специи, масло и т.п.) ──
export const PANTRY_KEY = 'albert-pantry'
export function loadPantry() { try { const s = localStorage.getItem(PANTRY_KEY); if (s) return JSON.parse(s) } catch { /* ignore */ } return {} }
export function savePantry(o) { try { localStorage.setItem(PANTRY_KEY, JSON.stringify(o)) } catch { /* ignore */ } }
// Запомнить купленные продукты (имя → дата последней покупки)
export function archivePantry(pantry, items) {
  const today = mskDateKey()
  const next = { ...pantry }
  ;(items || []).forEach(it => { if (it?.name) next[normIng(it.name)] = today })
  return next
}
// Долгоиграющие продукты — их обидно покупать дважды
const LONG_LIFE = /^(масло|мука|сахар|м[её]д|рис|гречк|овсян|орех|изюм|соус|кетчуп|майонез|уксус|крупа|макарон|паста|чай|кофе|какао|соль|специ|приправ)/i
export function recentlyBought(pantry, name, days = 14) {
  const d = pantry?.[normIng(name)]
  if (!d || !LONG_LIFE.test(String(name))) return false
  try { return Math.floor((new Date(mskDateKey()) - new Date(d)) / 86400000) < days } catch { return false }
}
