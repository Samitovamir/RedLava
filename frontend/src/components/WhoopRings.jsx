import { motion } from 'framer-motion'
import CircularChart from './CircularChart.jsx'
import { recoveryColor, recoveryLabel, fmtHm } from '../utils/whoop.js'

/*
  Три кольца в стиле Whoop: Сон / Восстановление / Нагрузка.
  ВАЖНО про смысл (чтобы не путать с зарядом дня):
   - Восстановление (Recovery) — УТРЕННИЙ балл готовности: «с чем проснулся».
     Он фиксирован на день и НЕ убывает в течение дня.
   - Body Battery (Garmin), если появится — это другой показатель: живой заряд,
     который тратится за день. Здесь его нет, поэтому подпись поясняет про утро.
  props: w — объект Whoop (recovery, strain, strainMax, sleep.performance, sleep.hoursSlept)
*/
export default function WhoopRings({ w }) {
  const sleepPerf = w.sleep?.performance ?? 0
  const strainMax = w.strainMax || 21
  return (
    <motion.div className="wr"
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <div className="wr-rings">
        <CircularChart
          value={sleepPerf} label="Сон" color="#38bdf8" size={132}
          sublabel={w.sleep?.hoursSlept != null ? fmtHm((w.sleep.hoursSlept || 0) * 60) : null}
        />
        <CircularChart
          value={w.recovery} label="Восстановление" color={recoveryColor(w.recovery)} size={132}
          sublabel={recoveryLabel(w.recovery)}
        />
        <CircularChart
          value={(w.strain / strainMax) * 100} label="Нагрузка" color="var(--accent)" size={132}
          centerText={`${w.strain}`} sublabel={`из ${strainMax}`}
        />
      </div>
      <div className="wr-note muted">
        Восстановление — утренний балл готовности: с чем вы проснулись (на день не убывает).
      </div>

      <style>{`
        .wr { display: flex; flex-direction: column; gap: 12px; align-items: center; }
        .wr-rings { display: flex; gap: 28px; flex-wrap: wrap; justify-content: center; }
        .wr-note { font-size: 12.5px; text-align: center; max-width: 480px; }
        @media (max-width: 520px) { .wr-rings { gap: 16px; } }
      `}</style>
    </motion.div>
  )
}
