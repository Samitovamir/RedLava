import { motion } from 'framer-motion'
import AiAdvice from './AiAdvice.jsx'

/*
  Общая карточка-сигнал для Главной: заголовок (иконка + ярлык) + пара ключевых метрик
  + ОДНА короткая фраза от ИИ (в едином блоке AiAdvice). Используется парой «Спорт» и
  «Здоровье», чтобы они были визуально одинаковы. Только CSS-переменные; числа — tabular-nums.
*/
export default function SignalCard({ label, icon, metrics = [], aiText = '', aiLoading = false, onClick }) {
  return (
    <motion.div className="card quick-card clickable sig2-card" whileHover={{ y: -4 }} onClick={onClick}>
      <div className="quick-card-top">
        <span className="quick-card-icon" style={{ color: 'var(--muted)' }}>{icon}</span>
        <span className="quick-card-label">{label}</span>
      </div>

      {metrics.length > 0 && (
        <div className="sig2-metrics">
          {metrics.map((m, i) => (
            <span className="sig2-metric" key={`${m.label}-${i}`}>
              {m.label && <span className="sig2-l">{m.label}</span>}
              <b className="sig2-v">{m.value}</b>
            </span>
          ))}
        </div>
      )}

      {(aiText || aiLoading) && (
        <AiAdvice glow="soft" label="ИИ">
          {aiLoading ? '…' : aiText}
        </AiAdvice>
      )}

      <style>{`
        .sig2-card { display: flex; flex-direction: column; gap: 10px; cursor: pointer; }
        .sig2-metrics { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: baseline; }
        .sig2-metric { display: inline-flex; align-items: baseline; gap: 6px; font-size: 14px; min-width: 0; }
        .sig2-l { color: var(--text-secondary); }
        .sig2-v { color: var(--foreground); font-weight: 700; font-variant-numeric: tabular-nums; }
        .sig2-ai {
          font-size: 13.5px; line-height: 1.5; color: var(--text-muted);
          overflow-wrap: anywhere;
        }
        .sig2-ai-badge {
          font-size: 10px; font-weight: 700; color: var(--accent);
          letter-spacing: 0.04em; margin-right: 6px; text-transform: uppercase;
        }
      `}</style>
    </motion.div>
  )
}
