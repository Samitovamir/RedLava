import { useNavigate } from 'react-router-dom'
import GarminLive from '../components/GarminLive.jsx'
import MetricsView from '../components/MetricsView.jsx'
import HealthAssistant from '../components/HealthAssistant.jsx'
import { Button, SectionHeader } from '../ui'
import { useT } from '../context/LanguageContext.jsx'

/*
  Спорт и Здоровье — ДВЕ отдельные вкладки нижней навигации, но один компонент с
  переключателем view:
   • view="activity" (Спорт)     → тренировки/шаги/объём из Garmin (GarminLive)
   • view="metrics"  (Здоровье)  → восстановление/сон/VO2max/анализы (MetricsView)
  Роуты: /sport → activity, /health → metrics. Встроенного переключателя-вкладок нет —
  разделение даёт сама навигация. Плавающая ИИ-кнопка (HealthAssistant) знает вкладку.
*/
export default function Health({ view = 'metrics', showAssistant = true }) {
  const navigate = useNavigate()
  const isSport = view === 'activity'
  const t = useT({
    ru: {
      sport: 'Спорт', health: 'Здоровье',
      srcGarmin: 'Garmin Connect', srcMetrics: 'Whoop · анализы',
      notConnTitle: 'Garmin не подключён',
      notConnText: 'Подключите Garmin, чтобы видеть тренировки, шаги и форму.',
      go: 'Перейти к подключениям'
    },
    en: {
      sport: 'Sport', health: 'Health',
      srcGarmin: 'Garmin Connect', srcMetrics: 'Whoop · labs',
      notConnTitle: 'Garmin is not connected',
      notConnText: 'Connect Garmin to see your workouts, steps and fitness.',
      go: 'Go to connections'
    }
  })

  const garminConnected = (() => {
    try { return !!localStorage.getItem('albert-garmin-live') } catch { return false }
  })()

  const activitySection = garminConnected
    ? <GarminLive embedded />
    : (
      <div className="card health-connect">
        <div className="hcn-ic">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22v-5"/><path d="M9 7V2"/><path d="M15 7V2"/>
            <path d="M6 13V8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4Z"/>
          </svg>
        </div>
        <div className="hcn-title">{t.notConnTitle}</div>
        <div className="hcn-text">{t.notConnText}</div>
        <Button variant="primary" style={{ marginTop: 6 }} onClick={() => navigate('/connections')}>{t.go}</Button>
      </div>
    )

  return (
    <div className="health-page">
      <SectionHeader title={isSport ? t.sport : t.health} subtitle={isSport ? t.srcGarmin : t.srcMetrics} />

      {isSport ? activitySection : <MetricsView />}

      {showAssistant && <HealthAssistant tab={view} />}

      <style>{`
        .health-page { display: flex; flex-direction: column; gap: 20px; max-width: 1400px; padding-bottom: 40px; }
        .muted { color: var(--muted-foreground); }

        /* Ряд метрик тренировки (GarminLive embedded): подпись в одну строку,
           плитки ряда одной высоты — «Эффект · аэробный» больше не растягивает плитку */
        .health-page .gl-hero-grid { align-items: stretch; grid-auto-rows: 1fr; }
        .health-page .gl-metric { min-width: 0; }
        .health-page .gl-metric-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .health-connect { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; padding: 44px 28px; }
        .hcn-ic { width: 60px; height: 60px; border-radius: 16px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); display: flex; align-items: center; justify-content: center; }
        .hcn-title { font-size: 19px; font-weight: 700; color: var(--foreground); }
        .hcn-text { font-size: 15px; color: var(--muted-foreground); max-width: 420px; line-height: 1.6; }
      `}</style>
    </div>
  )
}
