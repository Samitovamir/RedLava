// Calorie/macro targets plus the stores for the profile, meal plan, tastes and shopping list.
// The target is computed deterministically (Mifflin-St Jeor); the AI only does meal suggestions.

import { mskNow, mskDateKey } from './time.js'

export const PROFILE_KEY = 'albert-nutrition-profile'
export const SHOPPING_KEY = 'albert-shopping-2'   // v2: accumulated in base units, displayed as products
export const TASTE_KEY = 'albert-taste'
export const PLAN_KEY = 'albert-meal-plan'

// The default profile is a NEUTRAL placeholder, not anyone's real data: it used to hold the
// owner's parameters, so every new account inherited his calorie target.
// Until someone fills in their own profile we compute from these averaged numbers and flag
// the result with isPlaceholder, so the UI can honestly say "this is a rough estimate".
// Activity level is not part of it: workouts come from Garmin (real expenditure).
export const DEFAULT_PROFILE = {
  weight: 75, height: 175, age: 35, sex: 'male',
  goal: 'maintain'
}

// Everyday activity multiplier (daily life without sport): resting metabolism × NEAT.
// Workouts themselves are NOT baked in here — they arrive separately from Garmin (real calories).
const NEAT_MULT = 1.35

// How often the person trains — asked in the questionnaire on first sign-in.
// IMPORTANT: this multiplier applies ONLY when Garmin is not connected. With a watch, the real
// workout calories come from it and are added on top (dynamicTarget) — accounting for sport in
// the multiplier as well would count it twice.
export const ACTIVITY_LEVELS = [
  { key: 'none',   mult: 1.20, label: 'Почти не тренируюсь',  labelEn: 'Rarely train' },
  { key: 'light',  mult: 1.35, label: '1–2 раза в неделю',    labelEn: '1–2 times a week' },
  { key: 'medium', mult: 1.50, label: '3–4 раза в неделю',    labelEn: '3–4 times a week' },
  { key: 'high',   mult: 1.65, label: '5 и больше',           labelEn: '5 or more' },
]
// A profile with no activity field (everyone from before the questionnaire) is computed as before — 1.35.
const activityMult = (key) => (ACTIVITY_LEVELS.find(a => a.key === key) || {}).mult || NEAT_MULT

export const GOALS = [
  { key: 'lose', label: 'Снизить вес', delta: -400 },
  { key: 'maintain', label: 'Поддержать', delta: 0 },
  { key: 'gain', label: 'Набрать массу', delta: 300 }
]

// isPlaceholder: the profile has never been filled in — the numbers come from the averaged placeholder.
export function loadProfile() {
  try { const s = localStorage.getItem(PROFILE_KEY); if (s) return { ...DEFAULT_PROFILE, ...JSON.parse(s), isPlaceholder: false } } catch { /* ignore */ }
  return { ...DEFAULT_PROFILE, isPlaceholder: true }
}
export function saveProfile(p) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)) } catch { /* ignore */ } }

// BMR per Mifflin-St Jeor
export function mifflinBMR({ weight, height, age, sex }) {
  return 10 * weight + 6.25 * height - 5 * age + (sex === 'female' ? -161 : 5)
}

// Target calories and macros from the profile (guarding against empty/garbage fields).
// hasGarmin=true → sport will arrive as real calories from the watch, so the baseline uses
// "daily life without sport" (1.35). With no watch, use how often the questionnaire says they train.
export function computeTarget(profile, opts = {}) {
  const { hasGarmin = false } = opts
  const weight = Math.min(250, Math.max(30, +profile.weight || 70))
  const height = Math.min(230, Math.max(120, +profile.height || 170))
  const age = Math.min(100, Math.max(14, +profile.age || 40))
  const sex = profile.sex
  const bmr = mifflinBMR({ weight, height, age, sex })
  const goal = GOALS.find(g => g.key === profile.goal) || GOALS[1]
  const neat = bmr * (hasGarmin ? NEAT_MULT : activityMult(profile.activity))
  const kcal = Math.round((neat + goal.delta) / 10) * 10
  // Protein: 2.0 g/kg when gaining, otherwise 1.8; fat ~27% of kcal; the rest is carbs
  const protein = Math.round(weight * (profile.goal === 'gain' ? 2.0 : 1.8))
  const fat = Math.round((kcal * 0.27) / 9)
  const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
  return { kcal, protein, fat, carb, bmr: Math.round(bmr), neat: Math.round(neat) }
}

