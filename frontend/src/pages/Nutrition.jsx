import { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Camera, Footprints, BedDouble, RotateCcw,
  ThumbsUp, ThumbsDown, ShoppingCart, SlidersHorizontal
} from 'lucide-react'
import Icon from '../ui/Icon.jsx'
import MicButton from '../components/MicButton.jsx'
import {
  loadProfile, saveProfile, computeTarget, GOALS,
  MEALS, MEAL_KEYS, mealTarget,
  loadPrefs, savePrefs, DEFAULT_PREFS, CUISINES, rememberDish,
  loadPlan, savePlan, setPlanMeal, clearPlanMeal, rateMeal, weekDays, dayPlanned, pendingRating,
  loadShopping, saveShopping, addToShopping, formatProduct,
  loadGarmin, loadWhoop, workoutKcal, eatenKcal, dynamicTarget, carryFromYesterday,
  QUICK_ADD, loadIntake, saveIntake, setCalaiIntake, addIntakeExtra, clearDayIntake, eatenForDay,
  loadPantry, savePantry, archivePantry, recentlyBought
} from '../utils/nutrition.js'
import { mskDateKey } from '../utils/time.js'
import { useT } from '../context/LanguageContext.jsx'

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
      subtitle: 'Меню на неделю · подбор под цель · покупки',
      prefsBtn: 'Настроить предпочтения',
      // Карточка цели
      goalFor: 'Цель на',
      today: 'сегодня',
      editProfile: 'Изменить профиль',
      done: 'Готово',
      kcal: 'ккал',
      g: 'г',
      mCalories: 'Калории', mProtein: 'Белки', mFat: 'Жиры', mCarbs: 'Углеводы',
      // Разбивка цели
      bdBase: 'База',
      bdTraining: 'тренировка', bdRestDay: 'день отдыха',
      bdRecovery: 'восстановление',
      bdCarry: 'со вчера',
      bdNoGarmin: 'Garmin не подключён — цель без учёта тренировок',
      // Прогресс
      eaten: 'Съедено ~', remaining: 'осталось ~',
      fromCalai: ' · из CalAI', resetDay: 'сбросить', resetDayTitle: 'Сбросить учёт за день',
      // Учёт
      calaiReading: 'Читаю скрин…', calaiBtn: 'Внести из CalAI',
      quickAddTitle: 'ккал',
      // Подсказка цели — микрометрики
      mBmr: 'Обмен покоя', mNeat: 'Быт без спорта', mGoal: 'Цель',
      // Профиль
      fWeight: 'Вес, кг', fHeight: 'Рост, см', fAge: 'Возраст', fSex: 'Пол',
      male: 'Мужской', female: 'Женский',
      activity: 'Активность', goal: 'Цель',
      // Меню недели
      weekMenu: 'Меню недели',
      todaySuffix: ' · сегодня',
      chosenOf: 'выбрано ~', ofTarget: ' из ', target: 'цель ',
      mealApprox: '≈',
      cancelChoice: 'Отменить выбор',
      picking: 'Подбираю…', pickBtn: 'Подобрать',
      liked: 'понравилось', disliked: 'не очень',
      bMacro: 'Б', fMacro: 'Ж', uMacro: 'У',
      // Список покупок
      shopTitle: 'Список покупок на неделю',
      clear: 'Очистить',
      shopEmptyTitle: 'Список покупок пуст',
      shopEmptyText: 'Подберите блюда в меню недели и добавьте их кнопкой «На кухню» — продукты соберутся здесь на всю неделю.',
      shopEmptyCta: 'Перейти к меню недели',
      shopHint: 'Количества округлены до того, что реально покупать в магазине.',
      recentBought: 'недавно покупали', recentTitle: 'Покупали недавно — возможно, ещё есть дома',
      removeItem: 'Убрать',
      sendDriver: 'Отправить водителю (скоро)', sendDriverTitle: 'Появится, когда подключим отправку сообщений',
      // Окно подбора
      pickHead: 'Подбор: ', perMeal: ' ккал на приём',
      close: 'Закрыть',
      inMeal: 'Что в приёме:',
      notePlaceholder: 'Изменить подбор: например «полегче», «без молочного», «другое»',
      pickAgain: 'Подобрать заново',
      adding: 'Добавляю…', toKitchenCard: 'На кухню',
      more: 'Подробнее →',
      pickingMore: 'Подбираю ещё…', showMore: 'Показать ещё блюда',
      // Детальная карточка / рецепт
      recipeBuilding: 'ИИ собирает рецепт…', recipeUnavailable: 'Рецепт недоступен',
      ingredients: 'Ингредиенты', steps: 'Приготовление',
      toKitchen: 'На кухню', recipeWillFinish: ' (рецепт дособерётся)',
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
      calaiAte: 'CalAI: съедено ~', calaiAteSuffix: ' ккал ✓',
      calaiFail: 'Не удалось прочитать скриншот', calaiUploadErr: 'Ошибка загрузки скриншота',
      choiceCancelled: 'Выбор отменён',
      shopCleared: 'Список отмечен как купленный и очищен',
      prefsSaved: 'Предпочтения сохранены ✓',
      collecting: 'Собираю продукты…', addingProducts: 'Дособираю продукты…',
      addedToMenu: ' добавлено в меню и список покупок ✓',
      addedKitchen: ' и список покупок ✓',
      // Карты значений (RU → подпись), payload остаётся русским
      meals: { 'Завтрак': 'Завтрак', 'Обед': 'Обед', 'Перекус': 'Перекус', 'Ужин': 'Ужин' },
      comps: { 'Суп': 'Суп', 'Салат': 'Салат', 'Основное': 'Основное', 'Гарнир': 'Гарнир', 'Напиток': 'Напиток', 'Десерт': 'Десерт' },
      cuisines: { 'Русская': 'Русская', 'Итальянская': 'Итальянская', 'Грузинская': 'Грузинская', 'Японская': 'Японская', 'Средиземноморская': 'Средиземноморская', 'Азиатская': 'Азиатская', 'Мексиканская': 'Мексиканская' },
      foods: { 'Свинина': 'Свинина', 'Говядина': 'Говядина', 'Курица': 'Курица', 'Рыба': 'Рыба', 'Морепродукты': 'Морепродукты', 'Молочное': 'Молочное', 'Яйца': 'Яйца', 'Грибы': 'Грибы' },
      goals: { 'Снизить вес': 'Снизить вес', 'Поддержать': 'Поддержать', 'Набрать массу': 'Набрать массу' },
      activities: { 'Низкая': 'Низкая', 'Лёгкая': 'Лёгкая', 'Средняя': 'Средняя', 'Высокая': 'Высокая', 'Спортсмен': 'Спортсмен' },
      quick: { 'Кофе с молоком': 'Кофе с молоком', 'Кофе с молоком и сахаром': 'Кофе с молоком и сахаром', 'Кофе чёрный': 'Кофе чёрный', 'Протеиновый батончик': 'Протеиновый батончик', 'Протеиновый коктейль': 'Протеиновый коктейль' },
      wd: { 'Пн': 'Пн', 'Вт': 'Вт', 'Ср': 'Ср', 'Чт': 'Чт', 'Пт': 'Пт', 'Сб': 'Сб', 'Вс': 'Вс' },
      months: { 'янв': 'янв', 'фев': 'фев', 'мар': 'мар', 'апр': 'апр', 'мая': 'мая', 'июн': 'июн', 'июл': 'июл', 'авг': 'авг', 'сен': 'сен', 'окт': 'окт', 'ноя': 'ноя', 'дек': 'дек' },
    },
    en: {
      title: 'Nutrition',
      subtitle: 'Weekly menu · goal-based picks · groceries',
      prefsBtn: 'Set preferences',
      goalFor: 'Goal for',
      today: 'today',
      editProfile: 'Edit profile',
      done: 'Done',
      kcal: 'kcal',
      g: 'g',
      mCalories: 'Calories', mProtein: 'Protein', mFat: 'Fat', mCarbs: 'Carbs',
      bdBase: 'Base',
      bdTraining: 'workout', bdRestDay: 'rest day',
      bdRecovery: 'recovery',
      bdCarry: 'from yesterday',
      bdNoGarmin: 'Garmin not connected — goal without workouts',
      eaten: 'Eaten ~', remaining: 'left ~',
      fromCalai: ' · from CalAI', resetDay: 'reset', resetDayTitle: 'Reset the day’s tally',
      calaiReading: 'Reading screenshot…', calaiBtn: 'Import from CalAI',
      quickAddTitle: 'kcal',
      mBmr: 'Resting metabolism', mNeat: 'Daily living', mGoal: 'Goal',
      fWeight: 'Weight, kg', fHeight: 'Height, cm', fAge: 'Age', fSex: 'Sex',
      male: 'Male', female: 'Female',
      activity: 'Activity', goal: 'Goal',
      weekMenu: 'Weekly menu',
      todaySuffix: ' · today',
      chosenOf: 'chosen ~', ofTarget: ' of ', target: 'goal ',
      mealApprox: '≈',
      cancelChoice: 'Undo choice',
      picking: 'Picking…', pickBtn: 'Pick',
      liked: 'liked', disliked: 'not great',
      bMacro: 'P', fMacro: 'F', uMacro: 'C',
      shopTitle: 'Weekly grocery list',
      clear: 'Clear',
      shopEmptyTitle: 'Your grocery list is empty',
      shopEmptyText: 'Pick dishes in the weekly menu and add them with the “To kitchen” button — ingredients will collect here for the whole week.',
      shopEmptyCta: 'Go to weekly menu',
      shopHint: 'Quantities are rounded to what you’d actually buy in a store.',
      recentBought: 'bought recently', recentTitle: 'Bought recently — you may still have it at home',
      removeItem: 'Remove',
      sendDriver: 'Send to driver (soon)', sendDriverTitle: 'Coming once messaging is connected',
      pickHead: 'Picks: ', perMeal: ' kcal per meal',
      close: 'Close',
      inMeal: 'What’s in the meal:',
      notePlaceholder: 'Adjust the picks: e.g. “lighter”, “no dairy”, “something else”',
      pickAgain: 'Pick again',
      adding: 'Adding…', toKitchenCard: 'To kitchen',
      more: 'Details →',
      pickingMore: 'Picking more…', showMore: 'Show more dishes',
      recipeBuilding: 'AI is building the recipe…', recipeUnavailable: 'Recipe unavailable',
      ingredients: 'Ingredients', steps: 'Steps',
      toKitchen: 'To kitchen', recipeWillFinish: ' (recipe will finish in background)',
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
      calaiAte: 'CalAI: eaten ~', calaiAteSuffix: ' kcal ✓',
      calaiFail: 'Couldn’t read the screenshot', calaiUploadErr: 'Screenshot upload error',
      choiceCancelled: 'Choice undone',
      shopCleared: 'List marked as bought and cleared',
      prefsSaved: 'Preferences saved ✓',
      collecting: 'Collecting ingredients…', addingProducts: 'Gathering remaining ingredients…',
      addedToMenu: ' added to the menu and grocery list ✓',
      addedKitchen: ' and grocery list ✓',
      meals: { 'Завтрак': 'Breakfast', 'Обед': 'Lunch', 'Перекус': 'Snack', 'Ужин': 'Dinner' },
      comps: { 'Суп': 'Soup', 'Салат': 'Salad', 'Основное': 'Main', 'Гарнир': 'Side', 'Напиток': 'Drink', 'Десерт': 'Dessert' },
      cuisines: { 'Русская': 'Russian', 'Итальянская': 'Italian', 'Грузинская': 'Georgian', 'Японская': 'Japanese', 'Средиземноморская': 'Mediterranean', 'Азиатская': 'Asian', 'Мексиканская': 'Mexican' },
      foods: { 'Свинина': 'Pork', 'Говядина': 'Beef', 'Курица': 'Chicken', 'Рыба': 'Fish', 'Морепродукты': 'Seafood', 'Молочное': 'Dairy', 'Яйца': 'Eggs', 'Грибы': 'Mushrooms' },
      goals: { 'Снизить вес': 'Lose weight', 'Поддержать': 'Maintain', 'Набрать массу': 'Gain mass' },
      activities: { 'Низкая': 'Low', 'Лёгкая': 'Light', 'Средняя': 'Moderate', 'Высокая': 'High', 'Спортсмен': 'Athlete' },
      quick: { 'Кофе с молоком': 'Coffee with milk', 'Кофе с молоком и сахаром': 'Coffee with milk and sugar', 'Кофе чёрный': 'Black coffee', 'Протеиновый батончик': 'Protein bar', 'Протеиновый коктейль': 'Protein shake' },
      wd: { 'Пн': 'Mon', 'Вт': 'Tue', 'Ср': 'Wed', 'Чт': 'Thu', 'Пт': 'Fri', 'Сб': 'Sat', 'Вс': 'Sun' },
      months: { 'янв': 'Jan', 'фев': 'Feb', 'мар': 'Mar', 'апр': 'Apr', 'мая': 'May', 'июн': 'Jun', 'июл': 'Jul', 'авг': 'Aug', 'сен': 'Sep', 'окт': 'Oct', 'ноя': 'Nov', 'дек': 'Dec' },
    },
  })
  const [profile, setProfile] = useState(loadProfile)
  const base = useMemo(() => computeTarget(profile), [profile])

  const week = useMemo(() => weekDays(), [])
  const [selectedDay, setSelectedDay] = useState(mskDateKey())
  const [plan, setPlan] = useState(loadPlan)

  // Живые данные Garmin/Whoop (App.jsx кладёт их в localStorage асинхронно — перечитываем чуть позже)
  const [garmin, setGarmin] = useState(loadGarmin)
  const [whoop, setWhoop] = useState(loadWhoop)
  useEffect(() => {
    const t = setTimeout(() => { setGarmin(loadGarmin()); setWhoop(loadWhoop()) }, 2000)
    return () => clearTimeout(t)
  }, [])

  const [prefs, setPrefs] = useState(loadPrefs)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [prefsDraft, setPrefsDraft] = useState(prefs)

  const [mealType, setMealType] = useState('Обед')
  const [note, setNote] = useState('')
  const [meals, setMeals] = useState([])
  const [mealsMsg, setMealsMsg] = useState('')
  const [loadingMeals, setLoadingMeals] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [kitchenBusy, setKitchenBusy] = useState(null)  // имя блюда, которое сейчас добавляется
  const [images, setImages] = useState({})              // имя блюда → {url, author, authorUrl, unsplashUrl}
  const [resultsOpen, setResultsOpen] = useState(false) // окно с подобранными блюдами

  // Детальная карточка (рецепт): из подбора (source 'suggest') или из плана ('planned')
  const [detail, setDetail] = useState(null)
  const [detailParts, setDetailParts] = useState([])   // [{component, name, recipe|null}]
  const [detailLoading, setDetailLoading] = useState(false)

  const [shopping, setShopping] = useState(loadShopping)
  const [pantry, setPantry] = useState(loadPantry)
  const [intake, setIntake] = useState(loadIntake)
  const [components, setComponents] = useState(['Основное'])
  const [calaiBusy, setCalaiBusy] = useState(false)
  const calaiInput = useRef(null)
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
  const carry = carryFromYesterday(plan, selectedDay, base.kcal)
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
    try {
      const res = await fetch('/api/nutrition/meals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: pm, mealType: mt, prefs, count: 5, note, components: comps })
      })
      const data = await res.json()
      setMeals(data.meals || [])
      if ((!data.meals || !data.meals.length) && data.message) setMealsMsg(data.message)
      if (data.meals?.length) setResultsOpen(true)
      fetchImages(data.meals || [])
    } catch { setMeals([]); setMealsMsg(t.noServer) }
    setLoadingMeals(false)
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
    try {
      const res = await fetch('/api/nutrition/meals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: perMeal, mealType, prefs, count: 5, note, components, exclude: meals.map(m => m.name) })
      })
      const data = await res.json()
      const have = new Set(meals.map(m => m.name.toLowerCase()))
      const fresh = (data.meals || []).filter(m => !have.has(String(m.name).toLowerCase()))
      if (fresh.length) { setMeals(prev => [...prev, ...fresh]); fetchImages(fresh) }
    } catch { /* ignore */ }
    setLoadingMore(false)
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
  function dishBase(meal) {
    const img = images[meal.name]
    return {
      name: meal.name, short: meal.short || '', tags: meal.tags || [],
      kcal: meal.kcal, protein: meal.protein, fat: meal.fat, carb: meal.carb,
      imageUrl: img?.url || meal.imageUrl || null, imageAuthor: img?.author || '', imageAuthorUrl: img?.authorUrl || '', imageUnsplash: img?.unsplashUrl || '', imageQuery: meal.imageQuery || '',
      parts: partsOf(meal).map(p => ({ component: p.component, name: p.name, kcal: p.kcal, protein: p.protein, fat: p.fat, carb: p.carb })),
      partRecipes: [], ingredients: [], steps: [], chosenAt: Date.now(), rated: false
    }
  }

  // «На кухню» прямо с карточки: сразу в план дня, рецепты частей и продукты подтягиваем фоном
  async function quickKitchen(meal) {
    setKitchenBusy(meal.name)
    const base = dishBase(meal)
    setPlan(prev => { const np = setPlanMeal(prev, selectedDay, mealType, base); savePlan(np); return np })
    setResultsOpen(false)
    flash(`«${meal.name}» → ${t.meals[mealType] || mealType}. ${t.collecting}`)
    try {
      const recipes = []
      for (const part of base.parts) {
        const r = await fetchRecipe(part.name)
        if (r) recipes.push({ component: part.component, name: part.name, ingredients: r.ingredients || [], steps: r.steps || [], kcal: r.kcal, protein: r.protein, fat: r.fat, carb: r.carb })
      }
      const allIng = recipes.flatMap(r => r.ingredients)
      setPlan(prev => { const np = setPlanMeal(prev, selectedDay, mealType, { ...base, partRecipes: recipes, ingredients: allIng }); savePlan(np); return np })
      if (allIng.length) setShopping(prev => { const ns = addToShopping(prev, allIng, meal.name); saveShopping(ns); return ns })
      flash(`«${meal.name}»${t.addedToMenu}`)
    } catch { /* блюдо уже в плане */ }
    setKitchenBusy(null)
  }

  async function openSuggestDetail(meal) {
    const parts = partsOf(meal)
    setDetail({ meal, mealKey: mealType, dateKey: selectedDay, source: 'suggest' })
    setDetailParts(parts.map(p => ({ component: p.component, name: p.name, recipe: null })))
    setDetailLoading(true)
    for (let i = 0; i < parts.length; i++) {
      const r = await fetchRecipe(parts[i].name)
      setDetailParts(prev => prev.map((x, idx) => idx === i ? { ...x, recipe: r } : x))
    }
    setDetailLoading(false)
  }
  function openPlannedDetail(dateKey, mealKey) {
    const dish = plan[dateKey]?.[mealKey]
    if (!dish) return
    setDetail({ meal: dish, mealKey, dateKey, source: 'planned' })
    const parts = dish.partRecipes?.length
      ? dish.partRecipes.map(r => ({ component: r.component, name: r.name, recipe: r }))
      : [{ component: 'Основное', name: dish.name, recipe: { ingredients: dish.ingredients || [], steps: dish.steps || [], kcal: dish.kcal, protein: dish.protein, fat: dish.fat, carb: dish.carb } }]
    setDetailParts(parts); setDetailLoading(false)
  }
  function closeDetail() { setDetail(null); setDetailParts([]) }

  // «На кухню» из окна рецепта: добавляем в меню СРАЗУ, рецепты/продукты дособираем в фоне
  async function toKitchen() {
    const m = detail.meal
    const dateKey = detail.dateKey, mealKey = detail.mealKey
    const parts = detailParts.length ? detailParts : partsOf(m).map(p => ({ component: p.component, name: p.name, recipe: null }))
    // 1) то, что уже собрано — кладём сразу
    const ready = parts.filter(p => p.recipe).map(p => ({ component: p.component, name: p.name, ingredients: p.recipe.ingredients || [], steps: p.recipe.steps || [], kcal: p.recipe.kcal, protein: p.recipe.protein, fat: p.recipe.fat, carb: p.recipe.carb }))
    const base = { ...dishBase(m), parts: parts.map(p => ({ component: p.component, name: p.name })), partRecipes: ready, ingredients: ready.flatMap(r => r.ingredients) }
    setPlan(prev => { const np = setPlanMeal(prev, dateKey, mealKey, base); savePlan(np); return np })
    if (base.ingredients.length) setShopping(prev => { const ns = addToShopping(prev, base.ingredients, m.name); saveShopping(ns); return ns })
    closeDetail(); setResultsOpen(false)
    // 2) недостающие рецепты — в фоне, не заставляя ждать
    const missing = parts.filter(p => !p.recipe)
    if (!missing.length) { flash(`«${m.name}» → ${t.meals[mealKey] || mealKey}${t.addedKitchen}`); return }
    flash(`«${m.name}» → ${t.meals[mealKey] || mealKey}. ${t.addingProducts}`)
    try {
      const fetched = []
      for (const part of missing) {
        const r = await fetchRecipe(part.name)
        if (r) fetched.push({ component: part.component, name: part.name, ingredients: r.ingredients || [], steps: r.steps || [], kcal: r.kcal, protein: r.protein, fat: r.fat, carb: r.carb })
      }
      const allRecipes = [...ready, ...fetched]
      const allIng = allRecipes.flatMap(r => r.ingredients)
      setPlan(prev => { const np = setPlanMeal(prev, dateKey, mealKey, { ...base, partRecipes: allRecipes, ingredients: allIng }); savePlan(np); return np })
      const newIng = fetched.flatMap(r => r.ingredients)
      if (newIng.length) setShopping(prev => { const ns = addToShopping(prev, newIng, m.name); saveShopping(ns); return ns })
      flash(`«${m.name}»${t.addedToMenu}`)
    } catch { /* блюдо уже в меню */ }
  }
  function removePlanned() {
    const np = clearPlanMeal(plan, detail.dateKey, detail.mealKey)
    setPlan(np); savePlan(np)
    flash(t.choiceCancelled)
    closeDetail()
  }
  // Отменить выбор прямо со слота дня (без открытия окна)
  function removePlannedSlot(dateKey, mealKey) {
    const np = clearPlanMeal(plan, dateKey, mealKey)
    setPlan(np); savePlan(np)
    flash(t.choiceCancelled)
  }

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

  function removeShoppingItem(idx) {
    const next = { ...shopping, items: shopping.items.filter((_, i) => i !== idx) }
    setShopping(next); saveShopping(next)
  }
  function clearShopping() {
    // запоминаем купленное (чтобы потом не было излишков долгоиграющих продуктов)
    const np = archivePantry(pantry, shopping.items)
    setPantry(np); savePantry(np)
    const next = { weekStart: mskDateKey(), items: [] }
    setShopping(next); saveShopping(next)
    flash(t.shopCleared)
  }

  // ── Быстрый учёт «довесков» и CalAI ──
  function quickAdd(item) {
    const ni = addIntakeExtra(intake, selectedDay, item)
    setIntake(ni); saveIntake(ni)
    flash(`+${item.kcal} ${t.kcal} · ${t.quick[item.label] || item.label}`)
  }
  function resetIntake() {
    const ni = clearDayIntake(intake, selectedDay)
    setIntake(ni); saveIntake(ni)
  }
  async function onCalaiFile(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setCalaiBusy(true)
    try {
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file) })
      const resp = await fetch('/api/nutrition/intake-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: dataUrl })
      })
      const data = await resp.json()
      if (data.ok && data.intake) {
        const ni = setCalaiIntake(intake, selectedDay, data.intake)
        setIntake(ni); saveIntake(ni)
        flash(`${t.calaiAte}${Math.round(data.intake.kcal)}${t.calaiAteSuffix}`)
      } else flash(data.message || t.calaiFail)
    } catch { flash(t.calaiUploadErr) }
    setCalaiBusy(false)
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

  return (
    <div className="nu-page">
      <div className="page-header">
        <div>
          <h2>{t.title}</h2>
          <span className="muted">{t.subtitle}</span>
        </div>
        <button className="nu-prefs-btn" onClick={openPrefs}>
          <SlidersHorizontal size={16} strokeWidth={1.5} />{t.prefsBtn}
        </button>
      </div>

      {/* Цель + профиль */}
      <motion.div className="card nu-target" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <div className="nu-head">
          <div className="card-title" style={{ margin: 0 }}>{t.goalFor} {isToday ? t.today : dayLabel}</div>
        </div>
        <div className="nu-kpi">
          <div className="nu-kpi-hero">
            <span className="nu-kpi-num">{target.kcal}<span className="nu-kpi-unit"> {t.kcal}</span></span>
            <span className="nu-kpi-lbl">{t.mCalories}</span>
          </div>
          <div className="nu-kpi-macros">
            <div className="nu-kpi-macro">
              <span className="nu-kpi-mval">{target.protein}<span className="nu-kpi-munit"> {t.g}</span></span>
              <span className="nu-kpi-mlbl">{t.mProtein}</span>
            </div>
            <div className="nu-kpi-macro">
              <span className="nu-kpi-mval">{target.fat}<span className="nu-kpi-munit"> {t.g}</span></span>
              <span className="nu-kpi-mlbl">{t.mFat}</span>
            </div>
            <div className="nu-kpi-macro">
              <span className="nu-kpi-mval">{target.carb}<span className="nu-kpi-munit"> {t.g}</span></span>
              <span className="nu-kpi-mlbl">{t.mCarbs}</span>
            </div>
          </div>
        </div>

        {/* Из чего сложилась цель */}
        <div className="nu-breakdown">
          <span className="nu-bd-chip">{t.bdBase} {target.base}</span>
          {target.trainDelta > 0 && (
            <span className="nu-bd-chip plus"><Footprints size={14} strokeWidth={1.5} /> {sgn(target.trainDelta)} · {t.bdTraining}</span>
          )}
          {garmin && target.trainDelta === 0 && <span className="nu-bd-chip"><Footprints size={14} strokeWidth={1.5} /> {t.bdRestDay}</span>}
          {target.recDelta !== 0 && <span className="nu-bd-chip minus"><BedDouble size={14} strokeWidth={1.5} /> {sgn(target.recDelta)} {t.bdRecovery}</span>}
          {target.carryDelta !== 0 && <span className={`nu-bd-chip ${target.carryDelta > 0 ? 'plus' : 'minus'}`}><RotateCcw size={14} strokeWidth={1.5} /> {sgn(target.carryDelta)} {t.bdCarry}</span>}
          {!garmin && <span className="nu-bd-chip muted-chip">{t.bdNoGarmin}</span>}
        </div>

        {/* Съедено / осталось на день */}
        {eaten > 0 && (
          <div className="nu-progress">
            <div className="nu-prog-bar"><div className="nu-prog-fill" style={{ width: `${Math.min(100, Math.round(eaten / target.kcal * 100))}%` }} /></div>
            <div className="nu-prog-text muted">
              {t.eaten}{eaten} · <b style={{ color: 'var(--foreground)' }}>{t.remaining}{remaining} {t.kcal}</b>
              {intakeRec?.source === 'calai' && <span className="nu-intake-tag">{t.fromCalai}</span>}
              {intakeRec && <button className="nu-intake-reset" onClick={resetIntake} title={t.resetDayTitle}>{t.resetDay}</button>}
            </div>
          </div>
        )}

        {/* Учёт съеденного: CalAI-скриншот + быстрые довески */}
        <div className="nu-intake-row">
          <input ref={calaiInput} type="file" accept="image/*" onChange={onCalaiFile} style={{ display: 'none' }} />
          <button className="nu-calai" onClick={() => calaiInput.current?.click()} disabled={calaiBusy}>
            <Camera size={15} strokeWidth={1.5} />{calaiBusy ? t.calaiReading : t.calaiBtn}
          </button>
          {QUICK_ADD.filter(q => {
            if (q.key.startsWith('coffee')) return q.key === 'coffee_' + prefs.coffee
            if (q.key === 'protein_bar') return prefs.proteinBar
            if (q.key === 'protein_shake') return prefs.proteinShake
            return false
          }).map(q => (
            <button key={q.key} className="nu-quick" onClick={() => quickAdd(q)} title={`+${q.kcal} ${t.kcal}`}>+ {t.quick[q.label] || q.label}</button>
          ))}
        </div>

        <div className="nu-meta">
          <div className="nu-meta-metric">
            <span className="nu-meta-lbl muted">{t.mBmr}</span>
            <span className="nu-meta-val">≈{base.bmr}</span>
          </div>
          <div className="nu-meta-metric">
            <span className="nu-meta-lbl muted">{t.mNeat}</span>
            <span className="nu-meta-val">≈{base.neat}</span>
          </div>
          <div className="nu-meta-chips">
            <span className="nu-meta-chip">{t.mGoal}: {(() => { const gl = GOALS.find(g => g.key === profile.goal)?.label; return (t.goals[gl] || gl || '').toLowerCase() })()}</span>
            {target.recNote && <span className="nu-meta-chip">{target.recNote}</span>}
          </div>
        </div>
      </motion.div>

      {/* Меню недели */}
      <motion.div ref={weekRef} className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="card-title">{t.weekMenu}</div>
        <div className="nu-week">
          {week.map(d => {
            const info = dayPlanned(plan, d.key)
            return (
              <button key={d.key} className={`nu-day ${d.key === selectedDay ? 'active' : ''} ${d.isToday ? 'today' : ''}`} onClick={() => selectDay(d.key)}>
                <span className="nu-day-wd">{t.wd[d.wd] || d.wd}</span>
                <span className="nu-day-num">{d.day}</span>
                <span className="nu-day-dots">{MEAL_KEYS.map(k => <i key={k} className={plan[d.key]?.[k] ? 'on' : ''} />)}</span>
              </button>
            )
          })}
        </div>

        <div className="nu-day-head">
          <span className="nu-day-title">{dayLabel}{selDay?.isToday ? t.todaySuffix : ''}</span>
          <span className="muted nu-day-kcal">{dayInfo.count > 0 ? `${t.chosenOf}${dayInfo.kcal}${t.ofTarget}${target.kcal} ${t.kcal}` : `${t.target}${target.kcal} ${t.kcal}`}</span>
        </div>

        <div className="nu-slots">
          {MEALS.map(m => {
            const dish = plan[selectedDay]?.[m.key]
            const pm = mealTarget(target, m.share)
            const active = m.key === mealType
            return (
              <div key={m.key} className={`nu-slot ${dish ? 'filled' : ''} ${active ? 'sel' : ''}`}>
                <div className="nu-slot-head">
                  <span className="nu-slot-name"><MealIcon mealKey={m.key} /> {t.meals[m.key] || m.key}</span>
                  <span className="nu-slot-target muted">{t.mealApprox}{pm.kcal} {t.kcal}</span>
                </div>
                {dish ? (
                  <>
                    <button className="nu-slot-dish" onClick={() => openPlannedDetail(selectedDay, m.key)}>
                      {dish.imageUrl && <div className="nu-slot-img" style={{ backgroundImage: `url(${dish.imageUrl})` }} />}
                      <span className="nu-slot-dish-name">{dish.name}</span>
                      <span className="nu-slot-dish-macros muted">{dish.kcal} {t.kcal} · {t.bMacro}{dish.protein} {t.fMacro}{dish.fat} {t.uMacro}{dish.carb}</span>
                      {dish.rated && <span className={`nu-slot-rated ${dish.rating}`}>{dish.rating === 'up' ? <ThumbsUp size={13} strokeWidth={1.5} /> : <ThumbsDown size={13} strokeWidth={1.5} />} {dish.rating === 'up' ? t.liked : t.disliked}</span>}
                    </button>
                    <button className="nu-slot-cancel" onClick={() => removePlannedSlot(selectedDay, m.key)}>{t.cancelChoice}</button>
                  </>
                ) : (
                  <button className="nu-slot-empty" onClick={() => pickSlot(m.key)} disabled={loadingMeals}>
                    {loadingMeals && active ? t.picking : t.pickBtn}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* Если подбор не дал результата — короткое сообщение под слотами */}
      {!loadingMeals && mealsMsg && (
        <motion.div className="card nu-msg-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <div className="nu-empty muted">{mealsMsg}</div>
        </motion.div>
      )}

      {/* Список покупок */}
      <motion.div className="card nu-shop" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <div className="nu-head">
          <div className="card-title" style={{ margin: 0 }}>{t.shopTitle}</div>
          {shopping.items.length > 0 && <button className="nu-edit" onClick={clearShopping}>{t.clear}</button>}
        </div>
        {shopping.items.length === 0 ? (
          <div className="nu-shop-empty">
            <span className="nu-shop-empty-icon"><ShoppingCart size={28} strokeWidth={1.5} /></span>
            <div className="nu-shop-empty-title">{t.shopEmptyTitle}</div>
            <div className="nu-shop-empty-text muted">{t.shopEmptyText}</div>
            <button className="nu-shop-empty-cta" onClick={() => weekRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{t.shopEmptyCta}</button>
          </div>
        ) : (
          <>
            <div className="nu-shop-hint muted">{t.shopHint}</div>
            <div className="nu-shop-list">
              {shopping.items.map((it, i) => {
                const recent = recentlyBought(pantry, it.name)
                return (
                  <div key={i} className="nu-shop-item">
                    <span className="nu-shop-name">{it.name}{recent && <span className="nu-recent" title={t.recentTitle}>{t.recentBought}</span>}</span>
                    <span className="nu-shop-qty muted">{formatProduct(it)}</span>
                    <button className="nu-shop-del" onClick={() => removeShoppingItem(i)} title={t.removeItem}>×</button>
                  </div>
                )
              })}
            </div>
            <button className="nu-send" disabled title={t.sendDriverTitle}>
              {t.sendDriver}
            </button>
          </>
        )}
      </motion.div>

      {/* Окно с подобранными блюдами */}
      <AnimatePresence>
        {resultsOpen && (
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
              <div className="nu-meal-list">
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
                      <div className="nu-card-actions">
                        <button className="nu-kitchen-card" onClick={() => quickKitchen(m)} disabled={kitchenBusy === m.name}>
                          <ShoppingCart size={15} strokeWidth={1.5} />{kitchenBusy === m.name ? t.adding : t.toKitchenCard}
                        </button>
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
        )}
      </AnimatePresence>

      {/* Детальная карточка / рецепт */}
      <AnimatePresence>
        {detail && (
          <div className="nu-backdrop" onClick={closeDetail}>
            <motion.div className="card nu-modal" onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
              <div className="nu-modal-head">
                <h3>{detail.meal.name}</h3>
                <button className="nu-close" onClick={closeDetail} aria-label={t.close}>×</button>
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
              <div className="nu-modal-actions">
                {detail.source === 'suggest' ? (
                  <button className="nu-suggest nu-kitchen" onClick={toKitchen}><ShoppingCart size={16} strokeWidth={1.5} />{t.toKitchen}{detailLoading ? t.recipeWillFinish : ''}</button>
                ) : (
                  <button className="nu-remove" onClick={removePlanned}>{t.cancelChoice}</button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Предпочтения */}
      <AnimatePresence>
        {prefsOpen && (
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

              <div className="nu-modal-actions">
                <button className="nu-suggest" onClick={savePrefsModal}>{t.save}</button>
                <button className="nu-edit" onClick={() => setPrefsDraft({ ...DEFAULT_PREFS, likes: prefs.likes, dislikes: prefs.dislikes })}>{t.reset}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Оценка съеденного блюда */}
      <AnimatePresence>
        {rate && (
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
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
        .page-header h2 { font-size: 24px; font-weight: 700; color: var(--foreground); }
        .page-header > div span { display: block; margin-top: 2px; }
        .muted { color: var(--muted); }
        .card-title { font-size: 16px; font-weight: 700; color: var(--foreground); margin-bottom: 12px; }
        .nu-prefs-btn { display: inline-flex; align-items: center; gap: 7px; padding: 10px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-med); background: var(--bg-surface); color: var(--text-primary); font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; transition: all .15s; white-space: nowrap; }
        .nu-prefs-btn:hover { border-color: var(--accent); color: var(--accent); }
        /* Зазор ≥8px от фиксированной плашки «Демо-режим» (top:14px, bottom ≈46px от вьюпорта) */
        .nu-prefs-btn { margin-top: 26px; }
        .nu-prefs-btn svg { flex-shrink: 0; }

        .nu-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
        .nu-edit { padding: 7px 13px; border-radius: var(--radius-sm); border: 1px solid var(--border-med); background: transparent; color: var(--text-secondary); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
        .nu-edit:hover { color: var(--text-primary); border-color: var(--accent); }

        /* KPI: главная «ккал» крупно, макросы Б/Ж/У — подчинённая группа, числа в --foreground */
        .nu-kpi { display: flex; align-items: stretch; gap: 16px; flex-wrap: wrap; }
        .nu-kpi-hero { display: flex; flex-direction: column; gap: 4px; justify-content: center; background: var(--bg-tile); border: 1px solid var(--border-med); border-radius: var(--radius-md); padding: 18px 24px; min-width: 200px; flex: 1 1 220px; }
        .nu-kpi-num { font-size: 42px; font-weight: 800; color: var(--foreground); line-height: 1; letter-spacing: -.02em; }
        .nu-kpi-unit { font-size: 16px; font-weight: 600; color: var(--text-muted); }
        .nu-kpi-lbl { font-size: 13px; color: var(--text-secondary); }
        .nu-kpi-macros { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; flex: 2 1 320px; }
        .nu-kpi-macro { display: flex; flex-direction: column; gap: 3px; justify-content: center; background: var(--bg-tile); border: 1px solid var(--border-soft); border-radius: var(--radius-md); padding: 14px 16px; }
        .nu-kpi-mval { font-size: 22px; font-weight: 700; color: var(--foreground); line-height: 1; }
        .nu-kpi-munit { font-size: 12px; font-weight: 500; color: var(--text-muted); }
        .nu-kpi-mlbl { font-size: 12px; color: var(--text-muted); }
        .nu-breakdown { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
        .nu-bd-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; color: var(--text-body); background: var(--bg-tile); border: 1px solid var(--border-med); padding: 6px 11px; border-radius: 20px; }
        .nu-bd-chip svg { color: var(--text-muted); }
        .nu-bd-chip.plus, .nu-bd-chip.minus { color: var(--text-primary); border-color: var(--border-med); }
        .nu-bd-chip.plus svg, .nu-bd-chip.minus svg { color: var(--text-muted); }
        .nu-bd-chip.muted-chip { color: var(--text-muted); font-weight: 500; }

        /* Метаболика: микрометрики лейбл/значение + вывод в чип */
        .nu-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 22px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-soft); }
        .nu-meta-metric { display: flex; flex-direction: column; gap: 2px; }
        .nu-meta-lbl { font-size: 11.5px; }
        .nu-meta-val { font-size: 15px; font-weight: 700; color: var(--foreground); }
        .nu-meta-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto; }
        .nu-meta-chip { font-size: 12px; font-weight: 600; color: var(--text-secondary); background: var(--bg-tile); border: 1px solid var(--border-soft); padding: 5px 11px; border-radius: 20px; }
        .nu-progress { margin-top: 14px; display: flex; flex-direction: column; gap: 7px; }
        .nu-prog-bar { height: 8px; border-radius: 6px; background: var(--bg-tile); overflow: hidden; }
        .nu-prog-fill { height: 100%; background: var(--accent); border-radius: 6px; transition: width .4s; }
        .nu-prog-text { font-size: 13px; }

        .nu-profile { overflow: hidden; }
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
        .nu-intake-tag { color: var(--accent); font-weight: 600; }
        .nu-intake-reset { margin-left: 8px; background: transparent; border: none; color: var(--text-muted); font-family: inherit; font-size: 12px; text-decoration: underline; cursor: pointer; }
        .nu-intake-reset:hover { color: var(--text-primary); }
        .nu-intake-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; align-items: center; }
        .nu-calai { display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px; border-radius: var(--radius-sm); border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); font-family: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; transition: all .15s; }
        .nu-calai:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 20%, transparent); }
        .nu-calai:disabled { opacity: .6; cursor: default; }
        .nu-quick { padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-med); background: var(--bg-tile); color: var(--text-body); font-family: inherit; font-size: 13px; cursor: pointer; transition: all .15s; }
        .nu-quick:hover { border-color: var(--accent); color: var(--accent); }

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
        .nu-recent { display: inline-block; margin-left: 8px; font-size: 11px; color: var(--status-warn); background: color-mix(in srgb, var(--status-warn) 14%, transparent); padding: 2px 8px; border-radius: 10px; vertical-align: middle; }

        /* Неделя — единственный «сильный» акцент: активный день */
        .nu-week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
        .nu-day { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 12px 4px 10px; border-radius: var(--radius-md); border: 1px solid var(--border-soft); background: var(--bg-tile); cursor: pointer; transition: all .15s; }
        .nu-day:hover { border-color: var(--border-med); }
        .nu-day.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); box-shadow: 0 0 0 1px var(--accent) inset; }
        .nu-day-wd { font-size: 12px; color: var(--text-muted); font-weight: 600; }
        .nu-day.active .nu-day-wd { color: var(--accent); }
        .nu-day-num { font-size: 20px; font-weight: 800; color: var(--foreground); line-height: 1; }
        .nu-day.today .nu-day-num { color: var(--accent); }
        .nu-day-dots { display: flex; gap: 3px; margin-top: 2px; }
        .nu-day-dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--text-muted); }
        .nu-day-dots i.on { background: var(--accent); }
        .nu-day.active .nu-day-dots i { background: color-mix(in srgb, var(--accent) 45%, var(--text-muted)); }
        .nu-day.active .nu-day-dots i.on { background: var(--accent); }

        .nu-day-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-top: 18px; margin-bottom: 12px; flex-wrap: wrap; }
        .nu-day-title { font-size: 15px; font-weight: 700; color: var(--foreground); }
        .nu-day-kcal { font-size: 13px; }

        .nu-slots { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        /* Базовая рамка у всех слотов одинаковая; у выбранного меняем ТОЛЬКО цвет границы (мягкий акцент — день уже несёт сильный) */
        .nu-slot { display: flex; flex-direction: column; gap: 10px; background: var(--bg-tile); border: 1px solid var(--border-soft); border-radius: var(--radius-md); padding: 14px; min-height: 120px; transition: border-color .15s; }
        .nu-slot.sel { border-color: color-mix(in srgb, var(--accent) 55%, var(--border-med)); }
        .nu-slot-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .nu-slot-name { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 700; color: var(--foreground); }
        .nu-slot-name svg { color: var(--text-muted); flex-shrink: 0; }
        .nu-slot.sel .nu-slot-name svg { color: var(--accent); }
        .nu-slot-target { font-size: 12px; white-space: nowrap; }
        .nu-slot-dish { flex: 1; display: flex; flex-direction: column; gap: 5px; align-items: flex-start; text-align: left; background: transparent; border: none; cursor: pointer; padding: 0; }
        .nu-slot-img { width: 100%; height: 76px; border-radius: var(--radius-sm); background-size: cover; background-position: center; background-color: var(--bg-surface); margin-bottom: 3px; }
        .nu-slot-dish-name { font-size: 14.5px; font-weight: 600; color: var(--foreground); }
        .nu-slot-dish:hover .nu-slot-dish-name { color: var(--accent); }
        .nu-slot-dish-macros { font-size: 12.5px; }
        .nu-slot-rated { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; }
        .nu-slot-rated.up { color: var(--status-ok); }
        .nu-slot-rated.down { color: var(--status-warn); }
        .nu-slot-cancel { margin-top: 8px; align-self: stretch; background: transparent; border: 1px solid var(--border-soft); border-radius: var(--radius-sm); color: var(--text-muted); font-family: inherit; font-size: 12.5px; font-weight: 600; padding: 7px 10px; cursor: pointer; transition: all .15s; }
        .nu-slot-cancel:hover { border-color: var(--status-crit); color: var(--status-crit); }
        /* «Подобрать» — ghost: без рамки (не конфликтует со сплошной рамкой карточки), заливка-подложка */
        .nu-slot-empty { flex: 1; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--accent) 7%, transparent); border: none; border-radius: var(--radius-sm); color: var(--accent); font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: all .15s; }
        .nu-slot-empty:hover { background: color-mix(in srgb, var(--accent) 14%, transparent); }
        .nu-slot-empty:disabled { opacity: .55; cursor: default; }

        .nu-meal-controls { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; }
        .nu-permeal { font-size: 13px; }
        .nu-note-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .nu-note { flex: 1; width: 100%; background: var(--bg-tile); border: 1px solid var(--border-med); border-radius: var(--radius-md); padding: 12px 14px; font-family: inherit; font-size: 14px; color: var(--foreground); outline: none; }
        .nu-note:focus { border-color: var(--accent); }
        .nu-note::placeholder { color: var(--text-faint); }
        .nu-suggest { flex-shrink: 0; display: inline-flex; align-items: center; gap: 7px; padding: 12px 18px; border-radius: var(--radius-md); border: none; background: linear-gradient(var(--accent-btn-top), var(--accent-btn-bot)); color: var(--on-accent); font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: var(--shadow-btn); transition: opacity .15s; }
        .nu-suggest:hover:not(:disabled) { opacity: .92; }
        .nu-suggest:disabled { opacity: .5; cursor: default; }

        .nu-meal-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
        .nu-meal-card { display: flex; flex-direction: column; gap: 8px; background: var(--bg-tile); border: 1px solid var(--border-soft); border-radius: var(--radius-md); padding: 16px; }
        .nu-meal-img { height: 150px; margin: -16px -16px 4px; border-radius: var(--radius-md) var(--radius-md) 0 0; background-size: cover; background-position: center; background-color: var(--bg-surface); }
        .nu-meal-name { font-size: 15.5px; font-weight: 700; color: var(--foreground); }
        .nu-meal-short { font-size: 14px; line-height: 1.55; color: var(--text-secondary); }
        .nu-meal-macros { display: flex; flex-wrap: wrap; gap: 12px; font-size: 14px; color: var(--text-secondary); font-weight: 600; }
        .nu-meal-kcal { color: var(--foreground); }
        .nu-tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .nu-tag { font-size: 11px; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); padding: 3px 9px; border-radius: 20px; }
        .nu-card-actions { display: flex; align-items: center; gap: 12px; margin-top: 6px; }
        .nu-kitchen-card { display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px; border-radius: var(--radius-sm); border: none; background: linear-gradient(var(--accent-btn-top), var(--accent-btn-bot)); color: var(--on-accent); font-family: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; box-shadow: var(--shadow-btn); transition: opacity .15s; }
        .nu-kitchen-card:hover:not(:disabled) { opacity: .9; }
        .nu-kitchen-card:disabled { opacity: .55; cursor: default; }
        .nu-recipe-btn { align-self: flex-start; background: transparent; border: none; color: var(--accent); font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; padding: 0; }
        .nu-recipe-btn:hover { text-decoration: underline; }
        .nu-more { margin-top: 16px; width: 100%; padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-med); background: var(--bg-tile); color: var(--text-secondary); font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; transition: all .15s; }
        .nu-more:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .nu-more:disabled { opacity: .5; cursor: default; }
        .nu-empty { font-size: 14px; padding: 6px 0; line-height: 1.5; }
        .nu-reopen { margin-top: 4px; align-self: flex-start; background: transparent; border: none; color: var(--accent); font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; padding: 6px 0 0; }
        .nu-reopen:hover { text-decoration: underline; }
        .nu-results { width: 100%; max-width: 920px; max-height: 88vh; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }

        .nu-shop-hint { font-size: 13px; margin-bottom: 10px; }
        .nu-shop-list { display: flex; flex-direction: column; }
        .nu-shop-item { display: grid; grid-template-columns: 1fr auto 28px; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--border-soft); }
        .nu-shop-item:last-child { border-bottom: none; }
        .nu-shop-name { font-size: 14.5px; color: var(--foreground); }
        .nu-shop-qty { font-size: 13.5px; white-space: nowrap; font-weight: 600; }
        .nu-shop-del { width: 26px; height: 26px; border-radius: var(--radius-sm); border: 1px solid var(--border-soft); background: transparent; color: var(--text-muted); cursor: pointer; font-size: 16px; line-height: 1; transition: all .15s; }
        .nu-shop-del:hover { color: var(--status-crit); border-color: var(--status-crit); }
        .nu-send { margin-top: 14px; padding: 12px 18px; border-radius: var(--radius-md); border: 1px dashed var(--border-med); background: transparent; color: var(--text-muted); font-family: inherit; font-size: 14px; font-weight: 600; cursor: not-allowed; opacity: .65; }

        /* Пустой список покупок — центрированный empty-state */
        .nu-shop-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 24px 16px 8px; }
        .nu-shop-empty-icon { display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 50%; background: var(--bg-tile); border: 1px solid var(--border-soft); color: var(--text-muted); margin-bottom: 4px; }
        .nu-shop-empty-title { font-size: 15.5px; font-weight: 700; color: var(--foreground); }
        .nu-shop-empty-text { font-size: 13.5px; line-height: 1.5; max-width: 420px; }
        .nu-shop-empty-cta { margin-top: 8px; padding: 10px 18px; border-radius: var(--radius-md); border: none; background: linear-gradient(var(--accent-btn-top), var(--accent-btn-bot)); color: var(--on-accent); font-family: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; box-shadow: var(--shadow-btn); transition: opacity .15s; }
        .nu-shop-empty-cta:hover { opacity: .92; }

        .nu-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.55); backdrop-filter: blur(3px); z-index: 500; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .nu-modal { width: 100%; max-width: 560px; max-height: 88vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
        .nu-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .nu-modal-head h3 { font-size: 19px; font-weight: 700; color: var(--foreground); }
        .nu-modal-sub { font-size: 13px; margin-top: -6px; }
        .nu-modal-img-wrap { display: flex; flex-direction: column; gap: 5px; }
        .nu-modal-img { height: 200px; border-radius: var(--radius-md); background-size: cover; background-position: center; background-color: var(--bg-tile); }
        .nu-credit { font-size: 11.5px; }
        .nu-credit a { color: var(--text-muted); text-decoration: underline; }
        .nu-credit a:hover { color: var(--foreground); }
        .nu-close { width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1px solid var(--border-med); background: transparent; color: var(--text-muted); font-size: 20px; line-height: 1; cursor: pointer; flex-shrink: 0; }
        .nu-close:hover { color: var(--foreground); }
        .nu-sec-title { font-size: 13px; font-weight: 700; color: var(--foreground); text-transform: uppercase; letter-spacing: .05em; margin-top: 6px; }
        .nu-ing-list { display: flex; flex-direction: column; }
        .nu-ing { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--border-soft); font-size: 15px; color: var(--foreground); }
        .nu-ing:last-child { border-bottom: none; }
        .nu-ing .muted { color: var(--text-muted); }
        .nu-steps { display: flex; flex-direction: column; gap: 9px; padding-left: 20px; font-size: 15.5px; line-height: 1.6; color: var(--text-body); }
        .nu-modal-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
        .nu-kitchen { font-size: 15px; }
        .nu-remove { padding: 12px 18px; border-radius: var(--radius-md); border: 1px solid var(--status-crit); background: transparent; color: var(--status-crit); font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; transition: all .15s; }
        .nu-remove:hover { background: color-mix(in srgb, var(--status-crit) 14%, transparent); }

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
          .nu-kpi-macros { flex-basis: 100%; }
          .nu-slots { grid-template-columns: repeat(2, 1fr); }
          .nu-week { gap: 5px; }
          .nu-day { padding: 10px 2px 8px; }
        }
      `}</style>
    </div>
  )
}
