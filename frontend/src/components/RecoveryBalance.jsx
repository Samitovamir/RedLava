import { motion } from 'framer-motion'
import { useT } from '../context/LanguageContext.jsx'
import { Meters } from '../ui'

/*
  The "Recovery ↔ Strain" widget — modelled on Whoop's "Strain & Recovery".
  Sets capacity (recovery / Body Battery) against load (strain / stress), both normalised
  to 0–100, and gives a short verdict: is there room to spare.
  props:
    recovery      — 0–100, the "capacity" (Whoop recovery or Garmin Body Battery)
    recoveryLabel — label for the capacity
    load          — 0–100, normalised load
    loadDisplay   — how the load is shown to the user (e.g. "15.3 of 21" or "52 /100")
    loadLabel     — label for the load
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
  if (diff >= 15) { verdict = t.surplus; color = 'var(--status-ok)' }
  else if (diff <= -15) { verdict = t.overload; color = 'var(--status-crit)' }
  else { verdict = t.balanced; color = 'var(--status-warn)' }

  return (
    <motion.div className="card rb"
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <div className="rb-title">{t.title}</div>

      <Meters rows={[
        { label: recoveryLabel, pct: rec, color: 'var(--status-ok)', text: `${rec}%` },
        { label: loadLabel, pct: ld, color: 'var(--accent)', text: loadDisplay },
      ]} />

      <div className="rb-verdict" style={{ borderColor: color }}>
        <span className="rb-dot" style={{ background: color }} />
        <span className="rb-verdict-text">{verdict}</span>
      </div>

      <style>{`
        .rb { display: flex; flex-direction: column; gap: 14px; }
        .rb-title { font-size: 17px; font-weight: 700; color: var(--foreground); }
        .rb-verdict { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 12px; background: var(--bg-tile, var(--bg-secondary)); border-left: 3px solid var(--border); }
        .rb-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
        .rb-verdict-text { font-size: 14px; line-height: 1.5; color: var(--foreground); }
      `}</style>
    </motion.div>
  )
}
