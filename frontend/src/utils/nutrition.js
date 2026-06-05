// Расчёт целевого КБЖУ + хранилища профиля, списка покупок и вкусов.
// Цель считаем детерминированно (формула Миффлина-Сан Жеора), ИИ — только подбор блюд.

import { mskDateKey } from './time.js'

export const PROFILE_KEY = 'albert-nutrition-profile'
export const SHOPPING_KEY = 'albert-shopping'
export const TASTE_KEY = 'albert-taste'

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

// Доля приёма пищи от дневной цели
export const MEAL_SHARES = [
  { key: 'Завтрак', share: 0.3 },
  { key: 'Обед', share: 0.35 },
  { key: 'Ужин', share: 0.25 },
  { key: 'Перекус', share: 0.1 }
]
export function mealTarget(dayTarget, share) {
  return {
    kcal: Math.round(dayTarget.kcal * share / 10) * 10,
    protein: Math.round(dayTarget.protein * share),
    fat: Math.round(dayTarget.fat * share),
    carb: Math.round(dayTarget.carb * share)
  }
}

// ── Вкусы ──
export function loadTaste() {
  try { const s = localStorage.getItem(TASTE_KEY); if (s) return JSON.parse(s) } catch { /* ignore */ }
  return { likes: [], dislikes: [] }
}
export function saveTaste(t) { try { localStorage.setItem(TASTE_KEY, JSON.stringify(t)) } catch { /* ignore */ } }

// ── Список покупок (копится за неделю) ──
const daysSince = iso => { try { return Math.floor((new Date(mskDateKey()) - new Date(iso)) / 86400000) } catch { return 0 } }
export function loadShopping() {
  try {
    const s = localStorage.getItem(SHOPPING_KEY)
    if (s) {
      const list = JSON.parse(s)
      // Новая неделя (прошло ≥7 дней) — начинаем список заново
      if (!list.weekStart || daysSince(list.weekStart) >= 7) return { weekStart: mskDateKey(), items: [] }
      return list
    }
  } catch { /* ignore */ }
  return { weekStart: mskDateKey(), items: [] }  // items: [{name, qty, unit, from}]
}
export function saveShopping(list) { try { localStorage.setItem(SHOPPING_KEY, JSON.stringify(list)) } catch { /* ignore */ } }

const normIng = s => String(s || '').trim().toLowerCase()
// Добавить ингредиенты, суммируя одинаковые (имя+единица)
export function addToShopping(list, ingredients, from) {
  const items = [...list.items]
  ingredients.forEach(ing => {
    const name = String(ing.name || '').trim()
    if (!name) return
    const unit = ing.unit || ''
    const qty = typeof ing.qty === 'number' ? ing.qty : null
    const i = items.findIndex(x => normIng(x.name) === normIng(name) && (x.unit || '') === unit)
    if (i === -1) {
      items.push({ name, qty, unit, from: from || '' })
    } else if (qty != null) {
      // суммируем числа; если у существующего количества не было — берём новое
      items[i] = { ...items[i], qty: (typeof items[i].qty === 'number' ? items[i].qty : 0) + qty }
    }
    // qty == null и совпадение есть — оставляем существующее (без дублей)
  })
  return { ...list, items }
}
