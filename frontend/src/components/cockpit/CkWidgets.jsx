import CircularChart from '../CircularChart.jsx'
import { Icon } from '../../ui'
import { recoveryColor, SLEEP_STAGES, fmtHm } from '../../utils/whoop.js'
import { dueRetests } from '../../utils/healthSignal.js'
import { fmtDate, LABS_STORE_KEY } from '../../utils/labs.js'
import {
  loadProfile, computeTarget, loadGarmin, loadWhoop, loadPlan, loadIntake,
  workoutKcal, dynamicTarget, carryFromYesterday, eatenForDay
} from '../../utils/nutrition.js'
import { mskDateKey } from '../../utils/time.js'
import { useT, useLang } from '../../context/LanguageContext.jsx'

/*
  Виджеты «Одного экрана» — маленькие живые окна с ГРАФИЧЕСКОЙ подачей
  (кольцо, колонки тренда, полоса стадий сна, прогресс-бары, точки эффекта).
  Правило: клик по виджету разворачивает ИМЕННО его тему (scoped-панель),
  а не раздел с вкладками. Формы энкодинга у соседей не повторяются —
  единая сетка и типографика, разная геометрия данных.
*/

// Уровень восстановления для подписи (цвет — recoveryColor из utils/whoop)
const recLevel = (r) => (r >= 67 ? 'high' : r >= 34 ? 'mid' : 'low')

function WidgetShell({ label, onOpen, children, hint, className = '' }) {
  return (
    <button type="button" className={`card ckw ${className}`} onClick={onOpen} title={hint}>
      <span className="ckw-label">{label}</span>
      {children}
      <style>{`
        .ckw {
          display: flex; flex-direction: column; gap: 8px;
          padding: 14px 16px; min-width: 0; min-height: 0;
          font-family: inherit; text-align: left; cursor: pointer;
          transition: border-color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
        }
        .ckw:hover { transform: translateY(-2px); border-color: var(--accent); }
        .ckw-label {
          flex-shrink: 0;
          font-size: 11.5px; font-weight: 700; color: var(--text-secondary);
          text-transform: uppercase; letter-spacing: 0.06em;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .ckw-empty { font-size: 13px; color: var(--text-muted); line-height: 1.5; margin: auto 0; }
        .ckw-big { font-size: 27px; font-weight: 800; color: var(--text-primary); line-height: 1.05; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
        .ckw-big small { font-size: 13px; font-weight: 600; color: var(--text-muted); letter-spacing: 0; }
        .ckw-sub { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      `}</style>
    </button>
  )
}

