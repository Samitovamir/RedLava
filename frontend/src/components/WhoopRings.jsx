import { motion } from 'framer-motion'
import { Gauge } from '../ui'
import { recoveryColor, fmtHm } from '../utils/whoop.js'
import { STRESS_ZONES, stressColor, stressWord, batteryColor } from '../utils/scales.js'
import { useT, useLang } from '../context/LanguageContext.jsx'

/*
  Readiness dials: Whoop (Sleep / Recovery / Strain) + Garmin (Body Battery / Stress).
  WHAT THEY MEAN (so they don't get mixed up):
   - Recovery (Whoop) is a MORNING readiness score: "what you woke up with", fixed for the day.
   - Body Battery (Garmin) is your LIVE energy reserve: it drains over the course of the day
     (it charges during sleep and rest, and is spent by activity and stress).
   - Stress (Garmin) is the current tension level, 0–100 (lower is better).
  Body Battery and Stress are drawn exactly as on Sport and Home — same dial, same bands.
  props: w — the Whoop object; garmin — { bodyBattery:{current,charged,drained}, stress:{current,avg,max} }
*/

function recoveryLevel(r) {
  if (r >= 67) return 'high'
  if (r >= 34) return 'mid'
  return 'low'
}

const STR = {
  ru: {
    sleep: 'Сон', recovery: 'Восстановление', strain: 'Нагрузка', bodyBattery: 'Заряд тела', stress: 'Стресс',
    of: 'из',
    recHigh: 'высокое', recMid: 'среднее', recLow: 'низкое', charge: 'заряд',
    noteRecovery: 'Восстановление — утренний балл («с чем проснулся», на день фиксирован).',
    noteBB: ' Заряд тела — живой остаток энергии, тратится в течение дня.'
  },
  en: {
    sleep: 'Sleep', recovery: 'Recovery', strain: 'Strain', bodyBattery: 'Body Battery', stress: 'Stress',
    of: 'of',
    recHigh: 'high', recMid: 'medium', recLow: 'low', charge: 'charge',
    noteRecovery: 'Recovery is a morning readiness score (“what you woke up with”, fixed for the day).',
    noteBB: ' Body Battery is your live energy reserve, spent over the course of the day.'
  }
}

export default function WhoopRings({ w, garmin }) {
  const t = useT(STR)
  const { lang } = useLang()
  const recLabel = { high: t.recHigh, mid: t.recMid, low: t.recLow }
  const sleepPerf = w.sleep?.performance ?? 0
  const strainMax = w.strainMax || 21
  const bb = garmin?.bodyBattery
  const st = garmin?.stress
  const stressVal = st ? (st.current ?? st.avg) : null
  const bbSub = (bb?.charged != null || bb?.drained != null)
    ? `${bb.charged != null ? '+' + bb.charged : ''}${bb.drained != null ? ' −' + bb.drained : ''}`.trim()
    : t.charge

  return (
    <motion.div className="wr"
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <div className="wr-rings">
        <Gauge value={sleepPerf} unit="%" label={t.sleep}
          sub={w.sleep?.hoursSlept != null ? fmtHm((w.sleep.hoursSlept || 0) * 60, lang) : null} />
        <Gauge value={w.recovery} unit="%" color={recoveryColor(w.recovery)} label={t.recovery}
          word={recLabel[recoveryLevel(w.recovery)]} wordColor={recoveryColor(w.recovery)} />
        <Gauge value={w.strain} max={strainMax} label={t.strain} sub={`${t.of} ${strainMax}`} />
        {bb?.current != null && (
          <Gauge value={bb.current} color={batteryColor(bb.current)} label={`${t.bodyBattery} · Garmin`} sub={bbSub} />
        )}
        {stressVal != null && (
          <Gauge value={stressVal} zones={STRESS_ZONES} label={`${t.stress} · Garmin`}
            word={stressWord(stressVal, lang)} wordColor={stressColor(stressVal)} />
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
