import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useT } from '../context/LanguageContext.jsx'
import { dueRetests, readinessTone } from '../utils/healthSignal.js'
import { fmtDate } from '../utils/labs.js'

/*
  Сигнал «Здоровье» на Главной (заменяет окно «Восстановление и сон»).
  По умолчанию — спокойный статус готовности по утреннему восстановлению Whoop + сон.
  Тревожный (warning) вид включается ТОЛЬКО под действие, которое реально пора
  сделать сегодня: пересдать анализ (срок контроля по отклонению уже прошёл).
  Сами отклонения как тревогу на Главную не выносим — они спокойно в разделе «Здоровье».
*/

function readWhoop() {
  try { const s = localStorage.getItem('albert-whoop-live'); if (s) return JSON.parse(s) } catch { /* ignore */ }
  return null
}
function readReports() {
  try { const s = localStorage.getItem('albert-labs'); if (s) return JSON.parse(s) } catch { /* ignore */ }
  return []
}

const TONE_COLOR = { good: 'var(--green)', mid: 'var(--yellow)', low: 'var(--orange)' }

const ICON_HEART = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
  </svg>
)
const ICON_RETEST = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
)

export default function HealthSignal() {
  const navigate = useNavigate()
  const t = useT({
    ru: {
      label: 'Здоровье',
      good: 'Хорошо восстановились', mid: 'Восстановление среднее', low: 'День на восстановление',
      recovery: 'Восстановление', sleep: 'сон', hours: 'ч',
      connect: 'Подключите Whoop', noData: 'Нет данных',
      retestTitle: 'Пора пересдать анализ', action: 'действие',
      lastTaken: 'сдавали', andMore: n => `и ещё ${n}`
    },
    en: {
      label: 'Health',
      good: 'Well recovered', mid: 'Moderate recovery', low: 'A day to recover',
      recovery: 'Recovery', sleep: 'sleep', hours: 'h',
      connect: 'Connect Whoop', noData: 'No data',
      retestTitle: 'Time to retake a test', action: 'action',
      lastTaken: 'taken', andMore: n => `and ${n} more`
    }
  })

  const whoop = readWhoop()
  const due = dueRetests(readReports())

  // 1) Тревожный вид — только когда реально пора пересдать (действие на сегодня).
  let mode, accent, icon, title, sub, link
  if (due.length) {
    const first = due[0]
    mode = 'warning'
    accent = 'var(--yellow)'
    icon = ICON_RETEST
    title = t.retestTitle
    sub = `${first.name}${due.length > 1 ? ` ${t.andMore(due.length - 1)}` : ''} · ${t.lastTaken} ${fmtDate(first.date)}`
    link = '/health'
  } else if (whoop) {
    // 2) Спокойный статус готовности: восстановление + сон. Подбадривающий/нейтральный.
    const tone = readinessTone(whoop.recovery) || 'mid'
    mode = 'calm'
    accent = TONE_COLOR[tone]
    icon = ICON_HEART
    title = t[tone]
    sub = `${t.recovery} ${whoop.recovery}% · ${t.sleep} ${whoop.sleep?.hoursSlept} ${t.hours}`
    link = '/health'
  } else {
    // 3) Whoop не подключён — спокойно предлагаем подключить.
    mode = 'empty'
    accent = 'var(--muted)'
    icon = ICON_HEART
    title = t.noData
    sub = t.connect
    link = '/connections'
  }

  return (
    <motion.div
      className={`card quick-card clickable signal-card ${mode}`}
      whileHover={{ y: -4 }}
      onClick={() => navigate(link)}
    >
      <div className="quick-card-top">
        {/* Иконка-заголовок в едином нейтральном цвете — как у парной карточки
            «Расписание»; статус-цвет (accent) остаётся в чипе и заголовке. */}
        <span className="quick-card-icon" style={{ color: 'var(--muted)' }}>{icon}</span>
        <span className="quick-card-label">{t.label}</span>
      </div>
      <span className="quick-card-value" style={{ color: mode === 'warning' ? accent : 'var(--foreground)' }}>{title}</span>
      <div className="signal-sub-row">
        {mode === 'warning' && <span className="signal-pill">{t.action}</span>}
        <span className="quick-card-sub">{sub}</span>
      </div>

      <style>{`
        .signal-card { cursor: pointer; }
        .signal-sub-row { display: flex; align-items: center; gap: 8px; }
        .signal-pill {
          flex-shrink: 0;
          font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
          color: var(--accent-foreground); background: var(--yellow);
          padding: 2px 7px; border-radius: 7px; line-height: 1.4;
        }
      `}</style>
    </motion.div>
  )
}