/* ── Восстановление: кольцо + тренд 7 дней ── */
export function CkRecovery({ whoop, onOpen }) {
  const t = useT({
    ru: { label: 'Восстановление', high: 'высокое', mid: 'среднее', low: 'низкое', empty: 'Подключите Whoop, чтобы видеть восстановление и сон', week: '7 дней' },
    en: { label: 'Recovery', high: 'high', mid: 'medium', low: 'low', empty: 'Connect Whoop to see recovery and sleep', week: '7 days' },
  })
  const r = whoop?.recovery
  const week = whoop?.week || []
  return (
    <WidgetShell label={t.label} onOpen={onOpen} className="ckw-recovery">
      {r == null ? <div className="ckw-empty">{t.empty}</div> : (
        <div className="ckr-body">
          <CircularChart value={r} size={104} color={recoveryColor(r)} sublabel={t[recLevel(r)]} />
          {week.length > 0 && (
            <div className="ckr-week" aria-label={t.week}>
              {week.map((d, i) => (
                <div key={i} className="ckr-col">
                  <div className="ckr-bar-track">
                    <div
                      className={`ckr-bar ${i === week.length - 1 ? 'today' : ''}`}
                      style={{ height: `${Math.max(8, d.recovery)}%`, background: recoveryColor(d.recovery) }}
                    />
                  </div>
                  <span className="ckr-day">{d.day}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <style>{`
        .ckr-body { flex: 1; min-height: 0; display: flex; align-items: center; gap: 16px; }
        .ckr-week { flex: 1; min-width: 0; display: flex; gap: 6px; align-items: stretch; height: 96px; }
        .ckr-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .ckr-bar-track { flex: 1; display: flex; align-items: flex-end; background: var(--bg-tile); border-radius: 5px; overflow: hidden; }
        .ckr-bar { width: 100%; border-radius: 5px 5px 0 0; opacity: 0.55; transition: height 0.6s var(--ease); }
        .ckr-bar.today { opacity: 1; }
        .ckr-day { font-size: 10px; color: var(--text-faint); text-align: center; }
        @media (max-width: 1500px) { .ckw-recovery .cc { display: none; } } /* в тесноте тренд важнее кольца */
      `}</style>
    </WidgetShell>
  )
}

/* ── Сон: часы + полоса стадий ── */
export function CkSleep({ whoop, onOpen }) {
  const { lang } = useLang()
  const t = useT({
    ru: { label: 'Сон', h: 'ч', of: (n) => `из ${n} нужных`, empty: 'Нет данных сна — подключите Whoop' },
    en: { label: 'Sleep', h: 'h', of: (n) => `of ${n} needed`, empty: 'No sleep data — connect Whoop' },
  })
  const s = whoop?.sleep
  const stages = s?.stages
  const total = stages ? Object.values(stages).reduce((a, b) => a + b, 0) : 0
  return (
    <WidgetShell label={t.label} onOpen={onOpen}>
      {!s ? <div className="ckw-empty">{t.empty}</div> : (
        <div className="cks-body">
          <div className="ckw-big">{s.hoursSlept} <small>{t.h} · {s.performance}%</small></div>
          <span className="ckw-sub">{t.of(s.hoursNeeded)}{s.start && s.end ? ` · ${s.start} – ${s.end}` : ''}</span>
          {total > 0 && (
            <>
              <div className="cks-bar">
                {SLEEP_STAGES.map(st => (
                  <div
                    key={st.key}
                    title={`${lang === 'en' ? st.key : st.label} · ${fmtHm(stages[st.key])}`}
                    style={{ width: `${(stages[st.key] / total) * 100}%`, background: st.color }}
                  />
                ))}
              </div>
              <div className="cks-legend">
                {SLEEP_STAGES.filter(st => st.key !== 'awake').map(st => (
                  <span key={st.key} className="cks-leg-item">
                    <i style={{ background: st.color }} />{Math.round(stages[st.key] / 60 * 10) / 10}{t.h}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <style>{`
        .cks-body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 7px; justify-content: center; }
        .cks-bar { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--bg-tile); }
        .cks-legend { display: flex; gap: 12px; flex-wrap: wrap; }
        .cks-leg-item { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
        .cks-leg-item i { width: 8px; height: 8px; border-radius: 3px; }
      `}</style>
    </WidgetShell>
  )
}

/* ── Нагрузка дня + последняя тренировка («билет») ── */
const SPORT_ICON = { running: 'sport-run', cycling: 'sport-bike', lap_swimming: 'sport-swim' }
export function CkLoad({ whoop, garmin, onOpen }) {
  const { lang } = useLang()
  const t = useT({
    ru: { label: 'Нагрузка и тренировка', of: 'из 21', km: 'км', min: 'мин', hr: 'пульс', empty: 'Подключите Garmin, чтобы видеть тренировки' },
    en: { label: 'Strain & workout', of: 'of 21', km: 'km', min: 'min', hr: 'HR', empty: 'Connect Garmin to see workouts' },
  })
  const strain = whoop?.strain
  const w = garmin?.lastWorkout
  const effect = w?.trainingEffect != null ? Math.max(0, Math.min(5, Math.round(w.trainingEffect))) : null
  const pick = (o, f) => (lang === 'en' && o?.[f + 'En']) ? o[f + 'En'] : o?.[f]
  return (
    <WidgetShell label={t.label} onOpen={onOpen}>
      {(strain == null && !w) ? <div className="ckw-empty">{t.empty}</div> : (
        <div className="ckl-body">
          {strain != null && (
            <div className="ckl-strain">
              <CircularChart value={(strain / 21) * 100} size={72} color="var(--accent)" centerText={`${strain}`} />
              <span className="ckw-sub">{t.of}</span>
            </div>
          )}
          {w && (
            <div className="ckl-ticket">
              <span className="ckl-ic"><Icon name={SPORT_ICON[w.type] || 'sport-gym'} size={17} /></span>
              <div className="ckl-tx">
                <span className="ckl-title">{pick(w, 'title') || pick(w, 'label')}</span>
                <span className="ckw-sub">
                  {[w.distanceKm && `${w.distanceKm} ${t.km}`, w.durationMin && `${w.durationMin} ${t.min}`, w.avgHr && `${t.hr} ${w.avgHr}`].filter(Boolean).join(' · ')}
                </span>
                {effect != null && (
                  <span className="ckl-dots" title={`Training effect ${w.trainingEffect}`}>
                    {[1, 2, 3, 4, 5].map(n => <i key={n} className={n <= effect ? 'on' : ''} />)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <style>{`
        .ckl-body { flex: 1; min-height: 0; display: flex; align-items: center; gap: 14px; }
        .ckl-strain { display: flex; flex-direction: column; align-items: center; gap: 2px; flex-shrink: 0; }
        .ckl-ticket { flex: 1; min-width: 0; display: flex; gap: 10px; align-items: flex-start; }
        .ckl-ic {
          width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
          background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent);
          display: flex; align-items: center; justify-content: center;
        }
        .ckl-tx { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .ckl-title { font-size: 14px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ckl-dots { display: flex; gap: 4px; margin-top: 2px; }
        .ckl-dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--bg-tile); border: 1px solid var(--border-med); }
        .ckl-dots i.on { background: var(--accent); border-color: var(--accent); }
      `}</style>
    </WidgetShell>
  )
}

/* ── Шаги: число + прогресс к цели + неделя ── */
export function CkSteps({ garmin, onOpen }) {
  const t = useT({
    ru: { label: 'Шаги', goal: (n) => `цель ${n.toLocaleString('ru-RU')}`, week: (km, n) => `за неделю ${km} км · ${n} трен.`, empty: 'Подключите Garmin' },
    en: { label: 'Steps', goal: (n) => `goal ${n.toLocaleString('en-US')}`, week: (km, n) => `this week ${km} km · ${n} workouts`, empty: 'Connect Garmin' },
  })
  const steps = garmin?.steps
  const goal = garmin?.stepsGoal || 10000
  return (
    <WidgetShell label={t.label} onOpen={onOpen}>
      {steps == null ? <div className="ckw-empty">{t.empty}</div> : (
        <div className="ckp-body">
          <div className="ckw-big">{steps.toLocaleString('ru-RU')}</div>
          <div className="ckp-track">
            <div className="ckp-fill" style={{ width: `${Math.min(100, (steps / goal) * 100)}%` }} />
          </div>
          <span className="ckw-sub">{t.goal(goal)}{garmin?.weekKm != null ? ` · ${t.week(garmin.weekKm, garmin.weekCount ?? '—')}` : ''}</span>
        </div>
      )}
      <style>{`
        .ckp-body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; justify-content: center; }
        .ckp-track { height: 9px; border-radius: 5px; background: var(--bg-tile); overflow: hidden; }
        .ckp-fill { height: 100%; border-radius: 5px; background: linear-gradient(180deg, var(--accent-btn-top), var(--accent-btn-bot)); transition: width 0.6s var(--ease); }
      `}</style>
    </WidgetShell>
  )
}

/* ── Питание: ккал-бар дня (живая цель) ── */
export function CkNutrition({ onOpen }) {
  const t = useT({
    ru: { label: 'Питание', kcal: 'ккал', eaten: (e, r) => `съедено ~${e.toLocaleString('ru-RU')} · осталось ~${r.toLocaleString('ru-RU')}` },
    en: { label: 'Nutrition', kcal: 'kcal', eaten: (e, r) => `eaten ~${e.toLocaleString('en-US')} · left ~${r.toLocaleString('en-US')}` },
  })
  // Та же живая цель, что на странице «Питание»: база + тренировки + восстановление + перенос
  const profile = loadProfile()
  const base = computeTarget(profile)
  const garmin = loadGarmin()
  const whoop = loadWhoop()
  const plan = loadPlan()
  const intake = loadIntake()
  const dk = mskDateKey()
  const burned = workoutKcal(garmin, dk, base.bmr)
  const carry = carryFromYesterday(plan, dk, base.kcal)
  const target = dynamicTarget(base, profile, { burned, hasGarmin: !!garmin, recovery: whoop?.recovery ?? null, carry })
  const eaten = eatenForDay(plan, intake, dk)
  const remaining = Math.max(0, target.kcal - eaten)
  return (
    <WidgetShell label={t.label} onOpen={onOpen}>
      <div className="ckn-body">
        <div className="ckw-big">{eaten.toLocaleString('ru-RU')} <small>/ {target.kcal.toLocaleString('ru-RU')} {t.kcal}</small></div>
        <div className="ckn-track">
          <div className="ckn-fill" style={{ width: `${Math.min(100, target.kcal ? (eaten / target.kcal) * 100 : 0)}%` }} />
        </div>
        <span className="ckw-sub">{t.eaten(eaten, remaining)}</span>
      </div>
      <style>{`
        .ckn-body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; justify-content: center; }
        .ckn-track { height: 9px; border-radius: 5px; background: var(--bg-tile); overflow: hidden; }
        .ckn-fill { height: 100%; border-radius: 5px; background: var(--status-ok); opacity: 0.85; transition: width 0.6s var(--ease); }
      `}</style>
    </WidgetShell>
  )
}

/* ── Анализы: статус + напоминание пересдачи ── */
export function CkLabs({ onOpen }) {
  const t = useT({
    ru: { label: 'Анализы', retest: 'Пора пересдать', markers: (n) => `${n} маркеров`, last: 'сдано', none: 'Загрузите анализы — ИИ расшифрует', upload: 'загрузка + ИИ-разбор' },
    en: { label: 'Labs', retest: 'Time to retest', markers: (n) => `${n} markers`, last: 'taken', none: 'Upload labs — AI will decode them', upload: 'upload + AI breakdown' },
  })
  let reports = []
  try { const s = localStorage.getItem(LABS_STORE_KEY); if (s) reports = JSON.parse(s) } catch { /* ignore */ }
  const due = dueRetests(reports)
  const latest = [...reports].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
  return (
    <WidgetShell label={t.label} onOpen={onOpen}>
      {!latest ? <div className="ckw-empty">{t.none}</div> : (
        <div className="cka-body">
          {due.length > 0 ? (
            <>
              <span className="cka-due"><i />{t.retest}</span>
              <span className="cka-name">{due[0].name}</span>
              <span className="ckw-sub">{t.last} {fmtDate(due[0].date)}</span>
            </>
          ) : (
            <>
              <div className="ckw-big">{Object.keys(latest.values || {}).length} <small>{t.markers(Object.keys(latest.values || {}).length).replace(/^\d+ /, '')}</small></div>
              <span className="ckw-sub">{t.last} {fmtDate(latest.date)} · {t.upload}</span>
            </>
          )}
        </div>
      )}
      <style>{`
        .cka-body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 5px; justify-content: center; }
        .cka-due { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 700; color: var(--status-warn); }
        .cka-due i { width: 8px; height: 8px; border-radius: 50%; background: var(--status-warn); }
        .cka-name { font-size: 15px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      `}</style>
    </WidgetShell>
  )
}

/* ── Виталы: строка small multiples (только реально присутствующие) ── */
export function CkVitals({ whoop, garmin, onOpen }) {
  const t = useT({
    ru: { hrv: 'HRV', rhr: 'Пульс покоя', spo2: 'SpO₂', resp: 'Дыхание', skin: 'Темп. кожи', vo2: 'VO₂max', bb: 'Body Battery', ms: 'мс' },
    en: { hrv: 'HRV', rhr: 'Resting HR', spo2: 'SpO₂', resp: 'Respiration', skin: 'Skin temp', vo2: 'VO₂max', bb: 'Body Battery', ms: 'ms' },
  })
  const items = [
    whoop?.hrv != null && { lbl: t.hrv, val: `${whoop.hrv} ${t.ms}` },
    (whoop?.rhr ?? garmin?.restingHr) != null && { lbl: t.rhr, val: `${whoop?.rhr ?? garmin?.restingHr}` },
    whoop?.spo2 != null && { lbl: t.spo2, val: `${whoop.spo2}%` },
    whoop?.respiratoryRate != null && { lbl: t.resp, val: `${whoop.respiratoryRate}` },
    whoop?.skinTempDelta != null && { lbl: t.skin, val: `${whoop.skinTempDelta > 0 ? '+' : ''}${whoop.skinTempDelta}°` },
    garmin?.vo2Max != null && { lbl: t.vo2, val: `${garmin.vo2Max}` },
    garmin?.bodyBattery?.current != null && { lbl: t.bb, val: `${garmin.bodyBattery.current}` },
  ].filter(Boolean)
  if (!items.length) return null
  return (
    <button type="button" className="card ckv" onClick={onOpen}>
      {items.map((it, i) => (
        <span key={i} className="ckv-item">
          <span className="ckv-val">{it.val}</span>
          <span className="ckv-lbl">{it.lbl}</span>
        </span>
      ))}
      <style>{`
        .ckv {
          display: flex; align-items: center; justify-content: space-around; gap: 8px;
          padding: 10px 16px; min-width: 0; cursor: pointer; font-family: inherit;
          transition: border-color var(--dur-fast) var(--ease);
        }
        .ckv:hover { border-color: var(--accent); }
        .ckv-item { display: flex; flex-direction: column; align-items: center; gap: 1px; min-width: 0; }
        .ckv-val { font-size: 16.5px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; white-space: nowrap; }
        .ckv-lbl { font-size: 10.5px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
      `}</style>
    </button>
  )
}
