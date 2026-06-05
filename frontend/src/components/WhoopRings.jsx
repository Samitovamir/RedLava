import { motion } from 'framer-motion'
import CircularChart from './CircularChart.jsx'
import { recoveryColor, recoveryLabel, fmtHm } from '../utils/whoop.js'

/*
  Кольца готовности: Whoop (Сон / Восстановление / Нагрузка) + Garmin (Заряд тела / Стресс).
  СМЫСЛ (чтобы не путать):
   - Восстановление (Whoop) — УТРЕННИЙ балл готовности: «с чем проснулся», на день фиксирован.
   - Заряд тела (Body Battery, Garmin) — ЖИВОЙ остаток энергии: тратится в течение дня
     (заряжается во сне/отдыхе, расходуется активностью и стрессом).
   - Стресс (Garmin) — текущий уровень напряжения 0–100 (ниже — лучше).
  props: w — объект Whoop; garmin — { bodyBattery:{current,charged,drained}, stress:{current,avg,max} }
*/

// Заряд тела: выше — лучше
function bbColor(v) {
  if (v >= 50) return 'var(--green)'
  if (v >= 25) return 'var(--yellow)'
  return 'var(--red)'
}
// Стресс: ниже — лучше (шкала Garmin 0–100)
function stressColor(v) {
  if (v <= 25) return 'var(--green)'
  if (v <= 50) return 'var(--yellow)'
  if (v <= 75) return 'var(--orange)'
  return 'var(--red)'
}
function stressLabel(v) {
  if (v <= 25) return 'Покой'
  if (v <= 50) return 'Низкий'
  if (v <= 75) return 'Средний'
  return 'Высокий'
}

export default function WhoopRings({ w, garmin }) {
  const sleepPerf = w.sleep?.performance ?? 0
  const strainMax = w.strainMax || 21
  const bb = garmin?.bodyBattery
  const st = garmin?.stress
  const stressVal = st ? (st.current ?? st.avg) : null

  return (
    <motion.div className="wr"
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <div className="wr-rings">
        <CircularChart
          value={sleepPerf} label="Сон" color="#38bdf8" size={124}
          sublabel={w.sleep?.hoursSlept != null ? fmtHm((w.sleep.hoursSlept || 0) * 60) : null}
        />
        <CircularChart
          value={w.recovery} label="Восстановление" color={recoveryColor(w.recovery)} size={124}
          sublabel={recoveryLabel(w.recovery)}
        />
        <CircularChart
          value={(w.strain / strainMax) * 100} label="Нагрузка" color="var(--accent)" size={124}
          centerText={`${w.strain}`} sublabel={`из ${strainMax}`}
        />
        {bb?.current != null && (
          <CircularChart
            value={bb.current} label="Заряд тела" color={bbColor(bb.current)} size={124}
            sublabel={(bb.charged != null || bb.drained != null)
              ? `${bb.charged != null ? '+' + bb.charged : ''}${bb.drained != null ? ' −' + bb.drained : ''}`.trim()
              : 'осталось'}
          />
        )}
        {stressVal != null && (
          <CircularChart
            value={stressVal} label="Стресс" color={stressColor(stressVal)} size={124}
            centerText={`${stressVal}`} sublabel={stressLabel(stressVal)}
          />
        )}
      </div>
      <div className="wr-note muted">
        Восстановление — утренний балл («с чем проснулся», на день фиксирован).
        {bb?.current != null && ' Заряд тела — живой остаток энергии, тратится в течение дня.'}
      </div>

      <style>{`
        .wr { display: flex; flex-direction: column; gap: 12px; align-items: center; }
        .wr-rings { display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; }
        .wr-note { font-size: 12.5px; text-align: center; max-width: 540px; }
        @media (max-width: 520px) { .wr-rings { gap: 16px; } }
      `}</style>
    </motion.div>
  )
}
