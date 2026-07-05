import { motion } from 'framer-motion'
import { useT } from '../context/LanguageContext.jsx'

/*
  Виджет «Восстановление ↔ Нагрузка» — калька Whoop «Strain & Recovery».
  Сопоставляет ёмкость (восстановление / заряд тела) с нагрузкой (strain / стресс),
  обе величины нормированы к 0–100, и даёт короткий вердикт: есть ли запас.
  props:
    recovery      — 0–100, «ёмкость» (Whoop recovery или Garmin Body Battery)
    recoveryLabel — подпись ёмкости
    load          — 0–100, нормированная нагрузка
    loadDisplay   — что показать пользователю по нагрузке (например «15.3 из 21» или «52 /100»)
    loadLabel     — подпись нагрузки
*/

const STR = {
  ru: {
    title: 'Восстановление ↔ Нагрузка',
    surplus: 'Есть запас — организм готов к нагрузке.',
    balanced: 'Баланс — нагрузка примерно равна восстановлению, держите умеренный темп.',
    overload: 'Нагрузка выше восстановления — сегодня лучше отдых или лёгкая активность.'
  },
  en: {
    title: 'Recovery ↔ Strain',
    surplus: 'Surplus — your body is ready for a load.',
    balanced: 'Balanced — load roughly equals recovery, keep a moderate pace.',
    overload: 'Load exceeds recovery — better rest or light activity today.'
  }
}

const clamp = v => Math.min(100, Math.max(0, Math.round(v)))

export default function RecoveryBalance({ recovery, recoveryLabel, load, loadDisplay, loadLabel }) {
  const t = useT(STR)
  const rec = clamp(recovery)
  const ld = clamp(load)
  const diff = rec - ld

  let verdict, color
  if (diff >= 15) { verdict = t.surplus; color = 'var(--green)' }
  else if (diff <= -15) { verdict = t.overload; color = 'var(--red)' }
  else { verdict = t.balanced; color = 'var(--yellow)' }

  return (
    <motion.div className="card rb"
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <div className="rb-title">{t.title}</div>

      <div className="rb-row">
        <span className="rb-lbl">{recoveryLabel}</span>
        <div className="rb-track">
          <motion.div className="rb-fill" style={{ background: 'var(--green)' }}
            initial={{ width: 0 }} animate={{ width: `${rec}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
        </div>
        <span className="rb-val">{rec}%</span>
      </div>

      <div className="rb-row">
        <span className="rb-lbl">{loadLabel}</span>
        <div className="rb-track">
          <motion.div className="rb-fill" style={{ background: 'var(--accent)' }}
            initial={{ width: 0 }} animate={{ width: `${ld}%` }} transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }} />
        </div>
        <span className="rb-val">{loadDisplay}</span>
      </div>

      <div className="rb-verdict" style={{ borderColor: color }}>
        <span className="rb-dot" style={{ background: color }} />
        <span className="rb-verdict-text">{verdict}</span>
      </div>

      <style>{`
        .rb { display: flex; flex-direction: column; gap: 14px; }
        .rb-title { font-size: 17px; font-weight: 700; color: var(--foreground); }
        .rb-row { display: grid; grid-template-columns: 120px 1fr auto; align-items: center; gap: 12px; }
        .rb-lbl { font-size: 13px; font-weight: 600; color: var(--muted-foreground); }
        .rb-track { height: 12px; border-radius: 999px; background: var(--bg-secondary); box-shadow: var(--inset-tile); overflow: hidden; }
        .rb-fill { height: 100%; border-radius: 999px; }
        .rb-val { font-size: 15px; font-weight: 700; color: var(--foreground); font-variant-numeric: tabular-nums; min-width: 56px; text-align: right; }
        .rb-verdict { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 12px; background: var(--bg-tile, var(--bg-secondary)); border-left: 3px solid var(--border); }
        .rb-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
        .rb-verdict-text { font-size: 14px; line-height: 1.5; color: var(--foreground); }
        @media (max-width: 520px) {
          .rb-row { grid-template-columns: 92px 1fr auto; gap: 8px; }
          .rb-lbl { font-size: 12px; }
        }
      `}</style>
    </motion.div>
  )
}
