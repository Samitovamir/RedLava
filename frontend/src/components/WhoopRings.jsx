import { motion } from 'framer-motion'
import CircularChart from './CircularChart.jsx'
import { recoveryColor, fmtHm } from '../utils/whoop.js'
import { useT } from '../context/LanguageContext.jsx'

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
function stressLevel(v) {
  if (v <= 25) return 'calm'
  if (v <= 50) return 'low'
  if (v <= 75) return 'mid'
  return 'high'
}
function recoveryLevel(r) {
  if (r >= 67) return 'high'
  if (r >= 34) return 'mid'
  return 'low'
}

const STR = {
  ru: {
    sleep: 'Сон', recovery: 'Восстановление', strain: 'Нагрузка', bodyBattery: 'Заряд тела', stress: 'Стресс',
    of: 'из', remaining: 'осталось',
    recHigh: 'Высокое', recMid: 'Среднее', recLow: 'Низкое',
    stCalm: 'Покой', stLow: 'Низкий', stMid: 'Средний', stHigh: 'Высокий',
    noteRecovery: 'Восстановление — утренний балл («с чем проснулся», на день фиксирован).',
    noteBB: ' Заряд тела — живой остаток энергии, тратится в течение дня.'
  },
  en: {
    sleep: 'Sleep', recovery: 'Recovery', strain: 'Strain', bodyBattery: 'Body Battery', stress: 'Stress',
    of: 'of', remaining: 'left',
    recHigh: 'High', recMid: 'Medium', recLow: 'Low',
    stCalm: 'Calm', stLow: 'Low', stMid: 'Medium', stHigh: 'High',
    noteRecovery: 'Recovery is a morning readiness score (“what you woke up with”, fixed for the day).',
    noteBB: ' Body Battery is your live energy reserve, spent over the course of the day.'
  }
}

export default function WhoopRings({ w, garmin }) {
  const t = useT(STR)
  const recLabel = { high: t.recHigh, mid: t.recMid, low: t.recLow }
  const stLabel = { calm: t.stCalm, low: t.stLow, mid: t.stMid, high: t.stHigh }
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
          value={sleepPerf} label={t.sleep} color="var(--accent)" size={124}
          sublabel={w.sleep?.hoursSlept != null ? fmtHm((w.sleep.hoursSlept || 0) * 60) : null}
        />
        <CircularChart
          value={w.recovery} label={t.recovery} color={recoveryColor(w.recovery)} size={124}
          sublabel={recLabel[recoveryLevel(w.recovery)]}
        />
        <CircularChart
          value={(w.strain / strainMax) * 100} label={t.strain} color="var(--accent)" size={124}
          centerText={`${w.strain}`} sublabel={`${t.of} ${strainMax}`}
        />
        {bb?.current != null && (
          <CircularChart
            value={bb.current} label={`${t.bodyBattery} · Garmin`} color={bbColor(bb.current)} size={124}
            sublabel={(bb.charged != null || bb.drained != null)
              ? `${bb.charged != null ? '+' + bb.charged : ''}${bb.drained != null ? ' −' + bb.drained : ''}`.trim()
              : t.remaining}
          />
        )}
        {stressVal != null && (
          <CircularChart
            value={stressVal} label={`${t.stress} · Garmin`} color={stressColor(stressVal)} size={124}
            centerText={`${stressVal}`} sublabel={stLabel[stressLevel(stressVal)]}
          />
        )}
      </div>
      <div className="wr-note muted">
        {t.noteRecovery}
        {bb?.current != null && t.noteBB}
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
