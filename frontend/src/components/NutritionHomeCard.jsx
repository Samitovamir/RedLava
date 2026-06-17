import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useT, useLang } from '../context/LanguageContext.jsx'
import { useAiSummary } from '../hooks/useAiSummary.js'
import { useSiteSnapshot } from '../hooks/useSiteSnapshot.js'
import { loadProfile, computeTarget, mealTarget, loadPrefs, MEALS, nutritionToday } from '../utils/nutrition.js'
import { nutritionHealthBrief } from '../utils/siteSnapshot.js'
import { mskDateKey } from '../utils/time.js'
import { useCurrentMeal } from '../hooks/useCurrentMeal.js'

/*
  Окно «Питание» на Главной: обзор диеты + ОДНО блюдо под ТЕКУЩИЙ приём пищи (с учётом всех
  данных через nutritionHealthBrief). Тап по блюду / «другие блюда» → раздел «Питание» с
  автоподбором (там полное окно с несколькими блюдами и детали с рецептом/«в меню»).
  Подобранное блюдо кэшируется в localStorage в пределах текущего приёма дня (без лишних запросов).
*/

const HOME_DISH_KEY = 'albert-home-dish'
const HOME_RECENT_KEY = 'albert-home-recent'   // недавние блюда — чтобы не повторять (не «всегда курица»)
const MEAL_EN = { 'Завтрак': 'Breakfast', 'Обед': 'Lunch', 'Перекус': 'Snack', 'Ужин': 'Dinner' }

const NUT_CONTEXT =
  'Ты помощник владельца по питанию. По его данным (цель КБЖУ, тренировки, восстановление, анализы) ' +
  'дай РОВНО две короткие фразы, каждая с новой строки: (1) общий обзор его диеты сейчас; (2) с учётом ' +
  'сегодняшнего дня (тренировки/восстановление/анализы) — какой акцент в еде сегодня уместен. ' +
  'Без markdown, без списков, кратко.'

