import { motion } from 'framer-motion'
import { useEvents } from '../context/EventsContext.jsx'
import { useMemoryFacts } from '../context/MemoryContext.jsx'
import { useLang, useT } from '../context/LanguageContext.jsx'
import { useAiSummary } from '../hooks/useAiSummary.js'
import { buildSignalData, SIGNAL_CONTEXT, parseSignal, fallbackSignal } from '../utils/daySignal.js'

/*
  Верхний hero-баннер «СТАТУС» на Главной.
  Заголовок-вывод + короткий разбор по доменам (стресс/впереди/спорт/анализы/питание) +
  строка обобщённого совета. Тонкая цветная рамка-оценка: зелёный/оранжевый/красный
  (статус-токены дизайн-системы). Контент — от ИИ (режимы и пороги из ЛИЧНОЙ нормы в
  памяти; crit редкий; тон-информатор, решение за владельцем). Кэш — в пределах фазы дня,
  так что окно живёт по ходу дня, но не дёргается каждую минуту.
*/

export default function TodaySignal() {
  const { lang } = useLang()
  const { events } = useEvents()
  const { facts } = useMemoryFacts()
  const t = useT({ ru: { eyebrow: 'Статус' }, en: { eyebrow: 'Status' } })

  const signalData = buildSignalData({ events, facts })
  const fb = fallbackSignal(lang)

  const summary = useAiSummary({
    id: 'today-signal',
    context: SIGNAL_CONTEXT + (lang === 'en' ? '\nReply in English (keep the field labels in Russian: СТАТУС/Заголовок/Стресс/Впереди/Спорт/Анализы/Питание/Совет).' : ''),
    snapshot: signalData,
    message: 'Сформируй сегодняшний баннер «СТАТУС» строго по формату: служебная строка статуса, заголовок, строки по разделам и строка-совет.',
    fallback: ''
  })

  const parsed = summary.text ? parseSignal(summary.text) : null
  const status = parsed?.status || fb.status
  const headline = parsed?.headline || fb.headline
  const rows = (parsed?.rows && parsed.rows.length) ? parsed.rows : fb.rows
  const advice = parsed?.advice || fb.advice

  return (
    <motion.div
      className={`card today-signal st-${status}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <span className="ts-eyebrow">{t.eyebrow}</span>
      <h2 className="ts-headline">{headline}</h2>

      {rows.length > 0 && (
        <div className="ts-rows">
          {rows.map((r, i) => (
            <div className="ts-row" key={`${r.label}-${i}`}>
              <span className="ts-row-label">{r.label}</span>
              <span className="ts-row-value">{r.value}</span>
            </div>
          ))}
        </div>
      )}

      {advice && <p className="ts-advice">{advice}</p>}

      <style>{`
        .today-signal {
          display: flex; flex-direction: column; gap: 12px; padding: 24px 28px;
          transition: border-color 0.3s var(--ease), box-shadow 0.3s var(--ease);
        }
        .ts-eyebrow {
          font-size: 12px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
          color: var(--accent);
        }
        .ts-headline {
          font-size: 28px; font-weight: 700; line-height: 1.16;
          color: var(--foreground); letter-spacing: -0.02em;
        }
        .ts-rows { display: flex; flex-direction: column; gap: 7px; margin-top: 2px; }
        .ts-row {
          display: grid; grid-template-columns: 96px 1fr; gap: 12px; align-items: baseline;
          font-size: 14.5px; line-height: 1.4;
        }
        .ts-row-label {
          color: var(--text-secondary); font-weight: 600;
          text-transform: none;
        }
        .ts-row-value { color: var(--text-body); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
        .ts-advice {
          font-size: 15px; line-height: 1.55; color: var(--text-body);
          max-width: 760px; margin-top: 4px; padding-top: 12px;
          border-top: 1px solid var(--border);
        }
        /* Рамка-оценка (тонко, как карточка подключения): зелёный / оранжевый / красный */
        .today-signal.st-ok {
          border-color: color-mix(in srgb, var(--status-ok) 40%, transparent);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--status-ok) 15%, transparent);
        }
        .today-signal.st-warn {
          border-color: color-mix(in srgb, var(--status-warn) 40%, transparent);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--status-warn) 15%, transparent);
        }
        .today-signal.st-crit {
          border-color: color-mix(in srgb, var(--status-crit) 40%, transparent);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--status-crit) 15%, transparent);
        }
        @media (max-width: 620px) {
          .today-signal { padding: 20px 18px; }
          .ts-headline { font-size: 24px; }
          .ts-row { grid-template-columns: 84px 1fr; font-size: 14px; }
        }
      `}</style>
    </motion.div>
  )
}
