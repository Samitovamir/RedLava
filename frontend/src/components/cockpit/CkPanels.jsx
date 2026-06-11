import { useState } from 'react'
import SleepHypnogram from '../SleepHypnogram.jsx'
import CircularChart from '../CircularChart.jsx'
import { recoveryColor, SLEEP_STAGES, fmtHm, WHOOP_DAYS } from '../../utils/whoop.js'
import { useT } from '../../context/LanguageContext.jsx'

/*
  Scoped-панели «Одного экрана»: разворот ИМЕННО той темы, на которую нажали.
  «Сон» — только сон (гипнограмма + метрики ночи). «Восстановление» — только
  восстановление (тренд недели + комментарий). Никаких разделов с вкладками.
*/

function ConnectHint({ text }) {
  return (
    <div className="ckpn-empty">
      {text}
      <style>{`.ckpn-empty { font-size: 14.5px; color: var(--text-muted); line-height: 1.6; padding: 28px 8px; text-align: center; }`}</style>
    </div>
  )
}

/* ── Панель «Сон» ── */
export function CkSleepPanel({ whoop }) {
  const t = useT({
    ru: {
      empty: 'Whoop не подключён — подключите в Настройках, чтобы видеть сон по фазам.',
      slept: 'Проспал', need: 'Потребность', perf: 'Выполнение', eff: 'Эффективность', h: 'ч', window: 'Окно сна',
    },
    en: {
      empty: 'Whoop is not connected — connect it in Settings to see sleep stages.',
      slept: 'Slept', need: 'Needed', perf: 'Performance', eff: 'Efficiency', h: 'h', window: 'Sleep window',
    },
  })
  const s = whoop?.sleep
  if (!s) return <ConnectHint text={t.empty} />
  const stats = [
    { lbl: t.slept, val: `${s.hoursSlept} ${t.h}` },
    { lbl: t.need, val: `${s.hoursNeeded} ${t.h}` },
    { lbl: t.perf, val: `${s.performance}%` },
    { lbl: t.eff, val: `${s.efficiency}%` },
    s.start && s.end && { lbl: t.window, val: `${s.start} – ${s.end}` },
  ].filter(Boolean)
  return (
    <div className="ckpn-sleep">
      <div className="ckpn-stats">
        {stats.map((it, i) => (
          <div key={i} className="ckpn-stat">
            <span className="ckpn-val">{it.val}</span>
            <span className="ckpn-lbl">{it.lbl}</span>
          </div>
        ))}
      </div>
      <div className="ckpn-stages">
        {SLEEP_STAGES.map(st => (
          <span key={st.key} className="ckpn-stage"><i style={{ background: st.color }} />{st.label} · {fmtHm(s.stages[st.key])}</span>
        ))}
      </div>
      <SleepHypnogram stages={s.stages} start={s.start} end={s.end} />
      <style>{`
        .ckpn-sleep { display: flex; flex-direction: column; gap: 18px; }
        .ckpn-stats { display: flex; gap: 10px; flex-wrap: wrap; }
        .ckpn-stat {
          flex: 1; min-width: 110px;
          background: var(--bg-tile); border: 1px solid var(--border); border-radius: 12px;
          padding: 12px 14px; display: flex; flex-direction: column; gap: 2px;
        }
        .ckpn-val { font-size: 20px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; white-space: nowrap; }
        .ckpn-lbl { font-size: 11.5px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .ckpn-stages { display: flex; gap: 14px; flex-wrap: wrap; }
        .ckpn-stage { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text-body); }
        .ckpn-stage i { width: 9px; height: 9px; border-radius: 3px; }
      `}</style>
    </div>
  )
}

