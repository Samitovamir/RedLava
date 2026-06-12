import { useNavigate } from 'react-router-dom'
import { useT, useLang } from '../context/LanguageContext.jsx'
import { useAiSummary } from '../hooks/useAiSummary.js'
import { useSiteSnapshot } from '../hooks/useSiteSnapshot.js'
import SignalCard from './SignalCard.jsx'

/*
  Карточка «Здоровье» на Главной: пара метрик Whoop (восстановление / сон) + ОДНА фраза
  от ИИ про здоровье на сегодня. Акцент на восстановлении/сне/анализах, но ИИ держит в
  уме всю картину (через общий снимок) — приближается пересдача анализа, мало сна и т.п.
  Отличается от «Спорта» (тренерский совет) и «Статуса» (общий вывод).
*/

function readWhoop() {
  try { const s = localStorage.getItem('albert-whoop-live'); return s ? JSON.parse(s) : null } catch { return null }
}

const HEALTH_CONTEXT =
  'Ты внимательный помощник владельца по здоровью (триатлет, без мед. образования). По его данным ' +
  '(восстановление/сон/HRV Whoop, анализы крови, пора ли пересдать) дай ОДНУ короткую фразу про ' +
  'здоровье на сегодня: если приближается пересдача анализа — мягко напомни; если мало спал — скажи; ' +
  'если всё спокойно — подбодри. Не паникёр: мелкие отклонения объясняй спокойно, тревожный тон только ' +
  'когда реально важно. Решение за владельцем. Без вступлений, без markdown — РОВНО одно предложение.'

const ICON_HEART = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
)

export default function HealthSignal() {
  const navigate = useNavigate()
  const { lang } = useLang()
  const t = useT({
    ru: { label: 'Здоровье', recovery: 'Восстановление', sleep: 'Сон', h: 'ч', connect: 'Подключите Whoop' },
    en: { label: 'Health', recovery: 'Recovery', sleep: 'Sleep', h: 'h', connect: 'Connect Whoop' },
  })

  const whoop = readWhoop()
  const snapshot = useSiteSnapshot()

  const summary = useAiSummary({
    id: 'health-signal',
    context: HEALTH_CONTEXT + (lang === 'en' ? ' Reply in English.' : ''),
    snapshot,
    message: 'Одна короткая фраза про здоровье на сегодня.',
    fallback: ''
  })

  const metrics = []
  if (whoop?.recovery != null) metrics.push({ label: t.recovery, value: `${whoop.recovery}%` })
  if (whoop?.sleep?.hoursSlept != null) metrics.push({ label: t.sleep, value: `${whoop.sleep.hoursSlept} ${t.h}` })
  if (!metrics.length) metrics.push({ label: '', value: t.connect })

  return (
    <SignalCard
      label={t.label}
      icon={ICON_HEART}
      metrics={metrics}
      aiText={summary.text}
      aiLoading={summary.loading}
      onClick={() => navigate(whoop ? '/health' : '/connections', whoop ? { state: { tab: 'metrics' } } : undefined)}
    />
  )
}
