import { useState, useMemo, useRef, useEffect } from 'react'
import { SectionHeader } from '../ui'
import { motion, AnimatePresence } from 'framer-motion'
import { ThumbsUp, ThumbsDown, SlidersHorizontal, Share2 } from 'lucide-react'
import Icon from '../ui/Icon.jsx'
import MicButton from '../components/MicButton.jsx'
import {
  loadProfile, saveProfile, computeTarget, GOALS, ACTIVITY_LEVELS,
  MEALS, MEAL_KEYS, mealTarget, currentMeal,
  loadPrefs, savePrefs, DEFAULT_PREFS, CUISINES, rememberDish,
  loadPlan, savePlan, rateMeal, weekDays, dayPlanned, pendingRating,
  loadGarmin, loadWhoop, workoutKcal, dynamicTarget, carryFromYesterday,
  loadIntake, saveIntake, eatenForDay, fodmapMeta
} from '../utils/nutrition.js'
import { mskDateKey } from '../utils/time.js'
import { useT, useLang } from '../context/LanguageContext.jsx'
import { useLocation } from 'react-router-dom'
import { nutritionHealthBrief } from '../utils/siteSnapshot.js'
import Portal from '../ui/Portal.jsx'
import DiaryTab from '../components/diary/DiaryTab.jsx'
import NutritionSetup from '../components/NutritionSetup.jsx'
import NutritionCoach from '../components/diary/NutritionCoach.jsx'

const FOODS = [
  ['pork', 'Свинина'], ['beef', 'Говядина'], ['chicken', 'Курица'], ['fish', 'Рыба'],
  ['seafood', 'Морепродукты'], ['dairy', 'Молочное'], ['eggs', 'Яйца'], ['mushrooms', 'Грибы']
]

// Line-иконка приёма пищи: ключ иконки берём из MEALS (поле iconKey)
const MEAL_ICON_KEYS = Object.fromEntries(MEALS.map(m => [m.key, m.iconKey]))
function MealIcon({ mealKey, size = 16 }) {
  return <Icon name={MEAL_ICON_KEYS[mealKey] || 'meal-lunch'} size={size} strokeWidth={1.5} />
}

const COMPONENTS = ['Суп', 'Салат', 'Основное', 'Гарнир', 'Напиток', 'Десерт']
const COMPONENT_DEFAULTS = {
  'Завтрак': ['Основное'],
  'Обед': ['Суп', 'Основное'],
  'Перекус': ['Основное'],
  'Ужин': ['Салат', 'Основное', 'Десерт']
}