// Meals: share of the daily target plus a rough time of day (for the "rate this dish" reminder)
export const MEALS = [
  { key: 'Завтрак', share: 0.3, hour: 9, iconKey: 'meal-breakfast' },
  { key: 'Обед', share: 0.35, hour: 14, iconKey: 'meal-lunch' },
  { key: 'Перекус', share: 0.1, hour: 17, iconKey: 'meal-snack' },
  { key: 'Ужин', share: 0.25, hour: 20, iconKey: 'meal-dinner' }
]
export const MEAL_KEYS = MEALS.map(m => m.key)

// Current meal by time of day (Moscow time). Cutoffs: <11 breakfast, <15:30 lunch, <18:30 snack, otherwise dinner.
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

// ── Dynamic daily target (workouts + recovery + carry-over from yesterday) ──
export function loadGarmin() { try { const s = localStorage.getItem('albert-garmin-live'); if (s) return JSON.parse(s) } catch { /* ignore */ } return null }
export function loadWhoop() { try { const s = localStorage.getItem('albert-whoop-live'); if (s) return JSON.parse(s) } catch { /* ignore */ } return null }

// ACTIVE workout calories for a date (from Garmin), i.e. ON TOP of everyday expenditure.
// Garmin reports the full activity calories (including resting metabolism during the workout),
// so we subtract everyday expenditure for the workout's minutes — otherwise it would be
// counted twice: once in the baseline (BMR × NEAT over all 1440 min of the day), once here.
// IMPORTANT: subtract at the same rate the baseline uses — BMR × NEAT_MULT / 1440, not a
// "bare" BMR/1440, or a remainder of ~(NEAT_MULT−1)×BMR per minute is left behind, which
// inflated the daily target by ~100 kcal per hour of training (the "double-counted calories" bug).
export function workoutKcal(garmin, dateKey, bmr = 0) {
  if (!garmin?.workouts) return 0
  const perMin = bmr > 0 ? (bmr * NEAT_MULT) / 1440 : 0
  return Math.round(
    garmin.workouts
      .filter(w => w.date === dateKey)
      .reduce((s, w) => s + Math.max(0, (w.calories || 0) - perMin * (w.durationMin || 0)), 0)
  )
}

// Roughly how much has already been eaten that day: meals that were rated or whose time has passed
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

