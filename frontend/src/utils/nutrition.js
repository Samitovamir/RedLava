// Расчёт целевого КБЖУ + хранилища профиля, плана меню, вкусов и списка покупок.
// Цель считаем детерминированно (формула Миффлина-Сан Жеора), ИИ — только подбор блюд.

import { mskNow, mskDateKey } from './time.js'

export const PROFILE_KEY = 'albert-nutrition-profile'
export const SHOPPING_KEY = 'albert-shopping-2'   // v2: копим в базовых единицах, показываем продуктами
export const TASTE_KEY = 'albert-taste'
export const PLAN_KEY = 'albert-meal-plan'

// Профиль по умолчанию (триатлет; реальные цифры владелец поправит)
export const DEFAULT_PROFILE = {
  weight: 75, height: 178, age: 52, sex: 'male',
  activity: 'athlete', goal: 'maintain'
}

export const ACTIVITY_LEVELS = [
  { key: 'low', label: 'Низкая', mult: 1.2, hint: 'почти без движения' },
  { key: 'light', label: 'Лёгкая', mult: 1.375, hint: 'лёгкие тренировки 1–3/нед' },
  { key: 'moderate', label: 'Средняя', mult: 1.55, hint: '3–5 тренировок/нед' },
  { key: 'high', label: 'Высокая', mult: 1.725, hint: '6–7 тренировок/нед' },
  { key: 'athlete', label: 'Спортсмен', mult: 1.9, hint: 'дважды в день / триатлон' }
]

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
  const lvl = ACTIVITY_LEVELS.find(a => a.key === profile.activity) || ACTIVITY_LEVELS[2]
  const goal = GOALS.find(g => g.key === profile.goal) || GOALS[1]
  const tdee = bmr * lvl.mult
  const kcal = Math.round((tdee + goal.delta) / 10) * 10
  // Белок: 2.0 г/кг при наборе, иначе 1.8; жир ~27% ккал; остальное — углеводы
  const protein = Math.round(weight * (profile.goal === 'gain' ? 2.0 : 1.8))
  const fat = Math.round((kcal * 0.27) / 9)
  const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
  return { kcal, protein, fat, carb, bmr: Math.round(bmr), tdee: Math.round(tdee) }
}

// Приёмы пищи: доля от дневной цели + ориентир по времени (для напоминания «оцени блюдо»)
export const MEALS = [
  { key: 'Завтрак', share: 0.3, hour: 9, emoji: '🌅' },
  { key: 'Обед', share: 0.35, hour: 14, emoji: '🍲' },
  { key: 'Перекус', share: 0.1, hour: 17, emoji: '🍎' },
  { key: 'Ужин', share: 0.25, hour: 20, emoji: '🌙' }
]
export const MEAL_KEYS = MEALS.map(m => m.key)

export function mealTarget(dayTarget, share) {
  return {
    kcal: Math.round(dayTarget.kcal * share / 10) * 10,
    protein: Math.round(dayTarget.protein * share),
    fat: Math.round(dayTarget.fat * share),
    carb: Math.round(dayTarget.carb * share)
  }
}

// ── Вкусовые предпочтения ──
export const CUISINES = ['Русская', 'Итальянская', 'Грузинская', 'Японская', 'Средиземноморская', 'Азиатская', 'Мексиканская']

export const DEFAULT_PREFS = {
  spicy: 2, sweet: 4,
  pork: true, beef: true, chicken: true, fish: true, seafood: true, dairy: true, eggs: true, mushrooms: true,
  cuisines: [], cookTime: 'any',  // 'fast' | 'any'
  allergies: '', avoid: '',
  likes: [], dislikes: []          // копятся из обратной связи (названия блюд)
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

// Привести ингредиент рецепта к {name, base, qty в базовой единице}; null = пропустить (кладовка)
export function normalizeIngredient(ing) {
  const name = String(ing.name || '').trim()
  if (!name) return null
  if (PANTRY_RE.test(name)) return null
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
