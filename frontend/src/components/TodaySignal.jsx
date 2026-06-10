import { motion } from 'framer-motion'
import { useEvents } from '../context/EventsContext.jsx'
import { useMemoryFacts } from '../context/MemoryContext.jsx'
import { useLang, useT } from '../context/LanguageContext.jsx'
import { useAiSummary } from '../hooks/useAiSummary.js'
import { buildSignalData, SIGNAL_CONTEXT, parseSignal, fallbackSignal } from '../utils/daySignal.js'

/*
  Верхний hero-баннер «СЕГОДНЯ» на Главной.
  Крупный заголовок-вывод + неброская строка, которая человеческим языком называет
  ключевое данное, из которого вывод. Контент — от ИИ (режимы и пороги из ЛИЧНОЙ
  нормы в памяти; режим 3 редкий; тон-информатор, решение за владельцем). Кэш — в
  пределах дня по стабильному «снимку дня», так что hero не дёргается каждую минуту.
*/

export default function TodaySignal() {
  const { lang } = useLang()
  const { events } = useEvents()
  const { facts } = useMemoryFacts()
  const t = useT({ ru: { eyebrow: 'Сегодня' }, en: { eyebrow: 'Today' } })

  const signalData = buildSignalData({ events, facts })
  const fb = fallbackSignal(lang)

  const summary = useAiSummary({
    id: 'today-signal',
    context: SIGNAL_CONTEXT + (lang === 'en' ? '\nReply in English.' : ''),
    snapshot: signalData,
    message: 'Сформируй сегодняшний баннер «СЕГОДНЯ»: заголовок-вывод и неброскую строку с ключевым данным. Ровно две строки.',
    fallback: `${fb.headline}\n${fb.note}`
  })

  const parsed = summary.text ? parseSignal(summary.text) : null
  const headline = parsed?.headline || fb.headline
  const note = parsed?.note || fb.note

  return (
    <motion.div
      className="card today-signal"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <span className="ts-eyebrow">{t.eyebrow}</span>
      <h2 className="ts-headline">{headline}</h2>
      {note && <p className="ts-note">{note}</p>}

      <style>{`
        .today-signal { display: flex; flex-direction: column; gap: 10px; padding: 26px 30px; }
        .ts-eyebrow {
          font-size: 12px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
          color: var(--accent);
        }
        .ts-headline {
          font-size: 31px; font-weight: 700; line-height: 1.16;
          color: var(--foreground); letter-spacing: -0.02em;
        }
        .ts-note {
          font-size: 16px; line-height: 1.55; color: var(--muted-foreground);
          max-width: 760px;
        }
        @media (max-width: 620px) {
          .today-signal { padding: 22px 20px; }
          .ts-headline { font-size: 26px; }
        }
      `}</style>
    </motion.div>
  )
}