// Dynamic target for one specific day.
// Baseline = resting metabolism + daily life (no sport). On top of it we add the real active
// workout expenditure from Garmin IN FULL — no trimming clamps, so a hard day (a long workout
// burning 1500+ kcal) isn't shortchanged. The upper bound only guards against a tracker glitch.
export function dynamicTarget(base, profile, opts = {}) {
  const { burned = 0, hasGarmin = false, recovery = null, carry = 0 } = opts
  const trainDelta = hasGarmin ? Math.max(0, Math.min(3000, Math.round(burned))) : 0
  // Recovery does NOT touch the calories: expenditure is already driven by workouts (burned from
  // Garmin), and cutting food when recovery is poor does harm — the body needs protein and energy
  // to recover. All that's left here is a text hint about strain.
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

// Gentle carry-over from yesterday: overate → a bit less today, undereate → a bit more.
// Based on what was ACTUALLY eaten (intake: photo diary/CalAI/extras), falling back to the plan.
export function carryFromYesterday(plan, intake, dateKey, prevTargetKcal) {
  const prev = new Date(dateKey + 'T00:00:00'); prev.setDate(prev.getDate() - 1)
  const p = n => String(n).padStart(2, '0')
  const prevKey = `${prev.getFullYear()}-${p(prev.getMonth() + 1)}-${p(prev.getDate())}`
  const ate = eatenForDay(plan, intake, prevKey)
  if (ate <= 0) return 0
  return Math.round((prevTargetKcal - ate) * 0.5)
}

// ── Taste preferences ──
export const CUISINES = ['Русская', 'Итальянская', 'Грузинская', 'Японская', 'Средиземноморская', 'Азиатская', 'Мексиканская']

export const DEFAULT_PREFS = {
  spicy: 2, sweet: 4,
  pork: true, beef: true, chicken: true, fish: true, seafood: true, dairy: true, eggs: true, mushrooms: true,
  cuisines: [], cookTime: 'any',  // 'fast' | 'any'
  allergies: '', avoid: '',
  // Low-FODMAP is a THERAPEUTIC diet a doctor prescribes, not a general setting, so it is off
  // by default. It used to be true (one person really had been prescribed it), and every new
  // member ended up with an elimination diet on the home screen and in the AI's advice.
  // Anyone who needs it turns it on with the toggle in the Nutrition section header.
  fodmap: false,
  // regular "extras" that also count toward calories and macros
  coffee: 'no',        // 'no' | 'black' | 'milk' | 'milk_sugar'
  coffeeCups: 1,
  proteinBar: false, proteinShake: false,
  likes: [], dislikes: []          // built up from feedback (dish names)
}

// Quick logging of "extras" (approximate calories and macros per item/cup)
export const QUICK_ADD = [
  { key: 'coffee_milk', label: 'Кофе с молоком', kcal: 60, protein: 3, fat: 3, carb: 5 },
  { key: 'coffee_milk_sugar', label: 'Кофе с молоком и сахаром', kcal: 100, protein: 3, fat: 3, carb: 15 },
  { key: 'coffee_black', label: 'Кофе чёрный', kcal: 5, protein: 0, fat: 0, carb: 1 },
  { key: 'protein_bar', label: 'Протеиновый батончик', kcal: 200, protein: 20, fat: 7, carb: 22 },
  { key: 'protein_shake', label: 'Протеиновый коктейль', kcal: 160, protein: 27, fat: 3, carb: 8 }
]

// FODMAP traffic light: level → label + color (status tokens). null when there is no level.
// The default language is the current UI language. LanguageProvider keeps it in <html lang>,
// and fodmapMeta is called from a dozen places that don't pass lang — so the English UI was
// getting the Russian labels «Высокий/Умеренный/Низкий».
const uiLang = () => {
  try { return document.documentElement.lang === 'en' ? 'en' : 'ru' } catch { return 'ru' }
}
export function fodmapMeta(band, lang = uiLang()) {
  const en = lang === 'en'
  if (band === 'high') return { key: 'high', label: en ? 'High' : 'Высокий', color: 'var(--status-crit)' }
  if (band === 'mod') return { key: 'mod', label: en ? 'Moderate' : 'Умеренный', color: 'var(--status-warn)' }
  if (band === 'low') return { key: 'low', label: en ? 'Low' : 'Низкий', color: 'var(--status-ok)' }
  return null
}

// Rough FODMAP guess from the name/ingredients — for already logged food with no AI label.
const FOD_HIGH = [['чеснок', 'чеснок'], ['лук', 'лук'], ['пшениц', 'пшеница'], ['хлеб', 'хлеб'], ['булк', 'выпечка'], ['паста', 'паста'], ['макарон', 'макароны'], ['блин', 'пшеница (блин)'], ['кесадиль', 'пшеница (кесадилья)'], ['тортиль', 'тортилья'], ['лаваш', 'лаваш'], ['пельмен', 'пшеница'], ['вареник', 'пшеница'], ['фасол', 'бобовые'], ['бобов', 'бобовые'], ['горох', 'горох'], ['чечевиц', 'чечевица'], ['нут', 'нут'], ['молоко', 'лактоза'], ['сливочн', 'сливки'], ['сливк', 'сливки'], ['сметан', 'сметана'], ['сгущ', 'сгущёнка'], ['йогурт', 'лактоза'], ['мороженое', 'лактоза'], ['яблок', 'яблоко'], ['груш', 'груша'], ['манго', 'манго'], ['медов', 'мёд'], ['гриб', 'грибы'], ['спаржа', 'спаржа'], ['цветная капуст', 'цветная капуста']]
const FOD_MOD = [['авокадо', 'авокадо'], ['батат', 'батат'], ['свекл', 'свёкла'], ['кукуруз', 'кукуруза'], ['брокколи', 'брокколи'], ['сельдер', 'сельдерей'], ['вишн', 'вишня'], ['черешн', 'черешня'], ['изюм', 'изюм'], ['кешью', 'кешью'], ['фисташ', 'фисташки']]
// Guess from the NAME only (we skip items — the AI may have invented them and caused false positives, e.g. onion in a beef dish).
function guessFodmap(name) {
  const hay = (name || '').toLowerCase().replace(/ё/g, 'е')
  for (const [k, label] of FOD_HIGH) if (hay.includes(k)) return { band: 'high', reason: label }
  for (const [k, label] of FOD_MOD) if (hay.includes(k)) return { band: 'mod', reason: label }
  return { band: 'low', reason: '' }
}
// FODMAP level of an entry: the AI's label when there is one, otherwise a guess from the name (estimated: true).
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

// Remember the reaction to a dish (from its rating)
export function rememberDish(prefs, name, liked) {
  if (!name) return prefs
  const likes = new Set(prefs.likes || []), dislikes = new Set(prefs.dislikes || [])
  if (liked) { likes.add(name); dislikes.delete(name) } else { dislikes.add(name); likes.delete(name) }
  // keep these from growing without bound
  const trim = arr => [...arr].slice(-30)
  return { ...prefs, likes: trim(likes), dislikes: trim(dislikes) }
}

// ── Multi-day meal plan ──
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

// Days of the current week (Mon–Sun) in Moscow time
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const pad = n => String(n).padStart(2, '0')
const fmtKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function weekDays() {
  const todayKey = mskDateKey()
  const base = new Date(todayKey + 'T00:00:00')
  const dow = (base.getDay() + 6) % 7  // Mon = 0
  const mon = new Date(base); mon.setDate(base.getDate() - dow)
  const out = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon); d.setDate(mon.getDate() + i)
    const key = fmtKey(d)
    out.push({ key, wd: WD[i], day: d.getDate(), month: MONTHS[d.getMonth()], isToday: key === todayKey })
  }
  return out
}

