import { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import MicButton from '../components/MicButton.jsx'
import {
  loadProfile, saveProfile, computeTarget, ACTIVITY_LEVELS, GOALS,
  MEALS, MEAL_KEYS, mealTarget,
  loadPrefs, savePrefs, DEFAULT_PREFS, CUISINES, rememberDish,
  loadPlan, savePlan, setPlanMeal, clearPlanMeal, rateMeal, weekDays, dayPlanned, pendingRating,
  loadShopping, saveShopping, addToShopping, formatProduct,
  loadGarmin, loadWhoop, workoutKcal, eatenKcal, dynamicTarget, carryFromYesterday,
  QUICK_ADD, loadIntake, saveIntake, setCalaiIntake, addIntakeExtra, clearDayIntake, eatenForDay,
  loadPantry, savePantry, archivePantry, recentlyBought
} from '../utils/nutrition.js'
import { mskDateKey } from '../utils/time.js'

const FOODS = [
  ['pork', 'Свинина'], ['beef', 'Говядина'], ['chicken', 'Курица'], ['fish', 'Рыба'],
  ['seafood', 'Морепродукты'], ['dairy', 'Молочное'], ['eggs', 'Яйца'], ['mushrooms', 'Грибы']
]

const COMPONENTS = ['Суп', 'Салат', 'Основное', 'Гарнир', 'Напиток', 'Десерт']
const COMPONENT_DEFAULTS = {
  'Завтрак': ['Основное'],
  'Обед': ['Суп', 'Основное'],
  'Перекус': ['Основное'],
  'Ужин': ['Салат', 'Основное', 'Десерт']
}

function Macro({ value, unit, label, color }) {
  return (
    <div className="nu-macro">
      <span className="nu-macro-val" style={{ color }}>{value}<span className="nu-macro-unit muted"> {unit}</span></span>
      <span className="nu-macro-lbl muted">{label}</span>
    </div>
  )
}

export default function Nutrition() {
  const [profile, setProfile] = useState(loadProfile)
  const [editProfile, setEditProfile] = useState(false)
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
  const burned = workoutKcal(garmin, selectedDay)
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
  const dayLabel = selDay ? `${selDay.wd}, ${selDay.day} ${selDay.month}` : selectedDay

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
    } catch { setMeals([]); setMealsMsg('Нет связи с сервером. Запустите backend с ключом ИИ.') }
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
    flash(`«${meal.name}» → ${mealType}. Собираю продукты…`)
    try {
      const recipes = []
      for (const part of base.parts) {
        const r = await fetchRecipe(part.name)
        if (r) recipes.push({ component: part.component, name: part.name, ingredients: r.ingredients || [], steps: r.steps || [], kcal: r.kcal, protein: r.protein, fat: r.fat, carb: r.carb })
      }
      const allIng = recipes.flatMap(r => r.ingredients)
      setPlan(prev => { const np = setPlanMeal(prev, selectedDay, mealType, { ...base, partRecipes: recipes, ingredients: allIng }); savePlan(np); return np })
      if (allIng.length) setShopping(prev => { const ns = addToShopping(prev, allIng, meal.name); saveShopping(ns); return ns })
      flash(`«${meal.name}» добавлено в меню и список покупок ✓`)
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
    if (!missing.length) { flash(`«${m.name}» → ${mealKey} и список покупок ✓`); return }
    flash(`«${m.name}» → ${mealKey}. Дособираю продукты…`)
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
      flash(`«${m.name}» добавлено в меню и список покупок ✓`)
    } catch { /* блюдо уже в меню */ }
  }
  function removePlanned() {
    const np = clearPlanMeal(plan, detail.dateKey, detail.mealKey)
    setPlan(np); savePlan(np)
    flash('Выбор отменён')
    closeDetail()
  }
  // Отменить выбор прямо со слота дня (без открытия окна)
  function removePlannedSlot(dateKey, mealKey) {
    const np = clearPlanMeal(plan, dateKey, mealKey)
    setPlan(np); savePlan(np)
    flash('Выбор отменён')
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
    flash('Список отмечен как купленный и очищен')
  }

  // ── Быстрый учёт «довесков» и CalAI ──
  function quickAdd(item) {
    const ni = addIntakeExtra(intake, selectedDay, item)
    setIntake(ni); saveIntake(ni)
    flash(`+${item.kcal} ккал · ${item.label}`)
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
        flash(`CalAI: съедено ~${Math.round(data.intake.kcal)} ккал ✓`)
      } else flash(data.message || 'Не удалось прочитать скриншот')
    } catch { flash('Ошибка загрузки скриншота') }
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
  function savePrefsModal() { savePrefs(prefsDraft); setPrefs(prefsDraft); setPrefsOpen(false); flash('Предпочтения сохранены ✓') }

  return (
    <div className="nu-page">
      <div className="page-header">
        <div>
          <h2>Питание</h2>
          <span className="muted">Меню на неделю · подбор под цель · покупки</span>
        </div>
        <button className="nu-prefs-btn" onClick={openPrefs}>⚙ Настроить предпочтения</button>
      </div>

      {/* Цель + профиль */}
      <motion.div className="card nu-target" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <div className="nu-head">
          <div className="card-title" style={{ margin: 0 }}>Цель на {isToday ? 'сегодня' : dayLabel}</div>
          <button className="nu-edit" onClick={() => setEditProfile(e => !e)}>{editProfile ? 'Готово' : 'Изменить профиль'}</button>
        </div>
        <div className="nu-macros">
          <Macro value={target.kcal} unit="ккал" label="Калории" color="var(--orange)" />
          <Macro value={target.protein} unit="г" label="Белки" color="var(--green)" />
          <Macro value={target.fat} unit="г" label="Жиры" color="var(--yellow)" />
          <Macro value={target.carb} unit="г" label="Углеводы" color="var(--accent)" />
        </div>

        {/* Из чего сложилась цель */}
        <div className="nu-breakdown">
          <span className="nu-bd-chip">База {target.base}</span>
          {target.trainDelta !== 0 && (
            <span className={`nu-bd-chip ${target.trainDelta > 0 ? 'plus' : 'minus'}`}>
              🏃 {sgn(target.trainDelta)} · {burned > 0 ? `тренировка ${burned} ккал` : 'день отдыха'}
            </span>
          )}
          {target.trainDelta === 0 && burned > 0 && <span className="nu-bd-chip">🏃 тренировка {burned} ккал</span>}
          {target.recDelta !== 0 && <span className="nu-bd-chip minus">💤 {sgn(target.recDelta)} восстановление</span>}
          {target.carryDelta !== 0 && <span className={`nu-bd-chip ${target.carryDelta > 0 ? 'plus' : 'minus'}`}>↩ {sgn(target.carryDelta)} со вчера</span>}
          {!garmin && <span className="nu-bd-chip muted-chip">Garmin не подключён — цель без учёта тренировок</span>}
        </div>

        {/* Съедено / осталось на день */}
        {eaten > 0 && (
          <div className="nu-progress">
            <div className="nu-prog-bar"><div className="nu-prog-fill" style={{ width: `${Math.min(100, Math.round(eaten / target.kcal * 100))}%` }} /></div>
            <div className="nu-prog-text muted">
              Съедено ~{eaten} · <b style={{ color: 'var(--foreground)' }}>осталось ~{remaining} ккал</b>
              {intakeRec?.source === 'calai' && <span className="nu-intake-tag"> · из CalAI</span>}
              {intakeRec && <button className="nu-intake-reset" onClick={resetIntake} title="Сбросить учёт за день">сбросить</button>}
            </div>
          </div>
        )}

        {/* Учёт съеденного: CalAI-скриншот + быстрые довески */}
        <div className="nu-intake-row">
          <input ref={calaiInput} type="file" accept="image/*" onChange={onCalaiFile} style={{ display: 'none' }} />
          <button className="nu-calai" onClick={() => calaiInput.current?.click()} disabled={calaiBusy}>
            {calaiBusy ? 'Читаю скрин…' : '📷 Внести из CalAI'}
          </button>
          {QUICK_ADD.filter(q => {
            if (q.key.startsWith('coffee')) return q.key === 'coffee_' + prefs.coffee
            if (q.key === 'protein_bar') return prefs.proteinBar
            if (q.key === 'protein_shake') return prefs.proteinShake
            return false
          }).map(q => (
            <button key={q.key} className="nu-quick" onClick={() => quickAdd(q)} title={`+${q.kcal} ккал`}>+ {q.label}</button>
          ))}
        </div>

        <div className="nu-target-hint muted">
          Обмен покоя ~{base.bmr} ккал · обычная активность ~{base.tdee} ккал · цель: {GOALS.find(g => g.key === profile.goal)?.label.toLowerCase()}
          {target.recNote ? ` · ${target.recNote}` : ''}
        </div>
        <AnimatePresence>
          {editProfile && (
            <motion.div className="nu-profile" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <div className="nu-fields">
                <label className="nu-field"><span>Вес, кг</span>
                  <input type="number" value={profile.weight} onChange={e => updateProfile('weight', +e.target.value || 0)} /></label>
                <label className="nu-field"><span>Рост, см</span>
                  <input type="number" value={profile.height} onChange={e => updateProfile('height', +e.target.value || 0)} /></label>
                <label className="nu-field"><span>Возраст</span>
                  <input type="number" value={profile.age} onChange={e => updateProfile('age', +e.target.value || 0)} /></label>
                <label className="nu-field"><span>Пол</span>
                  <select value={profile.sex} onChange={e => updateProfile('sex', e.target.value)}>
                    <option value="male">Мужской</option><option value="female">Женский</option>
                  </select></label>
              </div>
              <div className="nu-seg-row">
                <span className="nu-seg-lbl muted">Активность</span>
                <div className="nu-seg">
                  {ACTIVITY_LEVELS.map(a => (
                    <button key={a.key} className={`nu-seg-btn ${profile.activity === a.key ? 'active' : ''}`}
                      onClick={() => updateProfile('activity', a.key)} title={a.hint}>{a.label}</button>
                  ))}
                </div>
              </div>
              <div className="nu-seg-row">
                <span className="nu-seg-lbl muted">Цель</span>
                <div className="nu-seg">
                  {GOALS.map(g => (
                    <button key={g.key} className={`nu-seg-btn ${profile.goal === g.key ? 'active' : ''}`}
                      onClick={() => updateProfile('goal', g.key)}>{g.label}</button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Меню недели */}
      <motion.div className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="card-title">Меню недели</div>
        <div className="nu-week">
          {week.map(d => {
            const info = dayPlanned(plan, d.key)
            return (
              <button key={d.key} className={`nu-day ${d.key === selectedDay ? 'active' : ''} ${d.isToday ? 'today' : ''}`} onClick={() => selectDay(d.key)}>
                <span className="nu-day-wd">{d.wd}</span>
                <span className="nu-day-num">{d.day}</span>
                <span className="nu-day-dots">{MEAL_KEYS.map(k => <i key={k} className={plan[d.key]?.[k] ? 'on' : ''} />)}</span>
              </button>
            )
          })}
        </div>

        <div className="nu-day-head">
          <span className="nu-day-title">{dayLabel}{selDay?.isToday ? ' · сегодня' : ''}</span>
          <span className="muted nu-day-kcal">{dayInfo.count > 0 ? `выбрано ~${dayInfo.kcal} из ${target.kcal} ккал` : `цель ${target.kcal} ккал`}</span>
        </div>

        <div className="nu-slots">
          {MEALS.map(m => {
            const dish = plan[selectedDay]?.[m.key]
            const pm = mealTarget(target, m.share)
            const active = m.key === mealType
            return (
              <div key={m.key} className={`nu-slot ${dish ? 'filled' : ''} ${active ? 'sel' : ''}`}>
                <div className="nu-slot-head">
                  <span className="nu-slot-name">{m.emoji} {m.key}</span>
                  <span className="nu-slot-target muted">≈{pm.kcal} ккал</span>
                </div>
                {dish ? (
                  <>
                    <button className="nu-slot-dish" onClick={() => openPlannedDetail(selectedDay, m.key)}>
                      {dish.imageUrl && <div className="nu-slot-img" style={{ backgroundImage: `url(${dish.imageUrl})` }} />}
                      <span className="nu-slot-dish-name">{dish.name}</span>
                      <span className="nu-slot-dish-macros muted">{dish.kcal} ккал · Б{dish.protein} Ж{dish.fat} У{dish.carb}</span>
                      {dish.rated && <span className={`nu-slot-rated ${dish.rating}`}>{dish.rating === 'up' ? '👍 понравилось' : '👎 не очень'}</span>}
                    </button>
                    <button className="nu-slot-cancel" onClick={() => removePlannedSlot(selectedDay, m.key)}>Отменить выбор</button>
                  </>
                ) : (
                  <button className="nu-slot-empty" onClick={() => pickSlot(m.key)} disabled={loadingMeals}>
                    {loadingMeals && active ? 'Подбираю…' : '＋ Подобрать'}
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
          <div className="card-title" style={{ margin: 0 }}>Список покупок на неделю</div>
          {shopping.items.length > 0 && <button className="nu-edit" onClick={clearShopping}>Очистить</button>}
        </div>
        {shopping.items.length === 0 ? (
          <div className="nu-empty muted">Пусто. Выбирайте блюда кнопкой «На кухню» — продукты соберутся здесь на всю неделю.</div>
        ) : (
          <>
            <div className="nu-shop-hint muted">Количества округлены до того, что реально покупать в магазине.</div>
            <div className="nu-shop-list">
              {shopping.items.map((it, i) => {
                const recent = recentlyBought(pantry, it.name)
                return (
                  <div key={i} className="nu-shop-item">
                    <span className="nu-shop-name">{it.name}{recent && <span className="nu-recent" title="Покупали недавно — возможно, ещё есть дома">недавно покупали</span>}</span>
                    <span className="nu-shop-qty muted">{formatProduct(it)}</span>
                    <button className="nu-shop-del" onClick={() => removeShoppingItem(i)} title="Убрать">×</button>
                  </div>
                )
              })}
            </div>
            <button className="nu-send" disabled title="Появится, когда подключим отправку сообщений">
              Отправить водителю (скоро)
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
                  <h3>Подбор: {mealType}</h3>
                  <div className="nu-modal-sub muted">{dayLabel} · ≈{perMeal.kcal} ккал на приём</div>
                </div>
                <button className="nu-close" onClick={() => setResultsOpen(false)} aria-label="Закрыть">×</button>
              </div>
              <div className="nu-comp-row">
                <span className="muted nu-comp-lbl">Что в приёме:</span>
                {COMPONENTS.map(c => (
                  <button key={c} className={`nu-comp ${components.includes(c) ? 'on' : ''}`} onClick={() => toggleComponent(c)}>{c}</button>
                ))}
              </div>
              <div className="nu-note-row">
                <input className="nu-note" placeholder="Изменить подбор: например «полегче», «без молочного», «другое»"
                  value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') suggestMeals() }} />
                <MicButton primary onText={t => setNote(prev => (prev ? prev.trim() + ' ' : '') + t)} />
                <button className="nu-suggest" onClick={() => suggestMeals()} disabled={loadingMeals}>
                  {loadingMeals ? 'Подбираю…' : 'Подобрать заново'}
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
                            <div key={k} className="nu-part"><span className="nu-part-c muted">{p.component}</span> {p.name} <span className="muted">· {p.kcal} ккал</span></div>
                          ))}
                        </div>
                      ) : (m.short && <div className="nu-meal-short muted">{m.short}</div>)}
                      <div className="nu-meal-macros">
                        <span style={{ color: 'var(--orange)' }}>{m.kcal} ккал</span>
                        <span>Б {m.protein}</span><span>Ж {m.fat}</span><span>У {m.carb}</span>
                      </div>
                      {m.tags?.length > 0 && <div className="nu-tags">{m.tags.map(t => <span key={t} className="nu-tag">{t}</span>)}</div>}
                      <div className="nu-card-actions">
                        <button className="nu-kitchen-card" onClick={() => quickKitchen(m)} disabled={kitchenBusy === m.name}>
                          {kitchenBusy === m.name ? 'Добавляю…' : '🍳 На кухню'}
                        </button>
                        <button className="nu-recipe-btn" onClick={() => openSuggestDetail(m)}>Подробнее →</button>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
              <button className="nu-more" onClick={moreMeals} disabled={loadingMore}>
                {loadingMore ? 'Подбираю ещё…' : '＋ Показать ещё блюда'}
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
                <button className="nu-close" onClick={closeDetail} aria-label="Закрыть">×</button>
              </div>
              <div className="nu-modal-sub muted">{detail.mealKey} · {dayLabel}</div>
              {(() => {
                const im = detail.source === 'planned'
                  ? (detail.meal.imageUrl ? { url: detail.meal.imageUrl, author: detail.meal.imageAuthor, authorUrl: detail.meal.imageAuthorUrl, unsplashUrl: detail.meal.imageUnsplash } : null)
                  : images[detail.meal.name]
                if (!im?.url) return null
                return (
                  <div className="nu-modal-img-wrap">
                    <div className="nu-modal-img" style={{ backgroundImage: `url(${im.url})` }} />
                    {im.author && (
                      <div className="nu-credit muted">Фото: <a href={im.authorUrl} target="_blank" rel="noreferrer">{im.author}</a> · <a href={im.unsplashUrl} target="_blank" rel="noreferrer">Unsplash</a></div>
                    )}
                  </div>
                )
              })()}
              <div className="nu-meal-macros nu-detail-total">
                <span style={{ color: 'var(--orange)' }}>{detail.meal.kcal} ккал</span>
                <span>Б {detail.meal.protein}</span><span>Ж {detail.meal.fat}</span><span>У {detail.meal.carb}</span>
              </div>
              {detailParts.map((p, pi) => (
                <div key={pi} className="nu-part-sec">
                  {detailParts.length > 1 && <div className="nu-part-head"><span className="nu-part-c muted">{p.component}</span> {p.name}</div>}
                  {!p.recipe ? (
                    <div className="nu-empty muted">{detailLoading ? 'ИИ собирает рецепт…' : 'Рецепт недоступен'}</div>
                  ) : (
                    <>
                      <div className="nu-sec-title">Ингредиенты</div>
                      <div className="nu-ing-list">
                        {(p.recipe.ingredients || []).map((ing, i) => (
                          <div key={i} className="nu-ing">
                            <span>{ing.name}</span>
                            <span className="muted">{ing.qty != null ? `${ing.qty} ${ing.unit || ''}` : (ing.unit || '')}</span>
                          </div>
                        ))}
                      </div>
                      <div className="nu-sec-title">Приготовление</div>
                      <ol className="nu-steps">
                        {(p.recipe.steps || []).map((s, i) => <li key={i}>{s}</li>)}
                      </ol>
                    </>
                  )}
                </div>
              ))}
              <div className="nu-modal-actions">
                {detail.source === 'suggest' ? (
                  <button className="nu-suggest nu-kitchen" onClick={toKitchen}>🍳 На кухню{detailLoading ? ' (рецепт дособерётся)' : ''}</button>
                ) : (
                  <button className="nu-remove" onClick={removePlanned}>Отменить выбор</button>
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
                <h3>Вкусовые предпочтения</h3>
                <button className="nu-close" onClick={() => setPrefsOpen(false)} aria-label="Закрыть">×</button>
              </div>
              <div className="nu-modal-sub muted">ИИ будет учитывать это при подборе — но со здравым смыслом.</div>

              <div className="nu-sec-title">Острота</div>
              <div className="nu-slider-row">
                <input type="range" min="0" max="10" value={prefsDraft.spicy} onChange={e => setDraft('spicy', +e.target.value)} />
                <span className="nu-slider-val">{prefsDraft.spicy <= 2 ? 'почти не острое' : prefsDraft.spicy >= 7 ? 'люблю острое' : 'умеренно'} · {prefsDraft.spicy}/10</span>
              </div>
              <div className="nu-sec-title">Сладкое</div>
              <div className="nu-slider-row">
                <input type="range" min="0" max="10" value={prefsDraft.sweet} onChange={e => setDraft('sweet', +e.target.value)} />
                <span className="nu-slider-val">{prefsDraft.sweet <= 2 ? 'не люблю' : prefsDraft.sweet >= 7 ? 'сладкоежка' : 'умеренно'} · {prefsDraft.sweet}/10</span>
              </div>

              <div className="nu-sec-title">Что ест</div>
              <div className="nu-foods">
                {FOODS.map(([key, label]) => (
                  <button key={key} className={`nu-food ${prefsDraft[key] ? 'yes' : 'no'}`} onClick={() => setDraft(key, !prefsDraft[key])}>
                    {label} <b>{prefsDraft[key] ? 'да' : 'нет'}</b>
                  </button>
                ))}
              </div>

              <div className="nu-sec-title">Любимые кухни</div>
              <div className="nu-foods">
                {CUISINES.map(c => (
                  <button key={c} className={`nu-chip ${(prefsDraft.cuisines || []).includes(c) ? 'on' : ''}`} onClick={() => toggleCuisine(c)}>{c}</button>
                ))}
              </div>

              <div className="nu-sec-title">Время на готовку</div>
              <div className="nu-seg">
                <button className={`nu-seg-btn ${prefsDraft.cookTime === 'fast' ? 'active' : ''}`} onClick={() => setDraft('cookTime', 'fast')}>Быстро (до 30 мин)</button>
                <button className={`nu-seg-btn ${prefsDraft.cookTime === 'any' ? 'active' : ''}`} onClick={() => setDraft('cookTime', 'any')}>Не важно</button>
              </div>

              <div className="nu-sec-title">Кофе (тоже считаем в КБЖУ)</div>
              <div className="nu-seg">
                {[['no', 'Не пью'], ['black', 'Чёрный'], ['milk', 'С молоком'], ['milk_sugar', 'С молоком и сахаром']].map(([k, l]) => (
                  <button key={k} className={`nu-seg-btn ${prefsDraft.coffee === k ? 'active' : ''}`} onClick={() => setDraft('coffee', k)}>{l}</button>
                ))}
              </div>
              {prefsDraft.coffee !== 'no' && (
                <div className="nu-slider-row" style={{ marginTop: 8 }}>
                  <span className="muted" style={{ fontSize: 13 }}>Чашек в день</span>
                  <input type="range" min="1" max="6" value={prefsDraft.coffeeCups || 1} onChange={e => setDraft('coffeeCups', +e.target.value)} />
                  <span className="nu-slider-val">{prefsDraft.coffeeCups || 1}</span>
                </div>
              )}
              <div className="nu-sec-title">Спортпит</div>
              <div className="nu-foods">
                <button className={`nu-food ${prefsDraft.proteinBar ? 'yes' : 'no'}`} onClick={() => setDraft('proteinBar', !prefsDraft.proteinBar)}>Протеиновые батончики <b>{prefsDraft.proteinBar ? 'да' : 'нет'}</b></button>
                <button className={`nu-food ${prefsDraft.proteinShake ? 'yes' : 'no'}`} onClick={() => setDraft('proteinShake', !prefsDraft.proteinShake)}>Протеиновые коктейли <b>{prefsDraft.proteinShake ? 'да' : 'нет'}</b></button>
              </div>

              <div className="nu-sec-title">Аллергии (строго исключить)</div>
              <input className="nu-note" placeholder="Например: орехи, мёд" value={prefsDraft.allergies} onChange={e => setDraft('allergies', e.target.value)} />
              <div className="nu-sec-title">Не люблю</div>
              <input className="nu-note" placeholder="Например: кинза, печень" value={prefsDraft.avoid} onChange={e => setDraft('avoid', e.target.value)} />

              <div className="nu-modal-actions">
                <button className="nu-suggest" onClick={savePrefsModal}>Сохранить</button>
                <button className="nu-edit" onClick={() => setPrefsDraft({ ...DEFAULT_PREFS, likes: prefs.likes, dislikes: prefs.dislikes })}>Сбросить</button>
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
              <div className="nu-rate-meal muted">{rate.mealKey} · как вам было?</div>
              <h3>{rate.dish.name}</h3>
              <textarea className="nu-note nu-rate-text" rows={2} placeholder="Пара слов (необязательно): что понравилось / что поменять"
                value={rateText} onChange={e => setRateText(e.target.value)} />
              <div className="nu-rate-btns">
                <button className="nu-rate-up" onClick={() => submitRate(true)}>👍 Понравилось</button>
                <button className="nu-rate-down" onClick={() => submitRate(false)}>👎 Не очень</button>
              </div>
              <button className="nu-rate-later" onClick={laterRate}>Позже</button>
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
        .nu-prefs-btn { padding: 10px 16px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-card); color: var(--foreground); font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; transition: all .15s; white-space: nowrap; }
        .nu-prefs-btn:hover { border-color: var(--accent); color: var(--accent); }

        .nu-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
        .nu-edit { padding: 7px 13px; border-radius: 10px; border: 1px solid var(--border); background: transparent; color: var(--muted); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
        .nu-edit:hover { color: var(--foreground); border-color: var(--accent); }

        .nu-macros { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .nu-macro { display: flex; flex-direction: column; gap: 4px; background: var(--bg-secondary); border-radius: 14px; padding: 16px 18px; }
        .nu-macro-val { font-size: 26px; font-weight: 800; }
        .nu-macro-unit { font-size: 13px; font-weight: 500; }
        .nu-macro-lbl { font-size: 12px; }
        .nu-target-hint { font-size: 13.5px; margin-top: 10px; }
        .nu-breakdown { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
        .nu-bd-chip { font-size: 12.5px; font-weight: 600; color: var(--foreground); background: var(--bg-secondary); border: 1px solid var(--border); padding: 6px 11px; border-radius: 20px; }
        .nu-bd-chip.plus { color: var(--green); border-color: color-mix(in srgb, var(--green) 40%, transparent); }
        .nu-bd-chip.minus { color: var(--orange); border-color: color-mix(in srgb, var(--orange) 40%, transparent); }
        .nu-bd-chip.muted-chip { color: var(--muted); font-weight: 500; }
        .nu-progress { margin-top: 14px; display: flex; flex-direction: column; gap: 7px; }
        .nu-prog-bar { height: 8px; border-radius: 6px; background: var(--bg-secondary); overflow: hidden; }
        .nu-prog-fill { height: 100%; background: linear-gradient(90deg, var(--green), var(--accent)); border-radius: 6px; transition: width .4s; }
        .nu-prog-text { font-size: 13px; }

        .nu-profile { overflow: hidden; }
        .nu-fields { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 16px; }
        .nu-field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--muted); }
        .nu-field input, .nu-field select { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; font-family: inherit; font-size: 14px; color: var(--foreground); outline: none; }
        .nu-field input:focus, .nu-field select:focus { border-color: var(--accent); }
        .nu-seg-row { display: flex; align-items: center; gap: 12px; margin-top: 14px; flex-wrap: wrap; }
        .nu-seg-lbl { font-size: 12px; min-width: 80px; }
        .nu-seg { display: inline-flex; flex-wrap: wrap; gap: 4px; background: var(--bg-secondary); padding: 4px; border-radius: 12px; }
        .nu-seg-btn { padding: 8px 13px; border: none; background: transparent; color: var(--muted); font-family: inherit; font-size: 13px; font-weight: 600; border-radius: 9px; cursor: pointer; transition: all .15s; }
        .nu-seg-btn:hover { color: var(--foreground); }
        .nu-seg-btn.active { background: var(--bg-card); color: var(--accent); box-shadow: 0 2px 8px rgba(0,0,0,.25); }

        /* Учёт съеденного */
        .nu-intake-tag { color: var(--green); font-weight: 600; }
        .nu-intake-reset { margin-left: 8px; background: transparent; border: none; color: var(--muted); font-family: inherit; font-size: 12px; text-decoration: underline; cursor: pointer; }
        .nu-intake-reset:hover { color: var(--foreground); }
        .nu-intake-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; align-items: center; }
        .nu-calai { padding: 9px 14px; border-radius: 11px; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); font-family: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; transition: all .15s; }
        .nu-calai:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 20%, transparent); }
        .nu-calai:disabled { opacity: .6; cursor: default; }
        .nu-quick { padding: 8px 12px; border-radius: 11px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--foreground); font-family: inherit; font-size: 13px; cursor: pointer; transition: all .15s; }
        .nu-quick:hover { border-color: var(--accent); color: var(--accent); }

        /* Состав приёма (комбо) */
        .nu-comp-row { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
        .nu-comp-lbl { font-size: 13px; margin-right: 2px; }
        .nu-comp { padding: 7px 12px; border-radius: 18px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--muted); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
        .nu-comp.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
        .nu-parts { display: flex; flex-direction: column; gap: 4px; }
        .nu-part { font-size: 13.5px; color: var(--foreground); line-height: 1.4; }
        .nu-part-c { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; margin-right: 4px; }
        .nu-part-sec { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--border); padding-top: 12px; margin-top: 4px; }
        .nu-part-sec:first-of-type { border-top: none; padding-top: 0; }
        .nu-part-head { font-size: 15px; font-weight: 700; color: var(--foreground); }
        .nu-detail-total { padding: 4px 0; }
        .nu-recent { display: inline-block; margin-left: 8px; font-size: 11px; color: var(--orange); background: color-mix(in srgb, var(--orange) 14%, transparent); padding: 2px 8px; border-radius: 10px; vertical-align: middle; }

        /* Неделя */
        .nu-week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
        .nu-day { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 12px 4px 10px; border-radius: 14px; border: 1px solid var(--border); background: var(--bg-secondary); cursor: pointer; transition: all .15s; }
        .nu-day:hover { border-color: var(--accent); }
        .nu-day.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
        .nu-day-wd { font-size: 12px; color: var(--muted); font-weight: 600; }
        .nu-day.active .nu-day-wd { color: var(--accent); }
        .nu-day-num { font-size: 20px; font-weight: 800; color: var(--foreground); line-height: 1; }
        .nu-day.today .nu-day-num { color: var(--accent); }
        .nu-day-dots { display: flex; gap: 3px; margin-top: 2px; }
        .nu-day-dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--border); }
        .nu-day-dots i.on { background: var(--green); }

        .nu-day-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-top: 18px; margin-bottom: 12px; flex-wrap: wrap; }
        .nu-day-title { font-size: 15px; font-weight: 700; color: var(--foreground); }
        .nu-day-kcal { font-size: 13px; }

        .nu-slots { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .nu-slot { display: flex; flex-direction: column; gap: 10px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 14px; padding: 14px; min-height: 120px; }
        .nu-slot.sel { border-color: var(--accent); }
        .nu-slot-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .nu-slot-name { font-size: 14px; font-weight: 700; color: var(--foreground); }
        .nu-slot-target { font-size: 12px; white-space: nowrap; }
        .nu-slot-dish { flex: 1; display: flex; flex-direction: column; gap: 5px; align-items: flex-start; text-align: left; background: transparent; border: none; cursor: pointer; padding: 0; }
        .nu-slot-img { width: 100%; height: 76px; border-radius: 10px; background-size: cover; background-position: center; background-color: var(--bg-card); margin-bottom: 3px; }
        .nu-slot-dish-name { font-size: 14.5px; font-weight: 600; color: var(--foreground); }
        .nu-slot-dish:hover .nu-slot-dish-name { color: var(--accent); }
        .nu-slot-dish-macros { font-size: 12.5px; }
        .nu-slot-rated { font-size: 12px; font-weight: 600; }
        .nu-slot-rated.up { color: var(--green); }
        .nu-slot-rated.down { color: var(--orange); }
        .nu-slot-cancel { margin-top: 8px; align-self: stretch; background: transparent; border: 1px solid var(--border); border-radius: 10px; color: var(--muted); font-family: inherit; font-size: 12.5px; font-weight: 600; padding: 7px 10px; cursor: pointer; transition: all .15s; }
        .nu-slot-cancel:hover { border-color: var(--red); color: var(--red); }
        .nu-slot-empty { flex: 1; display: flex; align-items: center; justify-content: center; background: transparent; border: 1px dashed var(--border); border-radius: 10px; color: var(--muted); font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: all .15s; }
        .nu-slot-empty:hover { border-color: var(--accent); color: var(--accent); }

        .nu-meal-controls { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; }
        .nu-permeal { font-size: 13px; }
        .nu-note-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .nu-note { flex: 1; width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; font-family: inherit; font-size: 14px; color: var(--foreground); outline: none; }
        .nu-note:focus { border-color: var(--accent); }
        .nu-note::placeholder { color: var(--muted); }
        .nu-suggest { flex-shrink: 0; padding: 12px 18px; border-radius: 12px; border: none; background: var(--accent); color: var(--accent-foreground); font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; transition: opacity .15s; }
        .nu-suggest:hover:not(:disabled) { opacity: .9; }
        .nu-suggest:disabled { opacity: .5; cursor: default; }

        .nu-meal-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
        .nu-meal-card { display: flex; flex-direction: column; gap: 8px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 14px; padding: 16px; }
        .nu-meal-img { height: 150px; margin: -16px -16px 4px; border-radius: 14px 14px 0 0; background-size: cover; background-position: center; background-color: var(--bg-card); }
        .nu-meal-name { font-size: 15.5px; font-weight: 700; color: var(--foreground); }
        .nu-meal-short { font-size: 14px; line-height: 1.55; color: var(--muted); }
        .nu-meal-macros { display: flex; flex-wrap: wrap; gap: 12px; font-size: 14px; color: var(--muted); font-weight: 600; }
        .nu-tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .nu-tag { font-size: 11px; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); padding: 3px 9px; border-radius: 20px; }
        .nu-card-actions { display: flex; align-items: center; gap: 12px; margin-top: 6px; }
        .nu-kitchen-card { padding: 9px 14px; border-radius: 10px; border: none; background: var(--accent); color: var(--accent-foreground); font-family: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; transition: opacity .15s; }
        .nu-kitchen-card:hover:not(:disabled) { opacity: .9; }
        .nu-kitchen-card:disabled { opacity: .55; cursor: default; }
        .nu-recipe-btn { align-self: flex-start; background: transparent; border: none; color: var(--accent); font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; padding: 0; }
        .nu-recipe-btn:hover { text-decoration: underline; }
        .nu-more { margin-top: 16px; width: 100%; padding: 12px; border-radius: 12px; border: 1px dashed var(--border); background: transparent; color: var(--muted); font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; transition: all .15s; }
        .nu-more:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .nu-more:disabled { opacity: .5; cursor: default; }
        .nu-empty { font-size: 14px; padding: 6px 0; line-height: 1.5; }
        .nu-reopen { margin-top: 4px; align-self: flex-start; background: transparent; border: none; color: var(--accent); font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; padding: 6px 0 0; }
        .nu-reopen:hover { text-decoration: underline; }
        .nu-results { width: 100%; max-width: 920px; max-height: 88vh; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }

        .nu-shop-hint { font-size: 13px; margin-bottom: 10px; }
        .nu-shop-list { display: flex; flex-direction: column; }
        .nu-shop-item { display: grid; grid-template-columns: 1fr auto 28px; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--border); }
        .nu-shop-item:last-child { border-bottom: none; }
        .nu-shop-name { font-size: 14.5px; color: var(--foreground); }
        .nu-shop-qty { font-size: 13.5px; white-space: nowrap; font-weight: 600; }
        .nu-shop-del { width: 26px; height: 26px; border-radius: 7px; border: 1px solid var(--border); background: transparent; color: var(--muted); cursor: pointer; font-size: 16px; line-height: 1; transition: all .15s; }
        .nu-shop-del:hover { color: var(--red); border-color: var(--red); }
        .nu-send { margin-top: 14px; padding: 12px 18px; border-radius: 12px; border: 1px dashed var(--border); background: transparent; color: var(--muted); font-family: inherit; font-size: 14px; font-weight: 600; cursor: not-allowed; opacity: .65; }

        .nu-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.55); backdrop-filter: blur(3px); z-index: 500; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .nu-modal { width: 100%; max-width: 560px; max-height: 88vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
        .nu-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .nu-modal-head h3 { font-size: 19px; font-weight: 700; color: var(--foreground); }
        .nu-modal-sub { font-size: 13px; margin-top: -6px; }
        .nu-modal-img-wrap { display: flex; flex-direction: column; gap: 5px; }
        .nu-modal-img { height: 200px; border-radius: 14px; background-size: cover; background-position: center; background-color: var(--bg-secondary); }
        .nu-credit { font-size: 11.5px; }
        .nu-credit a { color: var(--muted); text-decoration: underline; }
        .nu-credit a:hover { color: var(--foreground); }
        .nu-close { width: 32px; height: 32px; border-radius: 9px; border: 1px solid var(--border); background: transparent; color: var(--muted); font-size: 20px; line-height: 1; cursor: pointer; flex-shrink: 0; }
        .nu-close:hover { color: var(--foreground); }
        .nu-sec-title { font-size: 13px; font-weight: 700; color: var(--foreground); text-transform: uppercase; letter-spacing: .05em; margin-top: 6px; }
        .nu-ing-list { display: flex; flex-direction: column; }
        .nu-ing { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 15px; color: var(--foreground); }
        .nu-ing:last-child { border-bottom: none; }
        .nu-ing .muted { color: var(--muted); }
        .nu-steps { display: flex; flex-direction: column; gap: 9px; padding-left: 20px; font-size: 15.5px; line-height: 1.6; color: var(--foreground); }
        .nu-modal-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
        .nu-kitchen { font-size: 15px; }
        .nu-remove { padding: 12px 18px; border-radius: 12px; border: 1px solid var(--red); background: transparent; color: var(--red); font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; transition: all .15s; }
        .nu-remove:hover { background: color-mix(in srgb, var(--red) 14%, transparent); }

        /* Слайдеры предпочтений */
        .nu-slider-row { display: flex; align-items: center; gap: 14px; }
        .nu-slider-row input[type=range] { flex: 1; accent-color: var(--accent); height: 4px; }
        .nu-slider-val { font-size: 13px; color: var(--muted); min-width: 130px; text-align: right; }
        .nu-foods { display: flex; flex-wrap: wrap; gap: 8px; }
        .nu-food { padding: 9px 13px; border-radius: 11px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--foreground); font-family: inherit; font-size: 13.5px; cursor: pointer; transition: all .15s; }
        .nu-food b { font-weight: 700; margin-left: 4px; }
        .nu-food.yes { border-color: color-mix(in srgb, var(--green) 50%, transparent); }
        .nu-food.yes b { color: var(--green); }
        .nu-food.no { opacity: .6; }
        .nu-food.no b { color: var(--red); }
        .nu-chip { padding: 8px 13px; border-radius: 20px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--muted); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
        .nu-chip.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }

        /* Оценка */
        .nu-rate { width: 100%; max-width: 440px; display: flex; flex-direction: column; gap: 12px; text-align: center; }
        .nu-rate-meal { font-size: 13px; }
        .nu-rate h3 { font-size: 20px; font-weight: 700; color: var(--foreground); }
        .nu-rate-text { width: 100%; resize: none; text-align: left; }
        .nu-rate-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .nu-rate-up, .nu-rate-down { padding: 13px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--foreground); font-family: inherit; font-size: 14.5px; font-weight: 700; cursor: pointer; transition: all .15s; }
        .nu-rate-up:hover { border-color: var(--green); background: color-mix(in srgb, var(--green) 16%, transparent); }
        .nu-rate-down:hover { border-color: var(--orange); background: color-mix(in srgb, var(--orange) 16%, transparent); }
        .nu-rate-later { background: transparent; border: none; color: var(--muted); font-family: inherit; font-size: 13px; cursor: pointer; padding: 4px; }
        .nu-rate-later:hover { color: var(--foreground); }

        .nu-toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); z-index: 600; background: var(--bg-card); border: 1px solid var(--accent); color: var(--foreground); padding: 13px 20px; border-radius: 12px; font-size: 14px; font-weight: 600; box-shadow: 0 8px 28px rgba(0,0,0,.4); }

        @media (max-width: 900px) {
          .nu-macros, .nu-fields { grid-template-columns: repeat(2, 1fr); }
          .nu-slots { grid-template-columns: repeat(2, 1fr); }
          .nu-week { gap: 5px; }
          .nu-day { padding: 10px 2px 8px; }
        }
      `}</style>
    </div>
  )
}
