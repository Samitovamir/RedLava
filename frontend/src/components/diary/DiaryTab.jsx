import { motion } from 'framer-motion'
import { Camera } from 'lucide-react'
import { useT } from '../../context/LanguageContext.jsx'

/*
  Вкладка «Дневник» раздела «Питание» — фотолог (свой CalAI):
  кольцо «съедено/цель» + плитки Б/Ж/У + лента «съедено сегодня» с фото + захват (фото/штрих-код/
  этикетка/сохранённые). Получает общее состояние пропсами от Nutrition.jsx (intake/plan/target/
  selectedDay) — единый источник истины с вкладкой «Меню».
  ШАГ 1: каркас-плейсхолдер; ядро (кольцо/лента/камера) добавляется следующими шагами.
*/
export default function DiaryTab(/* { target, eaten, plan, intake, setIntake, selectedDay, profile, flash } */) {
  const t = useT({
    ru: { soon: 'Фотолог питания скоро здесь', hint: 'Сфотографируй еду — ИИ посчитает КБЖУ с учётом твоих данных' },
    en: { soon: 'Photo food log coming here', hint: 'Photograph your food — AI estimates calories using your data' },
  })
  return (
    <motion.div className="nu-diary" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="nu-diary-stub card">
        <span className="nu-diary-stub-ic"><Camera size={30} strokeWidth={1.5} /></span>
        <div className="nu-diary-stub-title">{t.soon}</div>
        <div className="nu-diary-stub-text muted">{t.hint}</div>
      </div>
      <style>{`
        .nu-diary { display: flex; flex-direction: column; gap: 16px; }
        .nu-diary-stub { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; padding: 48px 28px; }
        .nu-diary-stub-ic { width: 60px; height: 60px; border-radius: 16px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
        .nu-diary-stub-title { font-size: 18px; font-weight: 700; color: var(--text-primary); }
        .nu-diary-stub-text { font-size: 14px; max-width: 360px; line-height: 1.55; }
      `}</style>
    </motion.div>
  )
}
