import { useNavigate } from 'react-router-dom'
import { useT, useLang } from '../context/LanguageContext.jsx'
import { useAiSummary } from '../hooks/useAiSummary.js'
import { useSiteSnapshot } from '../hooks/useSiteSnapshot.js'
import SignalCard from './SignalCard.jsx'

/*
  Карточка «Спорт» на Главной: пара метрик из Garmin (неделя / нагрузка или VO2max) +
  ОДНА тренерская фраза от ИИ. Акцент на тренировках, но ИИ видит всю картину (через
  общий снимок). Отличается от «Статуса»: тут только спорт-совет.
*/

function readGarmin() {
  try { const s = localStorage.getItem('albert-garmin-live'); return s ? JSON.parse(s) : null } catch { return null }
}
function readWhoop() {
  try { const s = localStorage.getItem('albert-whoop-live'); return s ? JSON.parse(s) : null } catch { return null }
}

const SPORT_CONTEXT =
  'Ты тренер-помощник владельца (опытный триатлет). По ВСЕМ его данным (тренировки Garmin, ' +
  'восстановление/сон Whoop, стресс, нагрузка) дай ОДНУ короткую тренерскую фразу про СПОРТ на ' +
  'сегодня: где есть запас и что можно усилить/добавить, либо где стоит разгрузиться. Опирайся на ' +
  'реальные данные (тип тренировок, пульс, восстановление). Тон спокойный, информатор; решение ' +
  'оставляешь владельцу. Без вступлений, без markdown — РОВНО одно предложение.'

const ICON_SPORT = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
)

export default function SportSignal() {
  const navigate = useNavigate()
  const { lang } = useLang()
  const t = useT({
    ru: { label: 'Спорт', week: 'Неделя', load: 'Нагрузка', km: 'км', connect: 'Подключите Garmin' },
    en: { label: 'Sport', week: 'Week', load: 'Strain', km: 'km', connect: 'Connect Garmin' },
  })

  const g = readGarmin()
  const w = readWhoop()
  const snapshot = useSiteSnapshot()

  const summary = useAiSummary({
    id: 'sport-signal',
    context: SPORT_CONTEXT + (lang === 'en' ? ' Reply in English.' : ''),
    snapshot,
    message: 'Одна короткая тренерская фраза по спорту на сегодня.',
    fallback: ''
  })

  const metrics = []
  if (g?.weekKm != null) metrics.push({ label: t.week, value: `${g.weekKm} ${t.km}` })
  if (w?.strain != null) metrics.push({ label: t.load, value: `${w.strain}/21` })
  else if (g?.vo2Max != null) metrics.push({ label: 'VO₂max', value: `${g.vo2Max}` })
  if (!metrics.length) metrics.push({ label: '', value: t.connect })

  return (
    <SignalCard
      label={t.label}
      icon={ICON_SPORT}
      metrics={metrics}
      aiText={summary.text}
      aiLoading={summary.loading}
      onClick={() => navigate(g ? '/health' : '/connections', g ? { state: { tab: 'activity' } } : undefined)}
    />
  )
}