// Total calories already picked for a day
export function dayPlanned(plan, dateKey) {
  const day = plan[dateKey] || {}
  let kcal = 0, count = 0
  MEAL_KEYS.forEach(k => { if (day[k]) { kcal += day[k].kcal || 0; count++ } })
  return { kcal: Math.round(kcal), count }
}

// Find the first dish that is due for a rating (its meal time has passed, no rating yet)
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

// ── Shopping list (builds up over the week; accumulated in base units, shown as products) ──
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

// Pantry staples: already at home, so we don't add them to the shopping list
const PANTRY_RE = /^(соль|перец|вода|специ|приправ|сахар ванил|ванилин)/i

// Unit of measure → [base unit, multiplier]
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

// Canonical names: the same product under different names → one name (so it isn't listed twice).
// Order matters: the narrower rules come before the general ones.
// (\w in JS doesn't match Cyrillic, so we use [а-я]; clean is already lowercased with ё→е)
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
  // no match — keep it as it came, just tidied up (first letter capitalized)
  const t = String(raw || '').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Normalize a recipe ingredient to {name, base, qty in the base unit}; null = skip it (pantry staple)
export function normalizeIngredient(ing) {
  const raw = String(ing.name || '').trim()
  if (!raw) return null
  if (PANTRY_RE.test(raw)) return null
  const name = canonName(raw)
  const rawUnit = String(ing.unit || '').trim().toLowerCase().replace(/\s+/g, '')
  const qty = typeof ing.qty === 'number' ? ing.qty : null
  const m = UNIT_MAP[rawUnit]
  if (qty == null || !m) return { name, base: '', qty: null }  // no number or an unknown unit — just the product
  return { name, base: m[0], qty: qty * m[1] }
}

// Add ingredients to the list, summing matching ones (name + base unit)
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

