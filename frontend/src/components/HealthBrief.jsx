import { motion } from 'framer-motion'
import { useAiSummary } from '../hooks/useAiSummary.js'
import { PANELS, INITIAL_REPORTS, buildHistory, markerStatus, STATUS_INFO, rangeText } from '../utils/labs.js'

/*
  Большое окно на главной: ИИ коротко и без воды отмечает только важное по анализам
  и здоровью и даёт конкретные советы. Кэшируется по данным здоровья (не по календарю),
  чтобы не пересчитываться зря. Кнопка «обновить» — принудительный пересчёт.
*/

// Сжатая сводка здоровья: отклонения в анализах + ключевые данные Whoop.
// Это и ключ кэша: пересчёт только когда меняются именно эти данные.
function buildHealthData() {
  let reports = INITIAL_REPORTS
  try { const s = localStorage.getItem('albert-labs'); if (s) reports = JSON.parse(s) } catch { /* ignore */ }
  const hist = buildHistory(reports)
  const flagged = []
  PANELS.forEach(p => p.markers.forEach(m => {
    const h = hist[m.name]; if (!h) return
    const v = h[h.length - 1].value
    const st = markerStatus(v, m.min, m.max)
    if (st !== 'ok') flagged.push(`${m.name} ${v} ${m.unit} (норма ${rangeText(m.min, m.max)}, ${STATUS_INFO[st].label})`)
  }))
  const labs = flagged.length
    ? `Анализы крови вне нормы: ${flagged.join('; ')}.`
    : 'Все показатели анализов крови в норме.'

  let whoop = null
  try { const s = localStorage.getItem('albert-whoop-live'); if (s) whoop = JSON.parse(s) } catch { /* ignore */ }
  const w = whoop
    ? `Whoop сегодня: восстановление ${whoop.recovery}%, сон ${whoop.sleep?.hoursSlept} ч, HRV ${whoop.hrv} мс, пульс покоя ${whoop.rhr}.`
    : ''
  return [labs, w].filter(Boolean).join(' ')
}

const CONTEXT =
  'Ты — внимательный помощник владельца по здоровью (он пожилой человек без мед. образования). ' +
  'По его анализам крови и данным Whoop дай ОЧЕНЬ короткую выжимку. ' +
  'Строго 2–4 коротких предложения, только самое важное, что стоит знать прямо сейчас. ' +
  'Назови показатели вне нормы простыми словами и дай конкретный практичный совет: ' +
  'какой доп. анализ имеет смысл сдать, какой витамин или добавку обсудить, или что это не повод волноваться. ' +
  'Без вступлений, без воды, без общих лекций про здоровый образ жизни. ' +
  'Если всё в норме — скажи это одним предложением и спокойно подбодри. ' +
  'Опирайся ТОЛЬКО на данные ниже, ничего не выдумывай. Ты не ставишь диагноз, а даёшь дружеский ориентир.'

export default function HealthBrief() {
  const healthData = buildHealthData()
  const { text, loading, source, refresh } = useAiSummary({
    id: 'health-brief',
    context: CONTEXT,
    message: 'Дай короткую выжимку по моим анализам и здоровью: что важно и что делать.',
    fallback: 'Короткая ИИ-выжимка по анализам появится, когда подключён ключ ИИ. Сами анализы и динамика — на вкладке «Здоровье».',
    snapshot: healthData
  })

  return (
    <motion.div className="card health-brief">
      <div className="hb-head">
        <div className="hb-title">
          <span className="hb-badge">ИИ</span>
          <span>Коротко о здоровье</span>
        </div>
        <button className="hb-refresh" onClick={refresh} disabled={loading} title="Пересчитать">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>
      {loading
        ? <div className="hb-loading">Смотрю анализы…</div>
        : <p className="hb-text">{text}</p>}

      <style>{`
        .health-brief {
          position: relative; overflow: hidden;
          display: flex; flex-direction: column; gap: 12px;
          padding: 20px 22px;
        }
        .health-brief::before {
          content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%;
          background: var(--green);
        }
        .hb-head { display: flex; align-items: center; justify-content: space-between; }
        .hb-title { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; color: var(--foreground); }
        .hb-badge {
          font-size: 11px; font-weight: 700; color: var(--accent-foreground);
          background: var(--accent); padding: 2px 8px; border-radius: 8px;
        }
        .hb-refresh {
          width: 32px; height: 32px; border-radius: 9px;
          background: var(--bg-secondary); border: 1px solid var(--border);
          color: var(--muted); cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .hb-refresh:hover:not(:disabled) { color: var(--green); border-color: var(--border-hover); }
        .hb-refresh:disabled { opacity: 0.5; cursor: default; }
        .hb-loading { font-size: 15px; color: var(--muted); }
        .hb-text { font-size: 17px; line-height: 1.6; color: var(--foreground); white-space: pre-wrap; }
      `}</style>
    </motion.div>
  )
}
