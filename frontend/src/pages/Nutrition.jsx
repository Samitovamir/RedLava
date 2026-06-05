import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import MicButton from '../components/MicButton.jsx'
import {
  loadProfile, saveProfile, computeTarget, ACTIVITY_LEVELS, GOALS,
  MEAL_SHARES, mealTarget, loadTaste, saveTaste,
  loadShopping, saveShopping, addToShopping
} from '../utils/nutrition.js'

// Маленькая карточка макроса
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
  const target = useMemo(() => computeTarget(profile), [profile])

  const [mealType, setMealType] = useState('Обед')
  const [note, setNote] = useState('')
  const [meals, setMeals] = useState([])
  const [mealsMsg, setMealsMsg] = useState('')
  const [loadingMeals, setLoadingMeals] = useState(false)
  const [taste, setTaste] = useState(loadTaste)
  const [shopping, setShopping] = useState(loadShopping)

  // Рецепт
  const [recipeFor, setRecipeFor] = useState(null)   // имя блюда
  const [recipe, setRecipe] = useState(null)
  const [recipeLoading, setRecipeLoading] = useState(false)
  const [addedNote, setAddedNote] = useState('')

  function updateProfile(field, value) {
    const next = { ...profile, [field]: value }
    setProfile(next); saveProfile(next)
  }

  const mtShare = MEAL_SHARES.find(m => m.key === mealType)?.share ?? 0.33
  const perMeal = mealTarget(target, mtShare)

  async function suggestMeals() {
    setLoadingMeals(true); setMeals([]); setMealsMsg('')
    try {
      const res = await fetch('/api/nutrition/meals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: perMeal, mealType, likes: taste.likes, dislikes: taste.dislikes, count: 5, note })
      })
      const data = await res.json()
      setMeals(data.meals || [])
      if ((!data.meals || !data.meals.length) && data.message) setMealsMsg(data.message)
    } catch { setMeals([]); setMealsMsg('Нет связи с сервером. Запустите backend с ключом ИИ.') }
    setLoadingMeals(false)
  }

  function setLike(meal, liked) {
    const name = meal.name
    const likes = new Set(taste.likes), dislikes = new Set(taste.dislikes)
    if (liked) { likes.add(name); dislikes.delete(name) }
    else { dislikes.add(name); likes.delete(name) }
    const next = { likes: [...likes], dislikes: [...dislikes] }
    setTaste(next); saveTaste(next)
  }
  const likeState = name => taste.likes.includes(name) ? 'like' : taste.dislikes.includes(name) ? 'dislike' : null

  async function openRecipe(meal) {
    setRecipeFor(meal.name); setRecipe(null); setRecipeLoading(true); setAddedNote('')
    try {
      const res = await fetch('/api/nutrition/recipe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dish: meal.name, servings: 1 })
      })
      const data = await res.json()
      setRecipe(data.recipe || null)
    } catch { setRecipe(null) }
    setRecipeLoading(false)
  }

  function addRecipeToShopping() {
    if (!recipe?.ingredients?.length) return
    const next = addToShopping(shopping, recipe.ingredients, recipe.name)
    setShopping(next); saveShopping(next)
    setAddedNote('Ингредиенты добавлены в список покупок ✓')
  }
  function removeShoppingItem(idx) {
    const next = { ...shopping, items: shopping.items.filter((_, i) => i !== idx) }
    setShopping(next); saveShopping(next)
  }
  function clearShopping() {
    const next = { weekStart: shopping.weekStart, items: [] }
    setShopping(next); saveShopping(next)
  }

  return (
    <div className="nu-page">
      <div className="page-header">
        <h2>Питание</h2>
        <span className="muted">Цель КБЖУ · блюда · покупки</span>
      </div>

      {/* Профиль + цель */}
      <motion.div className="card nu-target" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <div className="nu-head">
          <div className="card-title" style={{ margin: 0 }}>Целевое КБЖУ на день</div>
          <button className="nu-edit" onClick={() => setEditProfile(e => !e)}>{editProfile ? 'Готово' : 'Изменить профиль'}</button>
        </div>

        <div className="nu-macros">
          <Macro value={target.kcal} unit="ккал" label="Калории" color="var(--orange)" />
          <Macro value={target.protein} unit="г" label="Белки" color="var(--green)" />
          <Macro value={target.fat} unit="г" label="Жиры" color="var(--yellow)" />
          <Macro value={target.carb} unit="г" label="Углеводы" color="var(--accent)" />
        </div>
        <div className="nu-target-hint muted">
          Обмен покоя ~{target.bmr} ккал · с активностью ~{target.tdee} ккал · цель: {GOALS.find(g => g.key === profile.goal)?.label.toLowerCase()}
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

      {/* Подбор блюд */}
      <motion.div className="card nu-meals" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="card-title">Подбор блюд под цель</div>
        <div className="nu-meal-controls">
          <div className="nu-seg">
            {MEAL_SHARES.map(m => (
              <button key={m.key} className={`nu-seg-btn ${mealType === m.key ? 'active' : ''}`}
                onClick={() => setMealType(m.key)}>{m.key}</button>
            ))}
          </div>
          <span className="nu-permeal muted">≈ {perMeal.kcal} ккал · Б{perMeal.protein} Ж{perMeal.fat} У{perMeal.carb}</span>
        </div>
        <div className="nu-note-row">
          <input className="nu-note" placeholder="Пожелание к подбору (необязательно): например «без свинины», «побольше рыбы»"
            value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') suggestMeals() }} />
          <MicButton primary onText={t => setNote(prev => (prev ? prev.trim() + ' ' : '') + t)} />
          <button className="nu-suggest" onClick={suggestMeals} disabled={loadingMeals}>
            {loadingMeals ? 'Подбираю…' : 'Подобрать блюда'}
          </button>
        </div>

        {meals.length > 0 && (
          <div className="nu-meal-list">
            {meals.map((m, i) => {
              const st = likeState(m.name)
              return (
                <motion.div key={`${m.name}-${i}`} className="nu-meal-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <div className="nu-meal-top">
                    <div className="nu-meal-name">{m.name}</div>
                    <div className="nu-like-row">
                      <button className={`nu-like ${st === 'like' ? 'on' : ''}`} onClick={() => setLike(m, true)} aria-label="Нравится" title="Нравится">👍</button>
                      <button className={`nu-like ${st === 'dislike' ? 'on dislike' : ''}`} onClick={() => setLike(m, false)} aria-label="Не нравится" title="Не нравится">👎</button>
                    </div>
                  </div>
                  {m.short && <div className="nu-meal-short muted">{m.short}</div>}
                  <div className="nu-meal-macros">
                    <span style={{ color: 'var(--orange)' }}>{m.kcal} ккал</span>
                    <span>Б {m.protein}</span><span>Ж {m.fat}</span><span>У {m.carb}</span>
                  </div>
                  {m.tags?.length > 0 && <div className="nu-tags">{m.tags.map(t => <span key={t} className="nu-tag">{t}</span>)}</div>}
                  <button className="nu-recipe-btn" onClick={() => openRecipe(m)}>Рецепт и ингредиенты →</button>
                </motion.div>
              )
            })}
          </div>
        )}
        {!loadingMeals && meals.length === 0 && (
          <div className="nu-empty muted">{mealsMsg || 'Выберите приём пищи и нажмите «Подобрать блюда» — ИИ предложит варианты под вашу цель и вкусы.'}</div>
        )}
      </motion.div>

      {/* Список покупок */}
      <motion.div className="card nu-shop" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="nu-head">
          <div className="card-title" style={{ margin: 0 }}>Список покупок на неделю</div>
          {shopping.items.length > 0 && <button className="nu-edit" onClick={clearShopping}>Очистить</button>}
        </div>
        {shopping.items.length === 0 ? (
          <div className="nu-empty muted">Пусто. Открой рецепт блюда и добавь ингредиенты — они будут копиться здесь всю неделю.</div>
        ) : (
          <>
            <div className="nu-shop-list">
              {shopping.items.map((it, i) => (
                <div key={i} className="nu-shop-item">
                  <span className="nu-shop-name">{it.name}</span>
                  <span className="nu-shop-qty muted">{it.qty != null ? `${it.qty} ${it.unit || ''}` : (it.unit || '')}</span>
                  <button className="nu-shop-del" onClick={() => removeShoppingItem(i)} title="Убрать">×</button>
                </div>
              ))}
            </div>
            <button className="nu-send" disabled title="Появится, когда подключим отправку сообщений">
              Отправить водителю (скоро)
            </button>
          </>
        )}
      </motion.div>

      {/* Модалка рецепта */}
      <AnimatePresence>
        {recipeFor && (
          <div className="nu-backdrop" onClick={() => setRecipeFor(null)}>
            <motion.div className="card nu-modal" onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
              <div className="nu-modal-head">
                <h3>{recipeFor}</h3>
                <button className="nu-close" onClick={() => setRecipeFor(null)} aria-label="Закрыть">×</button>
              </div>
              {recipeLoading ? (
                <div className="nu-empty muted">ИИ собирает рецепт…</div>
              ) : recipe ? (
                <>
                  <div className="nu-meal-macros">
                    {recipe.kcal != null && <span style={{ color: 'var(--orange)' }}>{recipe.kcal} ккал</span>}
                    {recipe.protein != null && <span>Б {recipe.protein}</span>}
                    {recipe.fat != null && <span>Ж {recipe.fat}</span>}
                    {recipe.carb != null && <span>У {recipe.carb}</span>}
                  </div>
                  <div className="nu-sec-title">Ингредиенты</div>
                  <div className="nu-ing-list">
                    {(recipe.ingredients || []).map((ing, i) => (
                      <div key={i} className="nu-ing">
                        <span>{ing.name}</span>
                        <span className="muted">{ing.qty != null ? `${ing.qty} ${ing.unit || ''}` : (ing.unit || '')}</span>
                      </div>
                    ))}
                  </div>
                  <div className="nu-sec-title">Приготовление</div>
                  <ol className="nu-steps">
                    {(recipe.steps || []).map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                  {addedNote && <div className="nu-added">{addedNote}</div>}
                  <div className="nu-modal-actions">
                    <button className="nu-suggest" onClick={addRecipeToShopping}>В список покупок</button>
                    <button className="nu-send" disabled title="Появится с отправкой сообщений">Отправить домработнице (скоро)</button>
                  </div>
                </>
              ) : (
                <div className="nu-empty muted">Не удалось получить рецепт. Проверьте, что backend запущен с ключом ИИ.</div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .nu-page { display: flex; flex-direction: column; gap: 18px; max-width: 1400px; padding-bottom: 24px; }
        .page-header { display: flex; align-items: baseline; gap: 12px; }
        .page-header h2 { font-size: 24px; font-weight: 700; color: var(--foreground); }
        .muted { color: var(--muted-foreground); }
        .card-title { font-size: 16px; font-weight: 700; color: var(--foreground); margin-bottom: 12px; }

        .nu-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
        .nu-edit { padding: 7px 13px; border-radius: 10px; border: 1px solid var(--border); background: transparent; color: var(--muted); font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
        .nu-edit:hover { color: var(--foreground); border-color: var(--border-hover); }

        .nu-macros { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .nu-macro { display: flex; flex-direction: column; gap: 4px; background: var(--bg-secondary); border-radius: 14px; padding: 16px 18px; }
        .nu-macro-val { font-size: 26px; font-weight: 800; }
        .nu-macro-unit { font-size: 13px; font-weight: 500; }
        .nu-macro-lbl { font-size: 12px; }
        .nu-target-hint { font-size: 13.5px; margin-top: 10px; color: var(--muted); }

        .nu-profile { overflow: hidden; }
        .nu-fields { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 16px; }
        .nu-field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--muted); }
        .nu-field input, .nu-field select {
          background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 10px;
          padding: 10px 12px; font-family: inherit; font-size: 14px; color: var(--foreground); outline: none;
        }
        .nu-field input:focus, .nu-field select:focus { border-color: var(--accent); }
        .nu-seg-row { display: flex; align-items: center; gap: 12px; margin-top: 14px; flex-wrap: wrap; }
        .nu-seg-lbl { font-size: 12px; min-width: 80px; }
        .nu-seg { display: inline-flex; flex-wrap: wrap; gap: 4px; background: var(--bg-secondary); padding: 4px; border-radius: 12px; }
        .nu-seg-btn { padding: 8px 13px; border: none; background: transparent; color: var(--muted-foreground); font-family: inherit; font-size: 13px; font-weight: 600; border-radius: 9px; cursor: pointer; transition: all .15s; }
        .nu-seg-btn:hover { color: var(--foreground); }
        .nu-seg-btn.active { background: var(--card); color: var(--accent); box-shadow: 0 2px 8px rgba(0,0,0,.25); }

        .nu-meal-controls { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; }
        .nu-permeal { font-size: 13px; }
        .nu-note-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .nu-note { flex: 1; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; font-family: inherit; font-size: 14px; color: var(--foreground); outline: none; }
        .nu-note:focus { border-color: var(--accent); }
        .nu-note::placeholder { color: var(--muted-foreground); }
        .nu-suggest { flex-shrink: 0; padding: 12px 18px; border-radius: 12px; border: none; background: var(--accent); color: var(--accent-foreground); font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; transition: opacity .15s; }
        .nu-suggest:hover:not(:disabled) { opacity: .9; }
        .nu-suggest:disabled { opacity: .5; cursor: default; }

        .nu-meal-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
        .nu-meal-card { display: flex; flex-direction: column; gap: 8px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 14px; padding: 16px; }
        .nu-meal-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .nu-meal-name { font-size: 15.5px; font-weight: 700; color: var(--foreground); }
        .nu-like-row { display: flex; gap: 6px; flex-shrink: 0; }
        .nu-like { width: 40px; height: 40px; border-radius: 10px; border: 1px solid var(--border); background: var(--card); cursor: pointer; font-size: 19px; transition: all .15s; opacity: .8; }
        .nu-like:hover { opacity: 1; border-color: var(--border-hover); transform: scale(1.05); }
        .nu-like.on { opacity: 1; border-color: var(--green); background: color-mix(in srgb, var(--green) 20%, transparent); }
        .nu-like.on.dislike { border-color: var(--red); background: color-mix(in srgb, var(--red) 20%, transparent); }
        .nu-meal-short { font-size: 14px; line-height: 1.55; color: var(--muted); }
        .nu-meal-macros { display: flex; flex-wrap: wrap; gap: 12px; font-size: 14px; color: var(--muted); font-weight: 600; }
        .nu-tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .nu-tag { font-size: 11px; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); padding: 3px 9px; border-radius: 20px; }
        .nu-recipe-btn { margin-top: 4px; align-self: flex-start; background: transparent; border: none; color: var(--accent); font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; padding: 0; }
        .nu-recipe-btn:hover { text-decoration: underline; }
        .nu-empty { font-size: 14px; padding: 6px 0; line-height: 1.5; }

        .nu-shop-list { display: flex; flex-direction: column; }
        .nu-shop-item { display: grid; grid-template-columns: 1fr auto 28px; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--border); }
        .nu-shop-item:last-child { border-bottom: none; }
        .nu-shop-name { font-size: 14.5px; color: var(--foreground); }
        .nu-shop-qty { font-size: 13px; white-space: nowrap; }
        .nu-shop-del { width: 26px; height: 26px; border-radius: 7px; border: 1px solid var(--border); background: transparent; color: var(--muted); cursor: pointer; font-size: 16px; line-height: 1; transition: all .15s; }
        .nu-shop-del:hover { color: var(--red); border-color: var(--red); }
        .nu-send { margin-top: 14px; padding: 12px 18px; border-radius: 12px; border: 1px dashed var(--border); background: transparent; color: var(--muted); font-family: inherit; font-size: 14px; font-weight: 600; cursor: not-allowed; opacity: .65; }

        .nu-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.55); backdrop-filter: blur(3px); z-index: 500; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .nu-modal { width: 100%; max-width: 540px; max-height: 86vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
        .nu-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .nu-modal-head h3 { font-size: 19px; font-weight: 700; color: var(--foreground); }
        .nu-close { width: 32px; height: 32px; border-radius: 9px; border: 1px solid var(--border); background: transparent; color: var(--muted); font-size: 20px; line-height: 1; cursor: pointer; flex-shrink: 0; }
        .nu-close:hover { color: var(--foreground); }
        .nu-sec-title { font-size: 13px; font-weight: 700; color: var(--foreground); text-transform: uppercase; letter-spacing: .05em; margin-top: 6px; }
        .nu-ing-list { display: flex; flex-direction: column; }
        .nu-ing { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 15px; color: var(--foreground); }
        .nu-ing:last-child { border-bottom: none; }
        .nu-ing .muted { color: var(--muted); }
        .nu-steps { display: flex; flex-direction: column; gap: 9px; padding-left: 20px; font-size: 15.5px; line-height: 1.6; color: var(--foreground); }
        .nu-added { font-size: 13.5px; color: var(--green); font-weight: 600; }
        .nu-modal-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; }

        @media (max-width: 900px) {
          .nu-macros, .nu-fields { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  )
}
