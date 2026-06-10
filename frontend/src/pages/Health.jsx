import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import GarminLive from '../components/GarminLive.jsx'
import MetricsView from '../components/MetricsView.jsx'
import HealthAssistant from '../components/HealthAssistant.jsx'
import { useT } from '../context/LanguageContext.jsx'

/*
  Страница «Здоровье» — объединяет спорт и здоровье.
  Две вкладки: «Активность» (тренировки/шаги/объём — Garmin) и «Показатели»
  (восстановление/сон/VO2max/анализы). Встроенных ИИ-чатов нет — вместо них
  плавающая круг-кнопка ИИ (HealthAssistant), которая знает текущую вкладку.
*/
export default function Health() {
  const navigate = useNavigate()
  const t = useT({
    ru: {
      heading: 'Здоровье', activity: 'Активность', metrics: 'Показатели',
      srcGarmin: 'Garmin Connect', srcMetrics: 'Whoop · анализы',
      notConnTitle: 'Garmin не подключён',
      notConnText: 'Подключите Garmin, чтобы видеть тренировки, шаги и форму.',
      go: 'Перейти к подключениям'
    },
    en: {
      heading: 'Health', activity: 'Activity', metrics: 'Metrics',
      srcGarmin: 'Garmin Connect', srcMetrics: 'Whoop · labs',
      notConnTitle: 'Garmin is not connected',
      notConnText: 'Connect Garmin to see your workouts, steps and fitness.',
      go: 'Go to connections'
    }
  })

  const [tab, setTab] = useState('activity')
  const garminConnected = (() => {
    try { return !!localStorage.getItem('albert-garmin-live') } catch { return false }
  })()

  return (
    <div className="health-page">
      <div className="page-header">
        <h2>{t.heading}</h2>
        <span className="muted">{tab === 'activity' ? t.srcGarmin : t.srcMetrics}</span>
      </div>

      <div className="health-tabs" role="tablist">
        <button className={`health-tab ${tab === 'activity' ? 'active' : ''}`} onClick={() => setTab('activity')}>{t.activity}</button>
        <button className={`health-tab ${tab === 'metrics' ? 'active' : ''}`} onClick={() => setTab('metrics')}>{t.metrics}</button>
      </div>

      {tab === 'activity'
        ? (garminConnected
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
                <button className="hcn-btn" onClick={() => navigate('/connections')}>{t.go}</button>
              </div>
            ))
        : <MetricsView />}

      <HealthAssistant tab={tab} />

      <style>{`
        .health-page { display: flex; flex-direction: column; gap: 20px; max-width: 1400px; padding-bottom: 40px; }
        .page-header { display: flex; align-items: baseline; gap: 12px; }
        .page-header h2 { font-size: 24px; font-weight: 700; color: var(--foreground); }
        .muted { color: var(--muted-foreground); }

        .health-tabs {
          display: inline-flex; gap: 4px; align-self: flex-start;
          background: var(--bg-surface); border: 1px solid var(--border);
          padding: 4px; border-radius: 12px;
        }
        .health-tab {
          padding: 8px 18px; border: none; background: transparent;
          color: var(--muted-foreground); font-family: inherit; font-size: 14px; font-weight: 600;
          border-radius: 9px; cursor: pointer; transition: all 0.18s;
        }
        .health-tab:hover { color: var(--foreground); }
        .health-tab.active { background: var(--accent); color: var(--on-accent); border-color: transparent; }

        /* Ряд метрик тренировки (GarminLive embedded): подпись в одну строку,
           плитки ряда одной высоты — «Эффект · аэробный» больше не растягивает плитку */
        .health-page .gl-hero-grid { align-items: stretch; grid-auto-rows: 1fr; }
        .health-page .gl-metric { min-width: 0; }
        .health-page .gl-metric-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .health-connect { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; padding: 44px 28px; }
        .hcn-ic { width: 60px; height: 60px; border-radius: 16px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); display: flex; align-items: center; justify-content: center; }
        .hcn-title { font-size: 19px; font-weight: 700; color: var(--foreground); }
        .hcn-text { font-size: 15px; color: var(--muted-foreground); max-width: 420px; line-height: 1.6; }
        .hcn-btn { margin-top: 6px; padding: 11px 22px; border: none; border-radius: 12px; background: var(--accent); color: var(--accent-foreground); font-family: inherit; font-size: 14.5px; font-weight: 600; cursor: pointer; transition: opacity 0.15s; }
        .hcn-btn:hover { opacity: 0.9; }
      `}</style>
    </div>
  )
}
