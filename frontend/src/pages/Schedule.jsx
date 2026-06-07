import { motion } from 'framer-motion'
import DaySchedule from '../components/DaySchedule.jsx'
import DaySummary from '../components/DaySummary.jsx'
import { useT } from '../context/LanguageContext.jsx'

export default function Schedule() {
  const t = useT({
    ru: { title: 'Расписание', source: 'Google Calendar' },
    en: { title: 'Schedule', source: 'Google Calendar' }
  })
  return (
    <div className="schedule-page">
      <div className="page-header">
        <h2>{t.title}</h2>
        <span className="muted">{t.source}</span>
      </div>
      <div className="schedule-layout">
        <motion.div
          className="schedule-col"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <DaySchedule extended />
        </motion.div>
        <motion.div
          className="schedule-col"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <DaySummary />
        </motion.div>
      </div>
      <style>{`
        .schedule-page { display: flex; flex-direction: column; gap: 24px; }
        .page-header { display: flex; align-items: baseline; gap: 12px; }
        .page-header h2 { font-size: 24px; font-weight: 700; }
        .muted { color: var(--muted-foreground); }
        .schedule-layout {
          display: grid;
          grid-template-columns: 7fr 3fr;
          gap: 16px;
          align-items: stretch;
          height: calc(100vh - 190px);
          min-height: 560px;
        }
        .schedule-col { height: 100%; min-height: 0; }
      `}</style>
    </div>
  )
}
