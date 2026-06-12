import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useT, useLang } from '../../context/LanguageContext.jsx'
import { useAiSummary } from '../../hooks/useAiSummary.js'
import { useCurrentMeal } from '../../hooks/useCurrentMeal.js'
import { nutritionHealthBrief } from '../../utils/siteSnapshot.js'

/*
  Окно-советник в разделе «Питание»: ИИ советует, что есть сегодня в целом + конкретно к ближайшему
  приёму, с учётом уже съеденного (фото-дневник) и состояния (анализы/тренировка/восстановление/стресс).
  Приём определяется по времени суток и обновляется живьём (useCurrentMeal). Снимок для кэша — без
  точного времени, поэтому ИИ перегенерируется при логе еды или смене приёма, а не каждую минуту.
*/

const MEAL_EN = { 'Завтрак': 'Breakfast', 'Обед': 'Lunch', 'Перекус': 'Snack', 'Ужин': 'Dinner' }

const ADVISOR_CONTEXT =
  'Ты советник по питанию владельца (триатлет, следит за здоровьем и формой). По его данным дай РОВНО ' +
  'две короткие фразы, каждая с новой строки: (1) общий статус питания за сегодня — сколько съедено и ' +
  'осталось, чего не хватает (белок/калории), в графике ли по цели; (2) конкретный совет к ближайшему ' +
  'приёму — что съесть сейчас с учётом остатка КБЖУ и состояния (анализы/тренировка/восстановление/стресс). ' +
  'По делу, без вступлений и markdown, не паниковать.'

export default function MealAdvisor({ target, eaten = 0, remaining = 0, intake, selectedDay }) {
  const { lang } = useLang()
  const t = useT({
    ru: { label: 'Советник', loading: 'Думаю…', empty: 'Подключите ИИ для совета' },
    en: { label: 'Advisor', loading: 'Thinking…', empty: 'Connect AI for advice' },
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
    id: 'meal-advisor',
    context: ADVISOR_CONTEXT + (lang === 'en' ? ' Reply in English.' : ''),
    snapshot,
    message: 'Статус питания за сегодня и совет к ближайшему приёму.',
    fallback: ''
  })

  // Советник ВСЕГДА виден и не пустует: пока ИИ думает — «Думаю…»; если ИИ недоступен
  // (бэкенд недоступен / демо-лимит у гостя / ошибка) — показываем фактическую сводку по
  // данным дня вместо исчезновения. Так карточка не блёкнет в пустоту и не пропадает.
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
  const body = advice || (summary.loading ? t.loading : dataFallback)

  return (
    <motion.div className="card meal-advisor" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="adv-top">
        <span className="adv-label"><Sparkles size={15} strokeWidth={1.8} /> {t.label}</span>
        <span className="adv-meal">{mealName}</span>
      </div>
      <p className={`adv-text ${!advice && summary.loading ? 'muted' : ''}`}>{body}</p>
      <style>{`
        .meal-advisor { display: flex; flex-direction: column; gap: 10px; }
        .adv-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .adv-label { display: inline-flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 700; color: var(--accent); }
        .adv-meal { font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; }
        .adv-text { font-size: 13.5px; line-height: 1.55; color: var(--text-body); white-space: pre-line; }
      `}</style>
    </motion.div>
  )
}