// How much to BUY: round the accumulated amount up to retail sizes (0.5 l → 1 l and so on)
export function formatProduct(it) {
  const { base, qty } = it
  if (qty == null) return '—'
  if (base === 'ml') {
    const l = Math.ceil(qty / 500) / 2     // 0.5 l steps, 0.5 l minimum
    return ru(l) + ' л'
  }
  if (base === 'pcs') return Math.ceil(qty) + ' шт'
  if (base === 'g') {
    if (qty >= 900) { const kg = Math.ceil(qty / 100) / 10; return ru(kg) + ' кг' }
    return Math.ceil(qty / 100) * 100 + ' г'   // 100 g steps
  }
  return '—'
}

// ── Intake for a day: a CalAI screenshot (exact) or "extras" entered by hand ──
export const INTAKE_KEY = 'albert-intake'
export function loadIntake() { try { const s = localStorage.getItem(INTAKE_KEY); if (s) return JSON.parse(s) } catch { /* ignore */ } return {} }
export function saveIntake(o) { try { localStorage.setItem(INTAKE_KEY, JSON.stringify(o)) } catch { /* ignore */ } }
// Record the day's total from CalAI (authoritative)
export function setCalaiIntake(intake, dateKey, data) {
  return { ...intake, [dateKey]: { source: 'calai', kcal: data.kcal || 0, protein: data.protein || 0, fat: data.fat || 0, carb: data.carb || 0, items: data.items || [] } }
}
// Add an "extra" by hand (coffee, a bar…). If the day is already tracked by the photo diary,
// add it as one of its entries (which get summed); otherwise use the legacy manual mode.
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

// Eaten for the day: an exact total (CalAI / photo diary) wins; otherwise estimate from the plan + manual extras
export function eatenForDay(plan, intake, dateKey) {
  const rec = intake?.[dateKey]
  if (rec?.source === 'calai' || rec?.source === 'photo') return Math.round(rec.kcal || 0)
  const planned = eatenKcal(plan, dateKey)
  const extra = rec?.source === 'manual' ? (rec.kcal || 0) : 0
  return Math.round(planned + extra)
}

// TODAY's nutrition summary for the AI (status/snapshot/meal suggestions on the home screen).
// It computes THE SAME thing the Nutrition page shows (dynamic target: baseline + workout +
// recovery + carry-over from yesterday, minus what was actually eaten) — one source, so the AI
// and the page can't contradict each other. hasData=false when the profile/data is unavailable.
export function nutritionToday() {
  try {
    const profile = loadProfile()
    const intake = loadIntake()
    const plan = loadPlan()
    const garmin = loadGarmin()
    // The baseline depends on whether there's a watch: with one, sport arrives as real
    // calories; without one, we account for it through the questionnaire's activity multiplier.
    const base = computeTarget(profile, { hasGarmin: !!garmin })
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
    // profileIsPlaceholder — the questionnaire hasn't been filled in, so the numbers come from
    // the averaged placeholder. The UI needs this so it doesn't present one as a personal target.
    return { hasData: true, target, eaten, remaining, macros, goalLabel, profileIsPlaceholder: !!profile.isPlaceholder }
  } catch { return { hasData: false } }
}

// Human-readable "nutrition today" line for AI snapshots: the target plus HOW MUCH HAS BEEN
// EATEN and how much is left (not just the target). It's the "eaten" part that changes the
// snapshot → the AI status is regenerated on every new food log (the cache key depends on the snapshot).
export function nutritionTodayLine() {
  const n = nutritionToday()
  if (!n.hasData) return 'Данные питания недоступны.'
  const { target, eaten, remaining, macros, goalLabel } = n
  const goal = `Цель «${goalLabel}»: ${target.kcal} ккал/день (белок ${target.protein} г, жиры ${target.fat} г, углеводы ${target.carb} г); в дни тренировок растёт на реальный расход.`
  if (eaten < 30) return `${goal} Сегодня пока ничего не залогировано — впереди вся дневная норма.`
  const needProtein = Math.max(0, target.protein - macros.protein)
  return `${goal} Уже съедено сегодня: ${eaten} ккал (белок ${macros.protein} г, жиры ${macros.fat} г, углеводы ${macros.carb} г). Осталось: ${remaining} ккал${needProtein > 0 ? `, белка добрать ещё ~${needProtein} г` : ''}.`
}