export default function NutritionHomeCard() {
  const navigate = useNavigate()
  const { lang } = useLang()
  const t = useT({
    ru: { label: 'Питание', loading: 'Подбираю блюдо…', empty: 'Подключите ИИ для подбора блюд', more: 'Посмотреть другие блюда', kcal: 'ккал' },
    en: { label: 'Nutrition', loading: 'Finding a dish…', empty: 'Connect AI to suggest dishes', more: 'See other dishes', kcal: 'kcal' },
  })
  const snapshot = useSiteSnapshot()
  const mealType = useCurrentMeal()
  const mealName = lang === 'en' ? (MEAL_EN[mealType] || mealType) : mealType

  const [dish, setDish] = useState(null)
  const [image, setImage] = useState(null)
  const [loading, setLoading] = useState(true)

  const summary = useAiSummary({
    id: 'nutrition-home',
    context: NUT_CONTEXT + (lang === 'en' ? ' Reply in English.' : ''),
    snapshot,
    message: 'Две короткие фразы: обзор диеты и акцент еды на сегодня.',
    fallback: ''
  })

  useEffect(() => {
    let cancelled = false
    // Учитываем уже съеденное: остаток дня входит в ключ кэша (грубо, по 250 ккал), чтобы
    // после логирования еды блюдо переподобралось под остаток, а не висело прежним.
    const today = nutritionToday()
    const remBucket = today.hasData ? Math.round(today.remaining / 250) : 'x'
    const cacheKey = `${mskDateKey()}:${mealType}:${remBucket}`
    try {
      const c = JSON.parse(localStorage.getItem(HOME_DISH_KEY) || 'null')
      if (c && c.key === cacheKey && c.dish) { setDish(c.dish); setImage(c.image || null); setLoading(false); return }
    } catch { /* ignore */ }

    setLoading(true)
    ;(async () => {
      try {
        const prefs = loadPrefs()
        const tgt = today.hasData ? today.target : computeTarget(loadProfile())
        const share = (MEALS.find(m => m.key === mealType)?.share) ?? 0.3
        const baseMeal = mealTarget(tgt, share)
        // «Держим в голове» съеденное: если на день уже что-то залогировано — размер блюда
        // вписываем в ОСТАТОК (не фиксированная доля), чтобы не предлагать сверх нормы.
        let pm = baseMeal
        let eatenNote = ''
        if (today.hasData && today.eaten > 30) {
          const capKcal = Math.max(150, Math.min(baseMeal.kcal, today.remaining))
          const f = baseMeal.kcal > 0 ? capKcal / baseMeal.kcal : 1
          pm = { kcal: Math.round(capKcal), protein: Math.round(baseMeal.protein * f), fat: Math.round(baseMeal.fat * f), carb: Math.round(baseMeal.carb * f) }
          eatenNote = ` Сегодня уже съедено ~${today.eaten} из ${today.target.kcal} ккал, осталось ~${today.remaining} ккал — блюдо должно вписаться в остаток и помочь добрать белок.`
        }
        let recent = []
        try { recent = JSON.parse(localStorage.getItem(HOME_RECENT_KEY) || '[]') } catch { /* ignore */ }
        const res = await fetch('/api/nutrition/meals', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target: pm, mealType, prefs, count: 1, components: ['Основное'],
            health: nutritionHealthBrief(),
            exclude: recent,
            note: 'Чередуй блюда и источники белка ото дня ко дню (рыба, индейка, бобовые, яйца, морепродукты, нежирная говядина) — не предлагай каждый раз курицу.' + eatenNote
          })
        })
        const data = await res.json()
        const d = (data.meals && data.meals[0]) || null
        if (cancelled) return
        setDish(d); setLoading(false)
        // Запоминаем показанное блюдо, чтобы в следующие дни не повторять (скользящее окно из 8)
        if (d?.name) {
          try { localStorage.setItem(HOME_RECENT_KEY, JSON.stringify([d.name, ...recent.filter(n => n !== d.name)].slice(0, 8))) } catch { /* ignore */ }
        }
        let img = null
        if (d) {
          try {
            const ir = await fetch('/api/nutrition/images', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items: [{ name: d.name, query: d.imageQuery || d.name }] })
            })
            const idata = await ir.json()
            img = (idata.images && idata.images[d.name]) || null
            if (!cancelled) setImage(img)
          } catch { /* ignore */ }
        }
        try { localStorage.setItem(HOME_DISH_KEY, JSON.stringify({ key: cacheKey, dish: d, image: img })) } catch { /* ignore */ }
      } catch { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [mealType])

  // «Другие блюда» → раздел с окном подбора (несколько блюд). Тап по блюду →
  // именно ЭТО блюдо: открываем его детали (рецепт/«в меню») в разделе питания.
  const open = () => navigate('/nutrition', { state: { autoSuggest: mealType } })
  const openDish = () => dish && navigate('/nutrition', { state: { openDish: dish, openImage: image, mealType } })

  return (
    <motion.div className="card nutrition-home" whileHover={{ y: -3 }}>
      <div className="nh-top">
        <span className="nh-label">{t.label}</span>
        <span className="nh-meal">{mealName}</span>
      </div>

      {summary.text && <p className="nh-overview">{summary.text}</p>}

      {dish ? (
        <button className="nh-dish" onClick={openDish}>
          {image?.url && <span className="nh-dish-img" style={{ backgroundImage: `url(${image.url})` }} />}
          <span className="nh-dish-body">
            <span className="nh-dish-name">{dish.name}</span>
            <span className="nh-dish-macros">{dish.kcal} {t.kcal} · Б {dish.protein} · Ж {dish.fat} · У {dish.carb}</span>
          </span>
        </button>
      ) : (
        <div className="nh-empty">{loading ? t.loading : t.empty}</div>
      )}

      <button className="nh-more" onClick={open}>{t.more} →</button>

      <style>{`
        .nutrition-home { display: flex; flex-direction: column; gap: 12px; }
        .nh-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
        .nh-label { font-size: 15px; font-weight: 600; color: var(--muted-foreground); }
        .nh-meal { font-size: 11px; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.06em; }
        .nh-overview { font-size: 13.5px; line-height: 1.55; color: var(--text-muted); white-space: pre-line; }
        .nh-dish {
          display: flex; align-items: center; gap: 14px; text-align: left; width: 100%;
          padding: 12px 14px; border-radius: var(--radius-md);
          background: var(--bg-tile); border: 1px solid var(--border-med);
          cursor: pointer; font-family: inherit; transition: border-color 0.15s var(--ease);
        }
        .nh-dish:hover { border-color: var(--accent); }
        .nh-dish-img {
          width: 64px; height: 64px; flex-shrink: 0; border-radius: 12px;
          background-size: cover; background-position: center; background-color: var(--bg-secondary);
        }
        .nh-dish-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .nh-dish-name { font-size: 16px; font-weight: 700; color: var(--text-primary); overflow-wrap: anywhere; }
        .nh-dish-macros { font-size: 12.5px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
        .nh-empty {
          font-size: 14px; color: var(--text-muted); padding: 14px;
          background: var(--bg-tile); border: 1px solid var(--border-med); border-radius: var(--radius-md);
        }
        .nh-more {
          align-self: flex-start; border: none; background: none; cursor: pointer; font-family: inherit;
          font-size: 13.5px; font-weight: 600; color: var(--accent); padding: 2px 0;
        }
        .nh-more:hover { text-decoration: underline; }
      `}</style>
    </motion.div>
  )
}
