import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useT } from '../context/LanguageContext.jsx'
import Icon from '../ui/Icon.jsx'

/*
  Окно «Что нового» — показывается ОДИН раз при первом заходе и больше не появляется.
  Запоминается в браузере по ключу-версии. Чтобы показать новый список после
  следующих обновлений — поменяй VERSION (например 'v2') и обнови SECTIONS.
*/
const VERSION = 'v1'
const STORAGE_KEY = `albert-whatsnew-${VERSION}`

const SECTIONS_BY_LANG = {
  ru: [
    {
      iconKey: 'sport-run',
      title: 'Спорт и тренировки',
      items: [
        'Подробное окно тренировки, как в Garmin: графики пульса и темпа, карта маршрута, отрезки.',
        'Плановые тренировки из TrainingPeaks/Garmin видны прямо в календаре.'
      ]
    },
    {
      iconKey: 'health',
      title: 'Здоровье',
      items: [
        'Кольца Сон / Восстановление / Нагрузка, а также Заряд тела и Стресс.',
        'Клик по дню недели — короткий совет на этот день.',
        'Анализы крови: загрузка файлов, авто-распознавание и раскладка по системам организма.'
      ]
    },
    {
      iconKey: 'bot',
      title: 'Помощник',
      items: [
        'Голосовой ввод по-русски во всех полях — просто говорите.',
        'Строит маршруты и подсказывает, во сколько выезжать, чтобы успеть.'
      ]
    },
    {
      iconKey: 'nutrition',
      title: 'Питание (новый раздел)',
      items: [
        'Цель по калориям, которая меняется под тренировки и восстановление.',
        'Подбор блюд на каждый день и автоматический список покупок на неделю.',
        'Учитывает ваши предпочтения; можно сфотографировать экран CalAI — посчитает съеденное.'
      ]
    }
  ],
  en: [
    {
      iconKey: 'sport-run',
      title: 'Sport & training',
      items: [
        'A detailed workout view, like in Garmin: heart-rate and pace charts, route map, splits.',
        'Planned workouts from TrainingPeaks/Garmin show up right in the calendar.'
      ]
    },
    {
      iconKey: 'health',
      title: 'Health',
      items: [
        'Sleep / Recovery / Strain rings, plus Body Battery and Stress.',
        'Click a day of the week for a short tip for that day.',
        'Blood tests: upload files, auto-recognition and a breakdown by body system.'
      ]
    },
    {
      iconKey: 'bot',
      title: 'Assistant',
      items: [
        'Voice input in Russian in every field — just speak.',
        'Builds routes and tells you when to leave to make it on time.'
      ]
    },
    {
      iconKey: 'nutrition',
      title: 'Nutrition (new section)',
      items: [
        'A calorie goal that adjusts to your training and recovery.',
        'Meal suggestions for each day and an automatic weekly shopping list.',
        'Takes your preferences into account; you can snap a photo of the CalAI screen — it’ll count what you ate.'
      ]
    }
  ]
}

export default function WhatsNew() {
  const [open, setOpen] = useState(false)
  const t = useT({
    ru: {
      badge: 'Обновление',
      title: 'Что нового на сайте',
      sub: 'Пока вы не заходили, здесь кое-что добавилось',
      ok: 'Понятно, спасибо!',
      sections: SECTIONS_BY_LANG.ru,
    },
    en: {
      badge: 'Update',
      title: 'What’s new on the site',
      sub: 'While you were away, a few things were added',
      ok: 'Got it, thanks!',
      sections: SECTIONS_BY_LANG.en,
    },
  })

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true)
    } catch { /* ignore */ }
  }, [])

  function close() {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* ignore */ }
    setOpen(false)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="wn-backdrop" onClick={close}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="card wn-modal" onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
            <div className="wn-head">
              <span className="wn-badge">{t.badge}</span>
              <h2 className="wn-title">{t.title}</h2>
              <p className="wn-sub">{t.sub}</p>
            </div>

            <div className="wn-body">
              {t.sections.map(s => (
                <div key={s.title} className="wn-section">
                  <div className="wn-section-head"><Icon name={s.iconKey} size={18} color="var(--accent)" />{s.title}</div>
                  <ul className="wn-list">
                    {s.items.map((it, i) => <li key={i}>{it}</li>)}
                  </ul>
                </div>
              ))}
            </div>

            <button className="wn-ok" onClick={close}>{t.ok}</button>
          </motion.div>

          <style>{`
            .wn-backdrop {
              position: fixed; inset: 0; z-index: 1000;
              background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
              display: flex; align-items: center; justify-content: center; padding: 24px;
            }
            .wn-modal {
              width: 100%; max-width: 540px; max-height: 86vh; overflow-y: auto;
              display: flex; flex-direction: column; gap: 20px; padding: 28px;
            }
            .wn-head { display: flex; flex-direction: column; gap: 6px; }
            .wn-badge {
              align-self: flex-start; font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
              color: var(--primary-foreground); background: var(--primary);
              padding: 4px 10px; border-radius: 8px; text-transform: uppercase;
            }
            .wn-title { font-size: 24px; font-weight: 800; color: var(--foreground); margin: 6px 0 0; }
            .wn-sub { font-size: 14px; color: var(--muted-foreground); }

            .wn-body { display: flex; flex-direction: column; gap: 16px; }
            .wn-section {
              background: var(--secondary); border: 1px solid var(--border);
              border-radius: 16px; padding: 16px 18px;
            }
            .wn-section-head {
              display: flex; align-items: center; gap: 9px;
              font-size: 15.5px; font-weight: 700; color: var(--foreground); margin-bottom: 8px;
            }
            .wn-list { list-style: none; display: flex; flex-direction: column; gap: 7px; padding: 0; margin: 0; }
            .wn-list li {
              position: relative; padding-left: 18px;
              font-size: 14px; line-height: 1.55; color: var(--foreground);
            }
            .wn-list li::before {
              content: '•'; position: absolute; left: 4px; color: var(--primary); font-weight: 700;
            }

            .wn-ok {
              align-self: stretch; padding: 14px; border: none; border-radius: 14px;
              background: var(--primary); color: var(--primary-foreground);
              font-family: inherit; font-size: 15.5px; font-weight: 700; cursor: pointer;
              transition: opacity 0.15s; position: sticky; bottom: 0;
            }
            .wn-ok:hover { opacity: 0.9; }

            .wn-modal::-webkit-scrollbar { width: 8px; }
            .wn-modal::-webkit-scrollbar-thumb { background: var(--secondary); border-radius: 8px; }

            @media (max-width: 560px) {
              .wn-modal { padding: 20px; }
              .wn-title { font-size: 21px; }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