// ── Photo diary: a day's meal entries (photo/barcode/label/saved dish/extra) ──
// Several entries in one day are summed. source:'photo' is the authoritative day total.
function rollupEntries(entries) {
  const sum = k => entries.reduce((s, e) => s + (e[k] || 0), 0)
  return {
    source: 'photo',
    kcal: Math.round(sum('kcal')), protein: Math.round(sum('protein')), fat: Math.round(sum('fat')), carb: Math.round(sum('carb')),
    items: entries.map(e => ({ name: e.name, kcal: e.kcal })),   // flat items — kept for backwards compatibility
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
// From per-100 g calories and macros + a weight in grams → a meal entry (barcode/label)
export function gramsToEntry(per100, grams, name) {
  const k = (grams || 0) / 100
  return {
    name: name || per100.name || 'Продукт',
    kcal: Math.round((per100.kcal || 0) * k), protein: Math.round((per100.protein || 0) * k),
    fat: Math.round((per100.fat || 0) * k), carb: Math.round((per100.carb || 0) * k),
    grams: Math.round(grams || 0)
  }
}

// ── Saved dishes: repeat a frequent meal quickly without taking a new photo (synced) ──
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

// ── Photo diary thumbnails: a SEPARATE key, NOT synced (large base64) ──
export const INTAKE_THUMBS_KEY = 'albert-intake-thumbs'
export function loadThumbs() { try { const s = localStorage.getItem(INTAKE_THUMBS_KEY); if (s) return JSON.parse(s) } catch { /* ignore */ } return {} }
export function saveThumbs(o) { try { localStorage.setItem(INTAKE_THUMBS_KEY, JSON.stringify(o)) } catch { /* ignore */ } }
export function setThumb(id, dataUrl) { const o = loadThumbs(); o[id] = dataUrl; saveThumbs(o) }
export function getThumb(id) { return loadThumbs()[id] || null }
// Keep thumbnails only for today and yesterday (diary entries), plus those of saved dishes
export function pruneIntakeThumbs(intake, savedDishes = []) {
  const p = n => String(n).padStart(2, '0')
  const y = mskNow(); y.setDate(y.getDate() - 1)
  const yKey = `${y.getFullYear()}-${p(y.getMonth() + 1)}-${p(y.getDate())}`
  const keep = new Set()
  for (const [dateKey, rec] of Object.entries(intake || {})) {
    if (dateKey < yKey) continue
    ;(rec?.entries || []).forEach(e => { if (e.id) keep.add(e.id) })
  }
  ;(savedDishes || []).forEach(d => { if (d.id) keep.add(d.id) })   // saved dishes keep their photos for a long time
  const thumbs = loadThumbs(); let changed = false
  for (const id of Object.keys(thumbs)) { if (!keep.has(id)) { delete thumbs[id]; changed = true } }
  if (changed) saveThumbs(thumbs)
}

// ── Shopping memory: what was bought earlier, to avoid piling up surplus (spices, oil, etc.) ──
export const PANTRY_KEY = 'albert-pantry'
export function loadPantry() { try { const s = localStorage.getItem(PANTRY_KEY); if (s) return JSON.parse(s) } catch { /* ignore */ } return {} }
export function savePantry(o) { try { localStorage.setItem(PANTRY_KEY, JSON.stringify(o)) } catch { /* ignore */ } }
// Remember the products that were bought (name → date of the last purchase)
export function archivePantry(pantry, items) {
  const today = mskDateKey()
  const next = { ...pantry }
  ;(items || []).forEach(it => { if (it?.name) next[normIng(it.name)] = today })
  return next
}
// Long-lasting products — the kind it stings to buy twice
const LONG_LIFE = /^(масло|мука|сахар|м[её]д|рис|гречк|овсян|орех|изюм|соус|кетчуп|майонез|уксус|крупа|макарон|паста|чай|кофе|какао|соль|специ|приправ)/i
export function recentlyBought(pantry, name, days = 14) {
  const d = pantry?.[normIng(name)]
  if (!d || !LONG_LIFE.test(String(name))) return false
  try { return Math.floor((new Date(mskDateKey()) - new Date(d)) / 86400000) < days } catch { return false }
}