/* ── Панель «Восстановление» ── */
export function CkRecoveryPanel({ whoop }) {
  const t = useT({
    ru: {
      empty: 'Whoop не подключён — подключите в Настройках, чтобы видеть восстановление.',
      week: 'Неделя', hrv: 'HRV', rhr: 'Пульс покоя', resp: 'Дыхание', ms: 'мс',
      high: 'Организм хорошо восстановился. Хороший день для интенсивной тренировки.',
      mid: 'Среднее восстановление. Лучше умеренная нагрузка, без рекордов.',
      low: 'Низкое восстановление. День для отдыха или лёгкой активности.',
      dayHigh: 'Высокое', dayMid: 'Среднее', dayLow: 'Низкое',
    },
    en: {
      empty: 'Whoop is not connected — connect it in Settings to see recovery.',
      week: 'Week', hrv: 'HRV', rhr: 'Resting HR', resp: 'Respiration', ms: 'ms',
      high: 'Your body has recovered well. A good day for an intense workout.',
      mid: 'Medium recovery. Better to keep the load moderate.',
      low: 'Low recovery. A day for rest or light activity.',
      dayHigh: 'High', dayMid: 'Medium', dayLow: 'Low',
    },
  })
  const week = whoop?.week?.length ? whoop.week : (whoop ? WHOOP_DAYS : [])
  const [sel, setSel] = useState(week.length - 1)
  if (!whoop) return <ConnectHint text={t.empty} />
  const r = whoop.recovery
  const note = r >= 67 ? t.high : r >= 34 ? t.mid : t.low
  const lvl = (v) => (v >= 67 ? t.dayHigh : v >= 34 ? t.dayMid : t.dayLow)
  const d = week[sel]
  return (
    <div className="ckpn-rec">
      <div className="ckpn-rec-top">
        <CircularChart value={r} size={132} color={recoveryColor(r)} sublabel={lvl(r)} />
        <div className="ckpn-rec-side">
          <p className="ckpn-note">{note}</p>
          <div className="ckpn-mini">
            {whoop.hrv != null && <span>{t.hrv} <b>{whoop.hrv} {t.ms}</b></span>}
            {whoop.rhr != null && <span>{t.rhr} <b>{whoop.rhr}</b></span>}
            {whoop.respiratoryRate != null && <span>{t.resp} <b>{whoop.respiratoryRate}</b></span>}
          </div>
        </div>
      </div>
      {week.length > 0 && (
        <div className="ckpn-week">
          <span className="ckpn-week-lbl">{t.week}</span>
          <div className="ckpn-bars">
            {week.map((dd, i) => (
              <button key={i} className={`ckpn-barcol ${i === sel ? 'sel' : ''}`} onClick={() => setSel(i)}>
                <span className="ckpn-barval">{dd.recovery}</span>
                <div className="ckpn-track"><div style={{ height: `${dd.recovery}%`, background: recoveryColor(dd.recovery) }} /></div>
                <span className="ckpn-barday">{dd.day}</span>
              </button>
            ))}
          </div>
          {d && <p className="ckpn-day-note">{d.day}: {d.recovery}% · {lvl(d.recovery)}{d.strain != null ? ` · strain ${d.strain}` : ''}</p>}
        </div>
      )}
      <style>{`
        .ckpn-rec { display: flex; flex-direction: column; gap: 22px; }
        .ckpn-rec-top { display: flex; align-items: center; gap: 26px; flex-wrap: wrap; }
        .ckpn-rec-side { flex: 1; min-width: 240px; display: flex; flex-direction: column; gap: 12px; }
        .ckpn-note { font-size: 15px; line-height: 1.6; color: var(--text-body); }
        .ckpn-mini { display: flex; gap: 18px; flex-wrap: wrap; font-size: 13px; color: var(--text-muted); }
        .ckpn-mini b { color: var(--text-primary); font-variant-numeric: tabular-nums; }
        .ckpn-week { display: flex; flex-direction: column; gap: 10px; }
        .ckpn-week-lbl { font-size: 11.5px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; }
        .ckpn-bars { display: flex; gap: 10px; align-items: stretch; height: 150px; }
        .ckpn-barcol {
          flex: 1; display: flex; flex-direction: column; gap: 5px; min-width: 0;
          background: none; border: none; padding: 0; cursor: pointer; font-family: inherit;
        }
        .ckpn-barval { font-size: 11.5px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
        .ckpn-track { flex: 1; display: flex; align-items: flex-end; background: var(--bg-tile); border-radius: 7px; overflow: hidden; border: 1px solid transparent; transition: border-color var(--dur-fast) var(--ease); }
        .ckpn-barcol.sel .ckpn-track { border-color: var(--accent); }
        .ckpn-track div { width: 100%; border-radius: 7px 7px 0 0; opacity: 0.7; transition: height 0.5s var(--ease); }
        .ckpn-barcol.sel .ckpn-track div { opacity: 1; }
        .ckpn-barday { font-size: 11px; color: var(--text-faint); text-align: center; }
        .ckpn-day-note { font-size: 13.5px; color: var(--text-body); }
      `}</style>
    </div>
  )
}