export default function Nutrition() {
  const t = useT({
    ru: {
      // Заголовок страницы
      title: 'Питание',
      subtitle: 'Фото-дневник · советник · подбор блюд',
      prefsBtn: 'Настроить предпочтения',
      fodmapToggle: 'Индикатор FODMAP',
      fodmapOnMsg: 'Индикатор FODMAP включён',
      fodmapOffMsg: 'Индикатор FODMAP выключен',
      shareRecipe: 'Отправить рецепт',
      recipeCopied: 'Рецепт скопирован — можно переслать домработнице',
      recipeWait: 'Рецепт ещё собирается — подождите пару секунд',
      on: 'ВКЛ', off: 'ВЫКЛ',
      fodmapSection: 'FODMAP-диета',
      fodmapNote: 'Лечебное питание — по назначению врача. При включении ИИ подбирает блюда и рецепты с низким FODMAP и помечает уровень.',
      // Вход в профиль и общая единица
      editProfile: 'Изменить профиль',
      kcal: 'ккал',
      // Профиль
      fWeight: 'Вес, кг', fHeight: 'Рост, см', fAge: 'Возраст', fSex: 'Пол',
      male: 'Мужской', female: 'Женский',
      activity: 'Активность', goal: 'Цель',
      activityGarminNote: 'Garmin подключён — тренировки считаются по реальным калориям с часов, поэтому ответ про частоту на норму не влияет.',
      // Кнопки подбора по приёмам
      mealApprox: '≈',
      picking: 'Подбираю…', pickBtn: 'Подобрать',
      bMacro: 'Б', fMacro: 'Ж', uMacro: 'У',
      // Окно подбора
      pickHead: 'Подбор: ', perMeal: ' ккал на приём',
      close: 'Закрыть',
      inMeal: 'Что в приёме:',
      notePlaceholder: 'Изменить подбор: например «полегче», «без молочного», «другое»',
      pickAgain: 'Подобрать заново',
      more: 'Подробнее →',
      pickingMore: 'Подбираю ещё…', showMore: 'Показать ещё блюда',
      // Детальная карточка / рецепт
      recipeBuilding: 'ИИ собирает рецепт…', recipeUnavailable: 'Рецепт недоступен',
      ingredients: 'Ингредиенты', steps: 'Приготовление',
      photoBy: 'Фото: ',
      // Предпочтения
      prefsTitle: 'Профиль и предпочтения',
      prefsSub: 'Параметры тела и цель задают калории. Вкусы ИИ учитывает при подборе — но со здравым смыслом.',
      profileSection: 'Профиль',
      spicy: 'Острота',
      spicyLow: 'почти не острое', spicyHigh: 'люблю острое', spicyMid: 'умеренно',
      sweet: 'Сладкое',
      sweetLow: 'не люблю', sweetHigh: 'сладкоежка', sweetMid: 'умеренно',
      eats: 'Что ест', yes: 'да', no: 'нет',
      favCuisines: 'Любимые кухни',
      cookTime: 'Время на готовку', cookFast: 'Быстро (до 30 мин)', cookAny: 'Не важно',
      coffee: 'Кофе (тоже считаем в КБЖУ)',
      coffeeNo: 'Не пью', coffeeBlack: 'Чёрный', coffeeMilk: 'С молоком', coffeeMilkSugar: 'С молоком и сахаром',
      cupsPerDay: 'Чашек в день',
      sportNutrition: 'Спортпит',
      proteinBars: 'Протеиновые батончики', proteinShakes: 'Протеиновые коктейли',
      allergies: 'Аллергии (строго исключить)', allergiesPlaceholder: 'Например: орехи, мёд',
      avoid: 'Не люблю', avoidPlaceholder: 'Например: кинза, печень',
      save: 'Сохранить', reset: 'Сбросить',
      // Оценка
      rateHow: ' · как вам было?',
      ratePlaceholder: 'Пара слов (необязательно): что понравилось / что поменять',
      rateUp: 'Понравилось', rateDown: 'Не очень', rateLater: 'Позже',
      // Тосты / сообщения
      noServer: 'Нет связи с сервером. Запустите backend с ключом ИИ.',
      tookTooLong: 'Подбор занял слишком долго. Попробуйте ещё раз.',
      prefsSaved: 'Предпочтения сохранены ✓',
      // Карты значений (RU → подпись), payload остаётся русским
      meals: { 'Завтрак': 'Завтрак', 'Обед': 'Обед', 'Перекус': 'Перекус', 'Ужин': 'Ужин' },
      comps: { 'Суп': 'Суп', 'Салат': 'Салат', 'Основное': 'Основное', 'Гарнир': 'Гарнир', 'Напиток': 'Напиток', 'Десерт': 'Десерт' },
      cuisines: { 'Русская': 'Русская', 'Итальянская': 'Итальянская', 'Грузинская': 'Грузинская', 'Японская': 'Японская', 'Средиземноморская': 'Средиземноморская', 'Азиатская': 'Азиатская', 'Мексиканская': 'Мексиканская' },
      foods: { 'Свинина': 'Свинина', 'Говядина': 'Говядина', 'Курица': 'Курица', 'Рыба': 'Рыба', 'Морепродукты': 'Морепродукты', 'Молочное': 'Молочное', 'Яйца': 'Яйца', 'Грибы': 'Грибы' },
      goals: { 'Снизить вес': 'Снизить вес', 'Поддержать': 'Поддержать', 'Набрать массу': 'Набрать массу' },
      wd: { 'Пн': 'Пн', 'Вт': 'Вт', 'Ср': 'Ср', 'Чт': 'Чт', 'Пт': 'Пт', 'Сб': 'Сб', 'Вс': 'Вс' },
      months: { 'янв': 'янв', 'фев': 'фев', 'мар': 'мар', 'апр': 'апр', 'мая': 'мая', 'июн': 'июн', 'июл': 'июл', 'авг': 'авг', 'сен': 'сен', 'окт': 'окт', 'ноя': 'ноя', 'дек': 'дек' },
    },
    en: {
      title: 'Nutrition',
      subtitle: 'Photo diary · advisor · dish picks',
      prefsBtn: 'Set preferences',
      fodmapToggle: 'FODMAP indicator',
      fodmapOnMsg: 'FODMAP indicator on',
      fodmapOffMsg: 'FODMAP indicator off',
      shareRecipe: 'Share recipe',
      recipeCopied: 'Recipe copied — you can forward it',
      recipeWait: 'Recipe is still building — wait a couple of seconds',
      on: 'ON', off: 'OFF',
      fodmapSection: 'Low-FODMAP diet',
      fodmapNote: 'A medical diet — follow your doctor’s advice. When on, the AI picks low-FODMAP dishes and recipes and marks the level of each.',
      editProfile: 'Edit profile',
      kcal: 'kcal',
      fWeight: 'Weight, kg', fHeight: 'Height, cm', fAge: 'Age', fSex: 'Sex',
      male: 'Male', female: 'Female',
      activity: 'Activity', goal: 'Goal',
      activityGarminNote: 'Garmin is connected — workouts are counted from real watch calories, so this answer doesn’t change your target.',
      mealApprox: '≈',
      picking: 'Picking…', pickBtn: 'Pick',
      bMacro: 'P', fMacro: 'F', uMacro: 'C',
      pickHead: 'Picks: ', perMeal: ' kcal per meal',
      close: 'Close',
      inMeal: 'What’s in the meal:',
      notePlaceholder: 'Adjust the picks: e.g. “lighter”, “no dairy”, “something else”',
      pickAgain: 'Pick again',
      more: 'Details →',
      pickingMore: 'Picking more…', showMore: 'Show more dishes',
      recipeBuilding: 'AI is building the recipe…', recipeUnavailable: 'Recipe unavailable',
      ingredients: 'Ingredients', steps: 'Steps',
      photoBy: 'Photo: ',
      prefsTitle: 'Profile and preferences',
      prefsSub: 'Body metrics and goal set your calories. AI takes tastes into account when picking — within reason.',
      profileSection: 'Profile',
      spicy: 'Spiciness',
      spicyLow: 'barely spicy', spicyHigh: 'love it spicy', spicyMid: 'moderate',
      sweet: 'Sweetness',
      sweetLow: 'don’t like it', sweetHigh: 'sweet tooth', sweetMid: 'moderate',
      eats: 'Eats', yes: 'yes', no: 'no',
      favCuisines: 'Favorite cuisines',
      cookTime: 'Cooking time', cookFast: 'Fast (under 30 min)', cookAny: 'No preference',
      coffee: 'Coffee (counted in macros too)',
      coffeeNo: 'Don’t drink', coffeeBlack: 'Black', coffeeMilk: 'With milk', coffeeMilkSugar: 'With milk and sugar',
      cupsPerDay: 'Cups per day',
      sportNutrition: 'Sports nutrition',
      proteinBars: 'Protein bars', proteinShakes: 'Protein shakes',
      allergies: 'Allergies (strictly exclude)', allergiesPlaceholder: 'e.g. nuts, honey',
      avoid: 'Dislikes', avoidPlaceholder: 'e.g. cilantro, liver',
      save: 'Save', reset: 'Reset',
      rateHow: ' · how was it?',
      ratePlaceholder: 'A few words (optional): what you liked / what to change',
      rateUp: 'Liked it', rateDown: 'Not great', rateLater: 'Later',
      noServer: 'No connection to the server. Start the backend with an AI key.',
      tookTooLong: 'This took too long. Please try again.',
      prefsSaved: 'Preferences saved ✓',
      meals: { 'Завтрак': 'Breakfast', 'Обед': 'Lunch', 'Перекус': 'Snack', 'Ужин': 'Dinner' },
      comps: { 'Суп': 'Soup', 'Салат': 'Salad', 'Основное': 'Main', 'Гарнир': 'Side', 'Напиток': 'Drink', 'Десерт': 'Dessert' },
      cuisines: { 'Русская': 'Russian', 'Итальянская': 'Italian', 'Грузинская': 'Georgian', 'Японская': 'Japanese', 'Средиземноморская': 'Mediterranean', 'Азиатская': 'Asian', 'Мексиканская': 'Mexican' },
      foods: { 'Свинина': 'Pork', 'Говядина': 'Beef', 'Курица': 'Chicken', 'Рыба': 'Fish', 'Морепродукты': 'Seafood', 'Молочное': 'Dairy', 'Яйца': 'Eggs', 'Грибы': 'Mushrooms' },
      goals: { 'Снизить вес': 'Lose weight', 'Поддержать': 'Maintain', 'Набрать массу': 'Gain mass' },
      wd: { 'Пн': 'Mon', 'Вт': 'Tue', 'Ср': 'Wed', 'Чт': 'Thu', 'Пт': 'Fri', 'Сб': 'Sat', 'Вс': 'Sun' },
      months: { 'янв': 'Jan', 'фев': 'Feb', 'мар': 'Mar', 'апр': 'Apr', 'мая': 'May', 'июн': 'Jun', 'июл': 'Jul', 'авг': 'Aug', 'сен': 'Sep', 'окт': 'Oct', 'ноя': 'Nov', 'дек': 'Dec' },
    },
  })
  const { lang } = useLang()
  const [profile, setProfile] = useState(loadProfile)

  // Живые данные Garmin/Whoop (App.jsx кладёт их в localStorage асинхронно — перечитываем чуть позже)
  const [garmin, setGarmin] = useState(loadGarmin)
  const [whoop, setWhoop] = useState(loadWhoop)
  useEffect(() => {
    const t = setTimeout(() => { setGarmin(loadGarmin()); setWhoop(loadWhoop()) }, 2000)
    return () => clearTimeout(t)
  }, [])

  // С часами спорт приходит реальными калориями (dynamicTarget), без часов — учитываем
  // его множителем активности из анкеты, иначе тренировки не попали бы в норму вовсе.
  const base = useMemo(() => computeTarget(profile, { hasGarmin: !!garmin }), [profile, garmin])

  const week = useMemo(() => weekDays(), [])
  const [selectedDay, setSelectedDay] = useState(mskDateKey())
  const [plan, setPlan] = useState(loadPlan)
  const location = useLocation()
  // Раздел «Питание» — единый экран: фото-дневник + советник + подбор блюд (без вкладок).
  // С Главной приходит autoSuggest/openDish → подбираем нужный приём прямо здесь.

  const [prefs, setPrefs] = useState(loadPrefs)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [prefsDraft, setPrefsDraft] = useState(prefs)

  const [mealType, setMealType] = useState(currentMeal)
  const [note, setNote] = useState('')
  const [meals, setMeals] = useState([])
  const [mealsMsg, setMealsMsg] = useState('')
  const [loadingMeals, setLoadingMeals] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [images, setImages] = useState({})              // имя блюда → {url, author, authorUrl, unsplashUrl}
  const [resultsOpen, setResultsOpen] = useState(false) // окно с подобранными блюдами

  // Детальная карточка (рецепт): из подбора (source 'suggest') или из плана ('planned')
  const [detail, setDetail] = useState(null)
  const [detailParts, setDetailParts] = useState([])   // [{component, name, recipe|null}]
  const [detailLoading, setDetailLoading] = useState(false)

  const [intake, setIntake] = useState(loadIntake)
  const [components, setComponents] = useState(['Основное'])
  const weekRef = useRef(null)
  const [toast, setToast] = useState('')

  // Оценка съеденного блюда
  const [rate, setRate] = useState(null)
  const [rateText, setRateText] = useState('')
  const dismissedRate = useRef(new Set())

  const toastTimer = useRef(null)

  useEffect(() => {
    const p = pendingRating(plan)
    if (p && !dismissedRate.current.has(p.dateKey + '|' + p.mealKey)) setRate(p)
    else setRate(null)
  }, [plan])

  // Переход из окна «Питание» на Главной (единый экран раздела):
  //  • state.openDish — тап по конкретному блюду → сразу открываем ЕГО детали (рецепт/«в меню»);
  //  • state.autoSuggest — «другие блюда» → открываем окно подбора СРАЗУ (видна загрузка) и подбираем.
  useEffect(() => {
    const st = location.state
    if (!st) return
    if (st.openDish && MEAL_KEYS.includes(st.mealType)) {
      setMealType(st.mealType)
      if (st.openImage) setImages(prev => ({ ...prev, [st.openDish.name]: st.openImage }))
      openSuggestDetail(st.openDish, st.mealType)
    } else if (st.autoSuggest && MEAL_KEYS.includes(st.autoSuggest)) {
      setMealType(st.autoSuggest)
      setResultsOpen(true)
      suggestMeals(st.autoSuggest, COMPONENT_DEFAULTS[st.autoSuggest] || ['Основное'])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function flash(msg) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2600)
  }

  function updateProfile(field, value) {
    const next = { ...profile, [field]: value }
    setProfile(next); saveProfile(next)
  }

  // Динамическая цель на выбранный день: база + тренировки + восстановление + перенос со вчера
  const isToday = selectedDay === mskDateKey()
  const burned = workoutKcal(garmin, selectedDay, base.bmr)
  const recovery = isToday ? (whoop?.recovery ?? null) : null
  const carry = carryFromYesterday(plan, intake, selectedDay, base.kcal)
  const target = dynamicTarget(base, profile, { burned, hasGarmin: !!garmin, recovery, carry })
  const eaten = eatenForDay(plan, intake, selectedDay)
  const remaining = Math.max(0, target.kcal - eaten)
  const intakeRec = intake[selectedDay] || null

  // Цель на приём с учётом остатка дня: незанятые приёмы делят остаток между собой
  function perMealTarget(mt) {
    const share = MEALS.find(m => m.key === mt)?.share ?? 0.33
    const unchosen = MEALS.filter(m => !plan[selectedDay]?.[m.key])
    const shareSum = unchosen.reduce((s, m) => s + m.share, 0) || 1
    const useRemaining = remaining > 0 && unchosen.some(m => m.key === mt)
    const kcal = useRemaining ? remaining * share / shareSum : mealTarget(target, share).kcal
    const r = target.kcal > 0 ? kcal / target.kcal : share
    return { kcal: Math.round(kcal / 10) * 10, protein: Math.round(target.protein * r), fat: Math.round(target.fat * r), carb: Math.round(target.carb * r) }
  }
  const perMeal = perMealTarget(mealType)
  const sgn = n => (n > 0 ? '+' : '') + n
  const dayInfo = dayPlanned(plan, selectedDay)
  const selDay = week.find(d => d.key === selectedDay)
  const dayLabel = selDay ? `${t.wd[selDay.wd] || selDay.wd}, ${selDay.day} ${t.months[selDay.month] || selDay.month}` : selectedDay

  function selectDay(key) { setSelectedDay(key); setMeals([]); setMealsMsg('') }
  // Клик «＋ Подобрать» в слоте: выбираем приём, подставляем типовой состав и сразу подбираем
  function pickSlot(mealKey) {
    const comps = COMPONENT_DEFAULTS[mealKey] || ['Основное']
    setMealType(mealKey); setComponents(comps); setMeals([]); setMealsMsg('')
    suggestMeals(mealKey, comps)
  }
  function toggleComponent(c) {
    setComponents(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }

  async function suggestMeals(mt = mealType, comps = components) {
    const pm = perMealTarget(mt)
    setLoadingMeals(true); setMeals([]); setMealsMsg('')
    // Таймаут: подбор идёт через LLM и может зависнуть — не оставляем «Подбираю…» навсегда
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 35000)
    try {
      const res = await fetch('/api/nutrition/meals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: pm, mealType: mt, prefs, count: 5, note, components: comps, health: nutritionHealthBrief() }),
        signal: ctrl.signal
      })
      const data = await res.json()
      setMeals(data.meals || [])
      if ((!data.meals || !data.meals.length) && data.message) setMealsMsg(data.message)
      if (data.meals?.length) setResultsOpen(true)
      fetchImages(data.meals || [])
    } catch (e) {
      setMeals([])
      setMealsMsg(e.name === 'AbortError' ? t.tookTooLong : t.noServer)
    } finally {
      clearTimeout(timer)
      setLoadingMeals(false)
    }
  }

  // Фото блюд (Unsplash, кэшируются на сервере по блюду)
  async function fetchImages(list) {
    if (!list.length) return
    try {
      const res = await fetch('/api/nutrition/images', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: list.map(m => ({ name: m.name, query: m.imageQuery || m.name })) })
      })
      const data = await res.json()
      if (data.images) setImages(prev => ({ ...prev, ...data.images }))
    } catch { /* ignore */ }
  }

  // Показать ещё блюда — дополняем список, не теряя текущие
  async function moreMeals() {
    setLoadingMore(true)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 35000)
    try {
      const res = await fetch('/api/nutrition/meals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: perMeal, mealType, prefs, count: 5, note, components, exclude: meals.map(m => m.name), health: nutritionHealthBrief() }),
        signal: ctrl.signal
      })
      const data = await res.json()
      const have = new Set(meals.map(m => m.name.toLowerCase()))
      const fresh = (data.meals || []).filter(m => !have.has(String(m.name).toLowerCase()))
      if (fresh.length) { setMeals(prev => [...prev, ...fresh]); fetchImages(fresh) }
    } catch { /* ignore */ } finally {
      clearTimeout(timer)
      setLoadingMore(false)
    }
  }

  async function fetchRecipe(name) {
    const res = await fetch('/api/nutrition/recipe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dish: name, servings: 1, prefs })
    })
    const data = await res.json()
    return data.recipe || null
  }

  // Части варианта (если комбо — несколько блюд; иначе одно)
  function partsOf(meal) {
    if (meal.parts && meal.parts.length) return meal.parts
    return [{ component: (components[0] || 'Основное'), name: meal.name, kcal: meal.kcal, protein: meal.protein, fat: meal.fat, carb: meal.carb }]
  }
  async function openSuggestDetail(meal, mealKeyOverride) {
    const parts = partsOf(meal)
    setDetail({ meal, mealKey: mealKeyOverride || mealType, dateKey: selectedDay, source: 'suggest' })
    setDetailParts(parts.map(p => ({ component: p.component, name: p.name, recipe: null })))
    setDetailLoading(true)
    for (let i = 0; i < parts.length; i++) {
      const r = await fetchRecipe(parts[i].name)
      setDetailParts(prev => prev.map((x, idx) => idx === i ? { ...x, recipe: r } : x))
    }
    setDetailLoading(false)
  }
  function closeDetail() { setDetail(null); setDetailParts([]) }

  // Оценка ранее выбранного блюда. Сам выбор блюд в меню недели убран из раздела
  // (коммит 32350f0, «упрощение Меню по просьбе»), но у кого меню осталось с тех
  // времён — тому всё ещё есть что оценить.
  function submitRate(liked) {
    const np = rateMeal(plan, rate.dateKey, rate.mealKey, liked ? 'up' : 'down', rateText)
    setPlan(np); savePlan(np)
    const npref = rememberDish(prefs, rate.dish.name, liked)
    setPrefs(npref); savePrefs(npref)
    setRateText('')
    // эффект по plan покажет следующее блюдо к оценке (если есть)
  }
  function laterRate() {
    dismissedRate.current.add(rate.dateKey + '|' + rate.mealKey)
    setRate(null); setRateText('')
  }

  // ── Предпочтения ──
  function openPrefs() { setPrefsDraft(prefs); setPrefsOpen(true) }
  function setDraft(field, value) { setPrefsDraft(d => ({ ...d, [field]: value })) }
  function toggleCuisine(c) {
    setPrefsDraft(d => {
      const has = (d.cuisines || []).includes(c)
      return { ...d, cuisines: has ? d.cuisines.filter(x => x !== c) : [...(d.cuisines || []), c] }
    })
  }
  function savePrefsModal() { savePrefs(prefsDraft); setPrefs(prefsDraft); setPrefsOpen(false); flash(t.prefsSaved) }

  // Быстрый тумблер индикатора FODMAP прямо в шапке (не всем нужен — пользователь просил вынести на видное место)
  function toggleFodmap() {
    const np = { ...prefs, fodmap: !prefs.fodmap }
    setPrefs(np); savePrefs(np)
    flash(np.fodmap ? t.fodmapOnMsg : t.fodmapOffMsg)
  }

  // Собрать рецепт в читаемый текст и отправить (домработнице): системный share-sheet, фолбэк — буфер обмена.
  async function shareRecipe() {
    if (!detail) return
    const parts = detailParts.filter(p => p.recipe)
    if (!parts.length) { flash(t.recipeWait); return }
    const lines = [detail.meal.name.toUpperCase(), '']
    for (const p of parts) {
      if (detailParts.length > 1) lines.push(`— ${p.name} —`)
      const ings = p.recipe.ingredients || []
      if (ings.length) {
        lines.push('Ингредиенты:')
        for (const ing of ings) {
          const qty = ing.qty != null ? ` — ${ing.qty} ${ing.unit || ''}`.trimEnd() : (ing.unit ? ` — ${ing.unit}` : '')
          lines.push(`• ${ing.name}${qty}`)
        }
      }
      const steps = p.recipe.steps || []
      if (steps.length) {
        lines.push('Приготовление:')
        steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`))
      }
      lines.push('')
    }
    const text = lines.join('\n').trim()
    try {
      if (navigator.share) { await navigator.share({ title: detail.meal.name, text }); return }
    } catch { /* пользователь отменил share — падаем в копирование */ }
    try { await navigator.clipboard.writeText(text); flash(t.recipeCopied) }
    catch { flash(t.recipeCopied) }
  }

  // Первый заход: профиль ещё не заполнен — сначала анкета, иначе норма считалась бы
  // по усреднённой заглушке и была бы не про этого человека.
  if (profile.isPlaceholder) {
    return (
      <div className="nu-page">
        <SectionHeader title={t.title} subtitle={t.subtitle} />
        <NutritionSetup
          hasGarmin={!!garmin}
          onDone={next => { const saved = { ...next, isPlaceholder: false }; setProfile(saved); saveProfile(next) }}
        />
      </div>
    )
  }

  return (
    <div className="nu-page">
      <SectionHeader
        title={t.title}
        subtitle={t.subtitle}
      />

      {/* Тумблер индикатора FODMAP на видном месте — не всем нужен (просьба пользователя).
          Рядом — вход в профиль: рост/вес/цель задают норму калорий, и до этого попасть
          можно было только из окна подбора блюд (то есть после ожидания ИИ). */}
      <div className="nu-top-row">
        <button className="nu-prefs-top" onClick={openPrefs}>
          <SlidersHorizontal size={15} strokeWidth={1.5} /> {t.editProfile}
        </button>
        <button className={`nu-fodmap-toggle ${prefs.fodmap ? 'on' : ''}`} onClick={toggleFodmap} aria-pressed={prefs.fodmap}>
          <span className="nu-fodmap-dot" />
          {t.fodmapToggle}
          <b>{prefs.fodmap ? t.on : t.off}</b>
        </button>
      </div>

      {/* Единый экран раздела: фото-дневник → советник → подбор блюд по приёмам */}
      <DiaryTab target={target} eaten={eaten} remaining={remaining} plan={plan} intake={intake} setIntake={setIntake} selectedDay={selectedDay} selectDay={selectDay} week={week} profile={profile} flash={flash} />

      {/* Помощник по питанию: что есть в целом + к ближайшему приёму (по времени, с учётом съеденного) */}
      <NutritionCoach target={target} eaten={eaten} remaining={remaining} intake={intake} selectedDay={selectedDay} />

      {/* Подбор блюда по приёмам (по времени суток) */}
      <motion.div className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="nu-slots">
          {MEALS.map(m => {
            const pm = mealTarget(target, m.share)
            const active = m.key === mealType
            return (
              <div key={m.key} className={`nu-slot ${active ? 'sel' : ''}`}>
                <div className="nu-slot-head">
                  <span className="nu-slot-name"><MealIcon mealKey={m.key} /> {t.meals[m.key] || m.key}</span>
                  <span className="nu-slot-target muted">{t.mealApprox}{pm.kcal} {t.kcal}</span>
                </div>
                <button className="nu-slot-empty" onClick={() => pickSlot(m.key)} disabled={loadingMeals}>
                  {loadingMeals && active ? t.picking : t.pickBtn}
                </button>
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* Если подбор не дал результата — короткое сообщение */}
      {!loadingMeals && mealsMsg && (
        <motion.div className="card nu-msg-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <div className="nu-empty muted">{mealsMsg}</div>
        </motion.div>
      )}

      {/* Окно с подобранными блюдами */}
      <AnimatePresence>
        {resultsOpen && (
          <Portal>
          <div className="nu-backdrop" onClick={() => setResultsOpen(false)}>
            <motion.div className="card nu-results" onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}>
              <div className="nu-modal-head">
                <div>
                  <h3>{t.pickHead}{t.meals[mealType] || mealType}</h3>
                  <div className="nu-modal-sub muted">{dayLabel} · {t.mealApprox}{perMeal.kcal}{t.perMeal}</div>
                </div>
                <button className="nu-close" onClick={() => setResultsOpen(false)} aria-label={t.close}>×</button>
              </div>
              <div className="nu-comp-row">
                <span className="muted nu-comp-lbl">{t.inMeal}</span>
                {COMPONENTS.map(c => (
                  <button key={c} className={`nu-comp ${components.includes(c) ? 'on' : ''}`} onClick={() => toggleComponent(c)}>{t.comps[c] || c}</button>
                ))}
              </div>
              <div className="nu-note-row">
                <input className="nu-note" placeholder={t.notePlaceholder}
                  value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') suggestMeals() }} />
                <MicButton primary onText={txt => setNote(prev => (prev ? prev.trim() + ' ' : '') + txt)} />
                <button className="nu-suggest" onClick={() => suggestMeals()} disabled={loadingMeals}>
                  {loadingMeals ? t.picking : t.pickAgain}
                </button>
              </div>
              <button className="nu-prefs-inline" onClick={openPrefs}><SlidersHorizontal size={15} strokeWidth={1.5} /> {t.prefsBtn}</button>
              <div className="nu-meal-list">
                {loadingMeals && !meals.length && <div className="nu-meals-state muted">{t.picking}</div>}
                {!loadingMeals && !meals.length && mealsMsg && <div className="nu-meals-state muted">{mealsMsg}</div>}
                {meals.map((m, i) => {
                  const combo = m.parts && m.parts.length > 1
                  return (
                    <motion.div key={`${m.name}-${i}`} className="nu-meal-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.03 }}>
                      {images[m.name]?.url && <div className="nu-meal-img" style={{ backgroundImage: `url(${images[m.name].url})` }} />}
                      <div className="nu-meal-name">{m.name}</div>
                      {combo ? (
                        <div className="nu-parts">
                          {m.parts.map((p, k) => (
                            <div key={k} className="nu-part"><span className="nu-part-c muted">{t.comps[p.component] || p.component}</span> {p.name} <span className="muted">· {p.kcal} {t.kcal}</span></div>
                          ))}
                        </div>
                      ) : (m.short && <div className="nu-meal-short muted">{m.short}</div>)}
                      <div className="nu-meal-macros">
                        <span className="nu-meal-kcal">{m.kcal} {t.kcal}</span>
                        <span>{t.bMacro} {m.protein}</span><span>{t.fMacro} {m.fat}</span><span>{t.uMacro} {m.carb}</span>
                      </div>
                      {m.tags?.length > 0 && <div className="nu-tags">{m.tags.map(tag => <span key={tag} className="nu-tag">{tag}</span>)}</div>}
                      {prefs.fodmap && fodmapMeta(m.fodmap) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, flexWrap: 'wrap' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: fodmapMeta(m.fodmap).color, flex: 'none' }} />
                          <b style={{ color: fodmapMeta(m.fodmap).color }}>{fodmapMeta(m.fodmap).label} FODMAP</b>
                          {m.fodmapReason && <span className="muted">· {m.fodmapReason}</span>}
                        </div>
                      )}
                      <div className="nu-card-actions">
                        <button className="nu-recipe-btn" onClick={() => openSuggestDetail(m)}>{t.more}</button>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
              <button className="nu-more" onClick={moreMeals} disabled={loadingMore}>
                {loadingMore ? t.pickingMore : t.showMore}
              </button>
            </motion.div>
          </div>
          </Portal>
        )}
      </AnimatePresence>

      {/* Детальная карточка / рецепт */}
      <AnimatePresence>
        {detail && (
          <Portal>
          <div className="nu-backdrop" onClick={closeDetail}>
            <motion.div className="card nu-modal" onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
              <div className="nu-modal-head">
                <h3>{detail.meal.name}</h3>
                <div className="nu-modal-head-actions">
                  <button className="nu-share-btn" onClick={shareRecipe}>
                    <Share2 size={15} strokeWidth={1.6} /> {t.shareRecipe}
                  </button>
                  <button className="nu-close" onClick={closeDetail} aria-label={t.close}>×</button>
                </div>
              </div>
              <div className="nu-modal-sub muted">{t.meals[detail.mealKey] || detail.mealKey} · {dayLabel}</div>
              {(() => {
                const im = detail.source === 'planned'
                  ? (detail.meal.imageUrl ? { url: detail.meal.imageUrl, author: detail.meal.imageAuthor, authorUrl: detail.meal.imageAuthorUrl, unsplashUrl: detail.meal.imageUnsplash } : null)
                  : images[detail.meal.name]
                if (!im?.url) return null
                return (
                  <div className="nu-modal-img-wrap">
                    <div className="nu-modal-img" style={{ backgroundImage: `url(${im.url})` }} />
                    {im.author && (
                      <div className="nu-credit muted">{t.photoBy}<a href={im.authorUrl} target="_blank" rel="noreferrer">{im.author}</a> · <a href={im.unsplashUrl} target="_blank" rel="noreferrer">Unsplash</a></div>
                    )}
                  </div>
                )
              })()}
              <div className="nu-meal-macros nu-detail-total">
                <span className="nu-meal-kcal">{detail.meal.kcal} {t.kcal}</span>
                <span>{t.bMacro} {detail.meal.protein}</span><span>{t.fMacro} {detail.meal.fat}</span><span>{t.uMacro} {detail.meal.carb}</span>
              </div>
              {detailParts.map((p, pi) => (
                <div key={pi} className="nu-part-sec">
                  {detailParts.length > 1 && <div className="nu-part-head"><span className="nu-part-c muted">{t.comps[p.component] || p.component}</span> {p.name}</div>}
                  {!p.recipe ? (
                    <div className="nu-empty muted">{detailLoading ? t.recipeBuilding : t.recipeUnavailable}</div>
                  ) : (
                    <>
                      <div className="nu-sec-title">{t.ingredients}</div>
                      <div className="nu-ing-list">
                        {(p.recipe.ingredients || []).map((ing, i) => (
                          <div key={i} className="nu-ing">
                            <span>{ing.name}</span>
                            <span className="muted">{ing.qty != null ? `${ing.qty} ${ing.unit || ''}` : (ing.unit || '')}</span>
                          </div>
                        ))}
                      </div>
                      <div className="nu-sec-title">{t.steps}</div>
                      <ol className="nu-steps">
                        {(p.recipe.steps || []).map((s, i) => <li key={i}>{s}</li>)}
                      </ol>
                    </>
                  )}
                </div>
              ))}
            </motion.div>
          </div>
          </Portal>
        )}
      </AnimatePresence>

      {/* Предпочтения */}
      <AnimatePresence>
        {prefsOpen && (
          <Portal>
          <div className="nu-backdrop" onClick={() => setPrefsOpen(false)}>
            <motion.div className="card nu-modal" onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
              <div className="nu-modal-head">
                <h3>{t.prefsTitle}</h3>
                <button className="nu-close" onClick={() => setPrefsOpen(false)} aria-label={t.close}>×</button>
              </div>
              <div className="nu-modal-sub muted">{t.prefsSub}</div>

              <div className="nu-sec-title">{t.profileSection}</div>
              <div className="nu-fields">
                <label className="nu-field"><span>{t.fWeight}</span>
                  <input type="number" value={profile.weight} onChange={e => updateProfile('weight', +e.target.value || 0)} /></label>
                <label className="nu-field"><span>{t.fHeight}</span>
                  <input type="number" value={profile.height} onChange={e => updateProfile('height', +e.target.value || 0)} /></label>
                <label className="nu-field"><span>{t.fAge}</span>
                  <input type="number" value={profile.age} onChange={e => updateProfile('age', +e.target.value || 0)} /></label>
                <label className="nu-field"><span>{t.fSex}</span>
                  <select value={profile.sex} onChange={e => updateProfile('sex', e.target.value)}>
                    <option value="male">{t.male}</option><option value="female">{t.female}</option>
                  </select></label>
              </div>
              <div className="nu-seg-row">
                <span className="nu-seg-lbl muted">{t.goal}</span>
                <div className="nu-seg">
                  {GOALS.map(g => (
                    <button key={g.key} className={`nu-seg-btn ${profile.goal === g.key ? 'active' : ''}`}
                      onClick={() => updateProfile('goal', g.key)}>{t.goals[g.label] || g.label}</button>
                  ))}
                </div>
              </div>
              {/* Сколько тренируется — влияет на норму только без Garmin (с часами спорт
                  приходит реальными калориями, иначе посчитали бы его дважды). */}
              <div className="nu-seg-row">
                <span className="nu-seg-lbl muted">{t.activity}</span>
                <div className="nu-seg">
                  {ACTIVITY_LEVELS.map(a => (
                    <button key={a.key} className={`nu-seg-btn ${(profile.activity || 'light') === a.key ? 'active' : ''}`}
                      onClick={() => updateProfile('activity', a.key)}>{lang === 'en' ? a.labelEn : a.label}</button>
                  ))}
                </div>
              </div>
              {!!garmin && <div className="nu-modal-sub muted">{t.activityGarminNote}</div>}

              <div className="nu-sec-title">{t.spicy}</div>
              <div className="nu-slider-row">
                <input type="range" min="0" max="10" value={prefsDraft.spicy} onChange={e => setDraft('spicy', +e.target.value)} />
                <span className="nu-slider-val">{prefsDraft.spicy <= 2 ? t.spicyLow : prefsDraft.spicy >= 7 ? t.spicyHigh : t.spicyMid} · {prefsDraft.spicy}/10</span>
              </div>
              <div className="nu-sec-title">{t.sweet}</div>
              <div className="nu-slider-row">
                <input type="range" min="0" max="10" value={prefsDraft.sweet} onChange={e => setDraft('sweet', +e.target.value)} />
                <span className="nu-slider-val">{prefsDraft.sweet <= 2 ? t.sweetLow : prefsDraft.sweet >= 7 ? t.sweetHigh : t.sweetMid} · {prefsDraft.sweet}/10</span>
              </div>

              <div className="nu-sec-title">{t.eats}</div>
              <div className="nu-foods">
                {FOODS.map(([key, label]) => (
                  <button key={key} className={`nu-food ${prefsDraft[key] ? 'yes' : 'no'}`} onClick={() => setDraft(key, !prefsDraft[key])}>
                    {t.foods[label] || label} <b>{prefsDraft[key] ? t.yes : t.no}</b>
                  </button>
                ))}
              </div>

              <div className="nu-sec-title">{t.favCuisines}</div>
              <div className="nu-foods">
                {CUISINES.map(c => (
                  <button key={c} className={`nu-chip ${(prefsDraft.cuisines || []).includes(c) ? 'on' : ''}`} onClick={() => toggleCuisine(c)}>{t.cuisines[c] || c}</button>
                ))}
              </div>

              <div className="nu-sec-title">{t.cookTime}</div>
              <div className="nu-seg">
                <button className={`nu-seg-btn ${prefsDraft.cookTime === 'fast' ? 'active' : ''}`} onClick={() => setDraft('cookTime', 'fast')}>{t.cookFast}</button>
                <button className={`nu-seg-btn ${prefsDraft.cookTime === 'any' ? 'active' : ''}`} onClick={() => setDraft('cookTime', 'any')}>{t.cookAny}</button>
              </div>

              <div className="nu-sec-title">{t.coffee}</div>
              <div className="nu-seg">
                {[['no', t.coffeeNo], ['black', t.coffeeBlack], ['milk', t.coffeeMilk], ['milk_sugar', t.coffeeMilkSugar]].map(([k, l]) => (
                  <button key={k} className={`nu-seg-btn ${prefsDraft.coffee === k ? 'active' : ''}`} onClick={() => setDraft('coffee', k)}>{l}</button>
                ))}
              </div>
              {prefsDraft.coffee !== 'no' && (
                <div className="nu-slider-row" style={{ marginTop: 8 }}>
                  <span className="muted" style={{ fontSize: 13 }}>{t.cupsPerDay}</span>
                  <input type="range" min="1" max="6" value={prefsDraft.coffeeCups || 1} onChange={e => setDraft('coffeeCups', +e.target.value)} />
                  <span className="nu-slider-val">{prefsDraft.coffeeCups || 1}</span>
                </div>
              )}
              <div className="nu-sec-title">{t.sportNutrition}</div>
              <div className="nu-foods">
                <button className={`nu-food ${prefsDraft.proteinBar ? 'yes' : 'no'}`} onClick={() => setDraft('proteinBar', !prefsDraft.proteinBar)}>{t.proteinBars} <b>{prefsDraft.proteinBar ? t.yes : t.no}</b></button>
                <button className={`nu-food ${prefsDraft.proteinShake ? 'yes' : 'no'}`} onClick={() => setDraft('proteinShake', !prefsDraft.proteinShake)}>{t.proteinShakes} <b>{prefsDraft.proteinShake ? t.yes : t.no}</b></button>
              </div>

              <div className="nu-sec-title">{t.allergies}</div>
              <input className="nu-note" placeholder={t.allergiesPlaceholder} value={prefsDraft.allergies} onChange={e => setDraft('allergies', e.target.value)} />
              <div className="nu-sec-title">{t.avoid}</div>
              <input className="nu-note" placeholder={t.avoidPlaceholder} value={prefsDraft.avoid} onChange={e => setDraft('avoid', e.target.value)} />

              <div className="nu-sec-title">{t.fodmapSection}</div>
              <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: -4, marginBottom: 8 }}>
                {t.fodmapNote}
              </div>
              <div className="nu-foods">
                <button className={`nu-food ${prefsDraft.fodmap ? 'yes' : 'no'}`} onClick={() => setDraft('fodmap', !prefsDraft.fodmap)}>
                  Low-FODMAP <b>{prefsDraft.fodmap ? t.on : t.off}</b>
                </button>
              </div>

              <div className="nu-modal-actions">
                <button className="nu-suggest" onClick={savePrefsModal}>{t.save}</button>
                <button className="nu-edit" onClick={() => setPrefsDraft({ ...DEFAULT_PREFS, likes: prefs.likes, dislikes: prefs.dislikes })}>{t.reset}</button>
              </div>
            </motion.div>
          </div>
          </Portal>
        )}
      </AnimatePresence>

      {/* Оценка съеденного блюда */}
      <AnimatePresence>
        {rate && (
          <Portal>
          <div className="nu-backdrop">
            <motion.div className="card nu-rate" onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
              <div className="nu-rate-meal muted">{t.meals[rate.mealKey] || rate.mealKey}{t.rateHow}</div>
              <h3>{rate.dish.name}</h3>
              <textarea className="nu-note nu-rate-text" rows={2} placeholder={t.ratePlaceholder}
                value={rateText} onChange={e => setRateText(e.target.value)} />
              <div className="nu-rate-btns">
                <button className="nu-rate-up" onClick={() => submitRate(true)}><ThumbsUp size={16} strokeWidth={1.5} />{t.rateUp}</button>
                <button className="nu-rate-down" onClick={() => submitRate(false)}><ThumbsDown size={16} strokeWidth={1.5} />{t.rateDown}</button>
              </div>
              <button className="nu-rate-later" onClick={laterRate}>{t.rateLater}</button>
            </motion.div>
          </div>
          </Portal>
        )}
      </AnimatePresence>

      {/* Тост */}
      <AnimatePresence>
        {toast && (
          <motion.div className="nu-toast" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>{toast}</motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .nu-page { display: flex; flex-direction: column; gap: 18px; max-width: 1400px; padding-bottom: 24px; }
        .muted { color: var(--muted); }
        .card-title { font-size: 16px; font-weight: 700; color: var(--foreground); margin-bottom: 12px; }
        /* Зазор ≥8px от фиксированной плашки «Демо-режим» (top:14px, bottom ≈46px от вьюпорта) */
        .nu-edit { padding: 7px 13px; border-radius: var(--radius-sm); border: 1px solid var(--border-med); background: transparent; color: var(--text-secondary); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
        .nu-edit:hover { color: var(--text-primary); border-color: var(--accent); }
        /* KPI: главная «ккал» крупно, макросы Б/Ж/У — подчинённая группа, числа в --foreground */
        /* Метаболика: микрометрики лейбл/значение + вывод в чип */
        .nu-fields { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 12px; }
        .nu-field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--text-muted); }
        .nu-field input, .nu-field select { background: var(--bg-tile); border: 1px solid var(--border-med); border-radius: var(--radius-sm); padding: 10px 12px; font-family: inherit; font-size: 14px; color: var(--foreground); outline: none; }
        .nu-field input:focus, .nu-field select:focus { border-color: var(--accent); }
        .nu-seg-row { display: flex; align-items: center; gap: 12px; margin-top: 14px; flex-wrap: wrap; }
        .nu-seg-lbl { font-size: 12px; min-width: 80px; }
        .nu-seg { display: inline-flex; flex-wrap: wrap; gap: 4px; background: var(--bg-tile); padding: 4px; border-radius: var(--radius-md); }
        .nu-seg-btn { padding: 8px 13px; border: none; background: transparent; color: var(--text-secondary); font-family: inherit; font-size: 13px; font-weight: 600; border-radius: 9px; cursor: pointer; transition: all .15s; }
        .nu-seg-btn:hover { color: var(--text-primary); }
        .nu-seg-btn.active { background: var(--bg-surface); color: var(--accent); box-shadow: var(--shadow-btn); }
        /* Учёт съеденного */
        /* Состав приёма (комбо) */
        .nu-comp-row { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
        .nu-comp-lbl { font-size: 13px; margin-right: 2px; }
        .nu-comp { padding: 7px 12px; border-radius: 18px; border: 1px solid var(--border-med); background: var(--bg-tile); color: var(--text-secondary); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
        .nu-comp.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
        .nu-parts { display: flex; flex-direction: column; gap: 4px; }
        .nu-part { font-size: 13.5px; color: var(--text-body); line-height: 1.4; }
        .nu-part-c { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; margin-right: 4px; }
        .nu-part-sec { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--border-soft); padding-top: 12px; margin-top: 4px; }
        .nu-part-sec:first-of-type { border-top: none; padding-top: 0; }
        .nu-part-head { font-size: 15px; font-weight: 700; color: var(--foreground); }
        .nu-detail-total { padding: 4px 0; }
        /* Неделя — единственный «сильный» акцент: активный день */
        .nu-slots { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        /* Базовая рамка у всех слотов одинаковая; у выбранного меняем ТОЛЬКО цвет границы (мягкий акцент — день уже несёт сильный) */
        .nu-slot { display: flex; flex-direction: column; gap: 10px; background: var(--bg-tile); border: 1px solid var(--border-soft); border-radius: var(--radius-md); padding: 14px; min-height: 120px; transition: border-color .15s; }
        .nu-slot.sel { border-color: color-mix(in srgb, var(--accent) 55%, var(--border-med)); }
        .nu-slot-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .nu-slot-name { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 700; color: var(--foreground); }
        .nu-slot-name svg { color: var(--text-muted); flex-shrink: 0; }
        .nu-slot.sel .nu-slot-name svg { color: var(--accent); }
        .nu-slot-target { font-size: 12px; white-space: nowrap; }
        /* «Подобрать» — ghost: без рамки (не конфликтует со сплошной рамкой карточки), заливка-подложка */
        .nu-slot-empty { flex: 1; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--accent) 7%, transparent); border: none; border-radius: var(--radius-sm); color: var(--accent); font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: all .15s; }
        .nu-slot-empty:hover { background: color-mix(in srgb, var(--accent) 14%, transparent); }
        .nu-slot-empty:disabled { opacity: .55; cursor: default; }
        .nu-note-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .nu-note { flex: 1; width: 100%; background: var(--bg-tile); border: 1px solid var(--border-med); border-radius: var(--radius-md); padding: 12px 14px; font-family: inherit; font-size: 14px; color: var(--foreground); outline: none; }
        .nu-note:focus { border-color: var(--accent); }
        .nu-note::placeholder { color: var(--text-faint); }
        .nu-suggest { flex-shrink: 0; display: inline-flex; align-items: center; gap: 7px; padding: 12px 18px; border-radius: var(--radius-md); border: none; background: linear-gradient(var(--accent-btn-top), var(--accent-btn-bot)); color: var(--on-accent); font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: var(--shadow-btn); transition: opacity .15s; }
        .nu-suggest:hover:not(:disabled) { opacity: .92; }
        .nu-suggest:disabled { opacity: .5; cursor: default; }
        .nu-meal-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
        .nu-meals-state { grid-column: 1 / -1; padding: 28px 8px; text-align: center; font-size: 14.5px; }
        .nu-meal-card { display: flex; flex-direction: column; gap: 8px; background: var(--bg-tile); border: 1px solid var(--border-soft); border-radius: var(--radius-md); padding: 16px; }
        .nu-meal-img { height: 150px; margin: -16px -16px 4px; border-radius: var(--radius-md) var(--radius-md) 0 0; background-size: cover; background-position: center; background-color: var(--bg-surface); }
        .nu-meal-name { font-size: 15.5px; font-weight: 700; color: var(--foreground); }
        .nu-meal-short { font-size: 14px; line-height: 1.55; color: var(--text-secondary); }
        .nu-meal-macros { display: flex; flex-wrap: wrap; gap: 12px; font-size: 14px; color: var(--text-secondary); font-weight: 600; }
        .nu-meal-kcal { color: var(--foreground); }
        .nu-tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .nu-tag { font-size: 11px; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); padding: 3px 9px; border-radius: 20px; }
        .nu-card-actions { display: flex; align-items: center; gap: 12px; margin-top: 6px; }
        .nu-recipe-btn { align-self: flex-start; background: transparent; border: none; color: var(--accent); font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; padding: 0; }
        .nu-recipe-btn:hover { text-decoration: underline; }
        .nu-more { margin-top: 16px; width: 100%; padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-med); background: var(--bg-tile); color: var(--text-secondary); font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; transition: all .15s; }
        .nu-more:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .nu-more:disabled { opacity: .5; cursor: default; }
        .nu-empty { font-size: 14px; padding: 6px 0; line-height: 1.5; }
        .nu-results { width: 100%; max-width: 920px; max-height: 88vh; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
        /* Прошивка (.card::after, inset:7px absolute) на скролл-окнах считает рамку по ВСЕЙ высоте
           контента, а не по видимой области — дашед-строчка «разъезжается» и режет карточки.
           На скроллящихся модалках подбора/рецепта/оценки убираем её (рамка и градиент остаются). */
        .nu-results::after, .nu-modal::after, .nu-rate::after { display: none; }
        /* Пустой список покупок — центрированный empty-state */
        .nu-backdrop { position: fixed; inset: 0; background: var(--scrim); backdrop-filter: blur(3px); z-index: 500; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .nu-modal { width: 100%; max-width: 560px; max-height: 88vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
        .nu-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .nu-modal-head h3 { font-size: 19px; font-weight: 700; color: var(--foreground); margin: 0; }
        .nu-modal-head-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .nu-share-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-med); background: var(--bg-tile); color: var(--text-secondary); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: color .15s, border-color .15s; }
        .nu-share-btn:hover { color: var(--accent); border-color: var(--accent); }
        /* Тумблер индикатора FODMAP в шапке страницы */
        .nu-top-row { display: flex; justify-content: flex-end; align-items: center; gap: 10px; flex-wrap: wrap; margin: -4px 0 14px; }
        .nu-prefs-top { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--border-med); background: var(--bg-tile); color: var(--text-secondary); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: color .15s, border-color .15s; }
        .nu-prefs-top:hover { color: var(--text-primary); border-color: var(--accent); }
        .nu-fodmap-toggle { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--border-med); background: var(--bg-tile); color: var(--text-secondary); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: color .15s, border-color .15s, background .15s; }
        .nu-fodmap-toggle b { color: var(--text-muted); font-weight: 700; letter-spacing: .02em; }
        .nu-fodmap-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-faint); flex: none; transition: background .15s; }
        .nu-fodmap-toggle.on { color: var(--text-primary); border-color: var(--accent); }
        .nu-fodmap-toggle.on b { color: var(--accent); }
        .nu-fodmap-toggle.on .nu-fodmap-dot { background: var(--accent); }
        .nu-modal-sub { font-size: 13px; margin-top: 3px; }
        .nu-prefs-inline { align-self: flex-start; display: inline-flex; align-items: center; gap: 7px; padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-med); background: var(--bg-tile); color: var(--text-secondary); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: color .15s, border-color .15s; }
        .nu-prefs-inline:hover { color: var(--text-primary); border-color: var(--accent); }
        .nu-modal-img-wrap { display: flex; flex-direction: column; gap: 5px; }
        .nu-modal-img { height: 200px; border-radius: var(--radius-md); background-size: cover; background-position: center; background-color: var(--bg-tile); }
        .nu-credit { font-size: 11.5px; }
        .nu-credit a { color: var(--text-muted); text-decoration: underline; }
        .nu-credit a:hover { color: var(--foreground); }
        .nu-close { width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1px solid var(--border-med); background: transparent; color: var(--text-muted); font-size: 20px; line-height: 1; cursor: pointer; flex-shrink: 0; }
        .nu-close:hover { color: var(--foreground); }
        /* ── Мобайл: окна Питания (подбор блюда / деталь / предпочтения) —
           bottom-sheet, как окна тренировки и события (дизайн-система) ── */
        @media (max-width: 640px) {
          .nu-backdrop { align-items: flex-end; padding: 0; }
          .nu-results, .nu-modal, .nu-rate {
            width: 100%; max-width: 100%; max-height: 94dvh;
            border-radius: var(--radius) var(--radius) 0 0; border-bottom: none;
            padding-bottom: max(20px, env(safe-area-inset-bottom));
          }
          .nu-results::after, .nu-modal::after, .nu-rate::after { border-radius: calc(var(--radius) - 6px) calc(var(--radius) - 6px) 0 0; }
          .nu-close { width: 40px; height: 40px; }
        }
        .nu-sec-title { font-size: 13px; font-weight: 700; color: var(--foreground); text-transform: uppercase; letter-spacing: .05em; margin-top: 6px; }
        .nu-ing-list { display: flex; flex-direction: column; }
        .nu-ing { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--border-soft); font-size: 15px; color: var(--foreground); }
        .nu-ing:last-child { border-bottom: none; }
        .nu-ing .muted { color: var(--text-muted); }
        .nu-steps { display: flex; flex-direction: column; gap: 9px; padding-left: 20px; font-size: 15.5px; line-height: 1.6; color: var(--text-body); }
        .nu-modal-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
        /* Слайдеры предпочтений */
        .nu-slider-row { display: flex; align-items: center; gap: 14px; }
        .nu-slider-row input[type=range] { flex: 1; accent-color: var(--accent); height: 4px; }
        .nu-slider-val { font-size: 13px; color: var(--text-secondary); min-width: 130px; text-align: right; }
        .nu-foods { display: flex; flex-wrap: wrap; gap: 8px; }
        .nu-food { padding: 9px 13px; border-radius: var(--radius-sm); border: 1px solid var(--border-med); background: var(--bg-tile); color: var(--text-body); font-family: inherit; font-size: 13.5px; cursor: pointer; transition: all .15s; }
        .nu-food b { font-weight: 700; margin-left: 4px; }
        .nu-food.yes { border-color: color-mix(in srgb, var(--status-ok) 50%, transparent); }
        .nu-food.yes b { color: var(--status-ok); }
        .nu-food.no { opacity: .6; }
        .nu-food.no b { color: var(--status-crit); }
        .nu-chip { padding: 8px 13px; border-radius: 20px; border: 1px solid var(--border-med); background: var(--bg-tile); color: var(--text-secondary); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
        .nu-chip.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
        /* Оценка */
        .nu-rate { width: 100%; max-width: 440px; display: flex; flex-direction: column; gap: 12px; text-align: center; }
        .nu-rate-meal { font-size: 13px; }
        .nu-rate h3 { font-size: 20px; font-weight: 700; color: var(--foreground); }
        .nu-rate-text { width: 100%; resize: none; text-align: left; }
        .nu-rate-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .nu-rate-up, .nu-rate-down { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 13px; border-radius: var(--radius-md); border: 1px solid var(--border-med); background: var(--bg-tile); color: var(--text-body); font-family: inherit; font-size: 14.5px; font-weight: 700; cursor: pointer; transition: all .15s; }
        .nu-rate-up:hover { border-color: var(--status-ok); color: var(--status-ok); background: color-mix(in srgb, var(--status-ok) 16%, transparent); }
        .nu-rate-down:hover { border-color: var(--status-warn); color: var(--status-warn); background: color-mix(in srgb, var(--status-warn) 16%, transparent); }
        .nu-rate-later { background: transparent; border: none; color: var(--text-muted); font-family: inherit; font-size: 13px; cursor: pointer; padding: 4px; }
        .nu-rate-later:hover { color: var(--foreground); }
        .nu-toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); z-index: 600; background: var(--bg-surface); border: 1px solid var(--accent); color: var(--foreground); padding: 13px 20px; border-radius: var(--radius-md); font-size: 14px; font-weight: 600; box-shadow: var(--shadow-card); }
        @media (max-width: 900px) {
          .nu-fields { grid-template-columns: repeat(2, 1fr); }
          .nu-slots { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  )
}
