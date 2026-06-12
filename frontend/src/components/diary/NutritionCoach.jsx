import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useT, useLang } from '../../context/LanguageContext.jsx'
import { useAiSummary } from '../../hooks/useAiSummary.js'
import { useCurrentMeal } from '../../hooks/useCurrentMeal.js'
import { nutritionHealthBrief } from '../../utils/siteSnapshot.js'

/*
  Помощник по питанию в разделе «Питание». Полностью самодостаточная карточка: НЕ наследует
  общий класс .card (чтобы не зависеть от стилей материала/прошивки) и задаёт ВСЕ цвета с
  хардкод-фолбэками — поэтому не может отрендериться пустой/невидимой ни при каком состоянии
  токенов. Контент есть ВСЕГДА: совет ИИ → иначе «Думаю…» → иначе фактическая сводка по дню.
  Приём пищи определяется по времени и обновляется живьём (useCurrentMeal).
*/

const MEAL_EN = { 'Завтрак': 'Breakfast', 'Обед': 'Lunch', 'Перекус': 'Snack', 'Ужин': 'Dinner' }

const COACH_CONTEXT =
  'Ты помощник по питанию владельца (триатлет, следит за здоровьем и формой). По его данным дай РОВНО ' +
  'две короткие фразы, каждая с новой строки: (1) общий статус питания за сегодня — сколько съедено и ' +
  'осталось, чего не хватает (белок/калории), в графике ли по цели; (2) конкретный совет к ближайшему ' +
  'приёму — что съесть сейчас с учётом остатка КБЖУ и состояния (анализы/тренировка/восстановление/стресс). ' +
  'По делу, без вступлений и markdown, не паниковать.'

export default function NutritionCoach({ target, eaten = 0, remaining = 0, intake, selectedDay }) {
  const { lang } = useLang()
  const t = useT({
    ru: { title: 'Помощник по питанию', think: 'Думаю…' },
    en: { title: 'Nutrition coach', think: 'Thinking…' },
  })
  const meal = useCurrentMeal()
  const mealName = lang === 'en' ? (MEAL_EN[meal] || meal) : meal

  const rec = intake?.[selectedDay]
  const tracked = !!rec && (rec.source === 'photo' || rec.source === 'calai' || rec.source === 'manual')
  const eP = tracked ? (rec.protein || 0) : 0
  const eF = tracked ? (rec.fat || 0) : 0
  const eC = tracked ? (rec.carb || 0) : 0

  const snapshot = [
    `Ближайший приём: ${meal}.`,
    `Цель на день: ${target?.kcal ?? '?'} ккал (белок ${target?.protein ?? '?'} г, жиры ${target?.fat ?? '?'} г, углеводы ${target?.carb ?? '?'} г).`,
    `Съедено сегодня: ${Math.round(eaten)} ккал (белок ${eP} г, жиры ${eF} г, углеводы ${eC} г). Осталось: ${Math.round(remaining)} ккал.`,
    nutritionHealthBrief()
  ].join('\n')

  const summary = useAiSummary({
    id: 'nutrition-coach',
    context: COACH_CONTEXT + (lang === 'en' ? ' Reply in English.' : ''),
    snapshot,
    message: 'Статус питания за сегодня и совет к ближайшему приёму.',
    fallback: ''
  })

  // Контент ВСЕГДА непустой: совет ИИ → «Думаю…» → фактическая сводка по данным дня.
  const advice = (summary.text || '').trim()
  const eatenR = Math.round(eaten)
  const remR = Math.round(remaining)
  const kcalGoal = target?.kcal ?? '?'
  const protGoal = target?.protein ?? '?'
  const dataFallback = lang === 'en'
    ? (eatenR < 30
      ? `Nothing logged yet today. Goal — ${kcalGoal} kcal and ${protGoal} g protein. Next meal — ${(MEAL_EN[meal] || meal).toLowerCase()}.`
      : `Eaten ~${eatenR} of ${kcalGoal} kcal, ~${remR} left. Protein ${eP}/${protGoal} g. Next meal — ${(MEAL_EN[meal] || meal).toLowerCase()}.`)
    : (eatenR < 30
      ? `Сегодня пока ничего не записано. Цель — ${kcalGoal} ккал и ${protGoal} г белка. Ближайший приём — ${mealName.toLowerCase()}.`
      : `Съедено ~${eatenR} из ${kcalGoal} ккал, осталось ~${remR}. Белок ${eP}/${protGoal} г. Ближайший приём — ${mealName.toLowerCase()}.`)
  const body = advice || (summary.loading ? t.think : dataFallback)

  return (
    <motion.div className="nutri-coach" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="nuc-head">
        <span className="nuc-badge"><Sparkles size={15} strokeWidth={1.9} /> {t.title}</span>
        <span className="nuc-meal">{mealName}</span>
      </div>
      <p className="nuc-text">{body}</p>
      <style>{`
        .nutri-coach {
          display: flex; flex-direction: column; gap: 9px;
          padding: 16px 18px;
          border-radius: var(--radius, 18px);
          background: var(--bg-surface, #1B2027);
          border: 1px solid var(--border-med, #2C333C);
          box-shadow: var(--shadow-card, 0 4px 16px rgba(0,0,0,0.25));
        }
        .nuc-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .nuc-badge {
          display: inline-flex; align-items: center; gap: 7px;
          font-size: 14px; font-weight: 700; color: var(--accent, #6E8CA8);
        }
        .nuc-meal {
          font-size: 11px; font-weight: 700; color: var(--text-secondary, #9AA3AF);
          text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap;
        }
        .nuc-text {
          font-size: 13.5px; line-height: 1.55; color: var(--text-body, #DDE1E6);
          white-space: pre-line; min-height: 19px;
        }
      `}</style>
    </motion.div>
  )
}
