import { motion } from 'framer-motion'
import { useEvents } from '../context/EventsContext.jsx'
import { useMemoryFacts } from '../context/MemoryContext.jsx'
import { useLang, useT } from '../context/LanguageContext.jsx'
import { useAiSummary } from '../hooks/useAiSummary.js'
import { buildSignalData, SIGNAL_CONTEXT, parseSignal, fallbackSignal } from '../utils/daySignal.js'
import { mskNow } from '../utils/time.js'
import { nutritionToday } from '../utils/nutrition.js'
import StressGauge from './StressGauge.jsx'

function readLS(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null } catch { return null }
}

// Прогресс событий дня: сколько уже прошло и сколько осталось (по времени начала)
function eventsProgress(events) {
  const now = mskNow()
  const p = n => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const list = events.filter(e => e.date === today)
  const toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || ''); return m ? +m[1] * 60 + +m[2] : null }
  const total = list.length
  const passed = list.filter(e => { const s = toMin(e.start); return s != null && s <= nowMin }).length
  const next = list.map(e => ({ e, m: toMin(e.start) })).filter(x => x.m != null && x.m > nowMin).sort((a, b) => a.m - b.m)[0]?.e || null
  return { total, passed, remaining: total - passed, next }
}

/*
  Верхний hero-баннер «СТАТУС» на Главной.
  Заголовок-вывод + короткий разбор по доменам (стресс/впереди/спорт/анализы/питание) +
  строка обобщённого совета. Тонкая цветная рамка-оценка: зелёный/оранжевый/красный
  (статус-токены дизайн-системы). Контент — от ИИ (режимы и пороги из ЛИЧНОЙ нормы в
  памяти; crit редкий; тон-информатор, решение за владельцем). Кэш — в пределах фазы дня,
  так что окно живёт по ходу дня, но не дёргается каждую минуту.
*/

export default function TodaySignal() {
  const { lang } = useLang()
  const { events } = useEvents()
  const { facts } = useMemoryFacts()
  const t = useT({
    ru: {
      eyebrow: 'Статус', stress: 'Стресс', events: 'События дня',
      passedOf: (a, b) => `Прошло ${a} из ${b}`, leftN: (n) => `осталось ${n}`, nextUp: 'Дальше', freeDay: 'На сегодня событий нет',
      health: 'Восстановление ↔ Нагрузка', recoveryW: 'Восст.', loadW: 'Нагрузка',
      balOk: 'есть запас', balMid: 'баланс', balBad: 'перегруз',
      sport: 'Спорт · за неделю', km: 'км', wkTrain: (n) => `${n} трен.`, todayTrain: (n) => `сегодня ${n}`,
      nutrition: 'Питание', eatenW: 'съедено', kcal: 'ккал', leftKcal: (n) => `осталось ${n} ккал`
    },
    en: {
      eyebrow: 'Status', stress: 'Stress', events: "Today's events",
      passedOf: (a, b) => `${a} of ${b} done`, leftN: (n) => `${n} left`, nextUp: 'Next', freeDay: 'No events today',
      health: 'Recovery ↔ Strain', recoveryW: 'Recovery', loadW: 'Strain',
      balOk: 'surplus', balMid: 'balanced', balBad: 'overload',
      sport: 'Sport · this week', km: 'km', wkTrain: (n) => `${n} workouts`, todayTrain: (n) => `today ${n}`,
      nutrition: 'Nutrition', eatenW: 'eaten', kcal: 'kcal', leftKcal: (n) => `${n} kcal left`
    }
  })
  // ── Детерминированные виджеты по доменам (из реальных данных, без ИИ) ──
  const whoop = readLS('albert-whoop-live')
  const garmin = readLS('albert-garmin-live')
  const nut = (() => { try { return nutritionToday() } catch { return null } })()
  const stress = garmin?.stress ? (garmin.stress.recent ?? garmin.stress.current ?? garmin.stress.avg ?? null) : null
  const ev = eventsProgress(events)
  const evPct = ev.total ? Math.round(ev.passed / ev.total * 100) : 0

  // Здоровье: восстановление ↔ нагрузка
  const recovery = whoop?.recovery ?? null
  const strain = whoop?.strain ?? null
  const strainMax = whoop?.strainMax || 21
  const loadPct = strain != null ? Math.min(100, Math.round(strain / strainMax * 100)) : null
  const healthOk = recovery != null && loadPct != null
  const balDiff = healthOk ? recovery - loadPct : 0
  const balColor = balDiff >= 15 ? 'var(--status-ok)' : balDiff <= -15 ? 'var(--status-crit)' : 'var(--status-warn)'

  // Спорт: факт за неделю (тренировки + километраж) — из Garmin
  const todayKey = (() => { const n = mskNow(); const q = x => String(x).padStart(2, '0'); return `${n.getFullYear()}-${q(n.getMonth() + 1)}-${q(n.getDate())}` })()
  const workouts = garmin?.workouts || []
  const sportToday = workouts.filter(w => w.date === todayKey).length
  const weekKm = garmin?.weekKm ?? null
  const weekCount = garmin?.weekCount ?? null
  const hasSport = weekKm != null || workouts.length > 0

  // Питание: съедено / осталось
  const nutOk = nut?.hasData
  const nutPct = nutOk && nut.target?.kcal ? Math.min(100, Math.round(nut.eaten / nut.target.kcal * 100)) : 0

  const hasAnyWidget = stress != null || healthOk || hasSport || nutOk || ev.total > 0

  const signalData = buildSignalData({ events, facts })
  const fb = fallbackSignal(lang)

  const summary = useAiSummary({
    id: 'today-signal',
    context: SIGNAL_CONTEXT + (lang === 'en' ? '\nReply in English (keep the field labels in Russian: СТАТУС/Заголовок/Стресс/Впереди/Спорт/Здоровье/Питание/Совет).' : ''),
    snapshot: signalData,
    message: 'Сформируй сегодняшний баннер «СТАТУС» строго по формату: служебная строка статуса, заголовок, строки по разделам и строка-совет.',
    fallback: ''
  })

  const parsed = summary.text ? parseSignal(summary.text) : null
  const status = parsed?.status || fb.status
  const headline = parsed?.headline || fb.headline
  const rows = (parsed?.rows && parsed.rows.length) ? parsed.rows : fb.rows
  const advice = parsed?.advice || fb.advice

  return (
    <motion.div
      className={`card today-signal st-${status}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <span className="ts-eyebrow">{t.eyebrow}</span>
      <h2 className="ts-headline">{headline}</h2>

      {rows.length > 0 && (
        <div className="ts-rows">
          {rows.map((r, i) => (
            <div className="ts-row" key={`${r.label}-${i}`}>
              <span className="ts-row-label">{r.label}</span>
              <span className="ts-row-value">{r.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Графические виджеты по доменам — из реальных данных, всегда (не зависят от ИИ) */}
      {hasAnyWidget && (
        <div className="ts-widgets">
          {/* Стресс — спидометр */}
          {stress != null && (
            <div className="ts-tile ts-tile-stress">
              <StressGauge value={stress} label={t.stress} />
            </div>
          )}

          {/* Здоровье — восстановление ↔ нагрузка */}
          {healthOk && (
            <div className="ts-tile">
              <div className="ts-tile-title">{t.health}</div>
              <div className="ts-bal-row">
                <span className="ts-bal-lbl">{t.recoveryW}</span>
                <div className="ts-bar"><motion.div className="ts-bar-fill" style={{ background: 'var(--status-ok)' }} initial={{ width: 0 }} animate={{ width: `${recovery}%` }} transition={{ duration: 0.7, ease: 'easeOut' }} /></div>
                <span className="ts-bal-val">{recovery}%</span>
              </div>
              <div className="ts-bal-row">
                <span className="ts-bal-lbl">{t.loadW}</span>
                <div className="ts-bar"><motion.div className="ts-bar-fill" style={{ background: 'var(--accent)' }} initial={{ width: 0 }} animate={{ width: `${loadPct}%` }} transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }} /></div>
                <span className="ts-bal-val">{strain}</span>
              </div>
              <div className="ts-verdict"><span className="ts-dot" style={{ background: balColor }} />{balDiff >= 15 ? t.balOk : balDiff <= -15 ? t.balBad : t.balMid}</div>
            </div>
          )}

          {/* Спорт — факт за неделю */}
          {hasSport && (
            <div className="ts-tile">
              <div className="ts-tile-title">{t.sport}</div>
              <div className="ts-big">{weekKm != null ? weekKm : '—'}<span className="ts-big-u"> {t.km}</span></div>
              <div className="ts-sub muted">{weekCount != null ? `${t.wkTrain(weekCount)} · ` : ''}{t.todayTrain(sportToday)}</div>
            </div>
          )}

          {/* Питание — съедено / осталось */}
          {nutOk && (
            <div className="ts-tile">
              <div className="ts-tile-title">{t.nutrition}</div>
              <div className="ts-bar ts-bar-lg"><motion.div className="ts-bar-fill" style={{ background: 'var(--accent)' }} initial={{ width: 0 }} animate={{ width: `${nutPct}%` }} transition={{ duration: 0.7, ease: 'easeOut' }} /></div>
              <div className="ts-sub muted">{nut.eaten} / {nut.target.kcal} {t.kcal} · {t.leftKcal(nut.remaining)}</div>
            </div>
          )}

          {/* События дня — ползунок (широкий) */}
          <div className="ts-tile ts-tile-wide">
            <div className="ts-tile-head">
              <span className="ts-tile-title">{t.events}</span>
              {ev.total > 0 && <span className="ts-tile-count">{t.passedOf(ev.passed, ev.total)} · {t.leftN(ev.remaining)}</span>}
            </div>
            {ev.total > 0 ? (
              <>
                <div className="ts-bar ts-bar-lg"><motion.div className="ts-bar-fill" style={{ background: 'var(--accent)' }} initial={{ width: 0 }} animate={{ width: `${evPct}%` }} transition={{ duration: 0.7, ease: 'easeOut' }} /></div>
                {ev.next && <div className="ts-sub muted">{t.nextUp}: {ev.next.start} · {ev.next.title}</div>}
              </>
            ) : (
              <div className="ts-sub muted">{t.freeDay}</div>
            )}
          </div>
        </div>
      )}

      {advice && <p className="ts-advice">{advice}</p>}

      <style>{`
        .ts-widgets { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-top: 6px; padding-top: 16px; border-top: 1px solid var(--border); align-items: stretch; }
        .ts-tile { background: var(--bg-tile, var(--bg-secondary)); border: 1px solid var(--border-med, var(--border)); border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
        .ts-tile-stress { align-items: center; justify-content: center; gap: 4px; }
        .ts-tile-wide { grid-column: 1 / -1; }
        .ts-tile-title { font-size: 13px; font-weight: 700; color: var(--foreground); }
        .ts-tile-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .ts-tile-count { font-size: 12.5px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
        /* мини-полосы восстановление/нагрузка */
        .ts-bal-row { display: grid; grid-template-columns: 64px 1fr auto; align-items: center; gap: 10px; }
        .ts-bal-lbl { font-size: 12px; font-weight: 600; color: var(--muted-foreground); }
        .ts-bal-val { font-size: 13px; font-weight: 700; color: var(--foreground); font-variant-numeric: tabular-nums; min-width: 40px; text-align: right; }
        .ts-bar { height: 9px; border-radius: 999px; background: var(--bg-secondary); box-shadow: var(--inset-tile); overflow: hidden; }
        .ts-bar-lg { height: 12px; }
        .ts-bar-fill { height: 100%; border-radius: 999px; }
        .ts-verdict { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-body); font-weight: 600; margin-top: 2px; }
        .ts-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
        .ts-big { font-size: 26px; font-weight: 800; color: var(--foreground); letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
        .ts-big-u { font-size: 0.5em; font-weight: 500; color: var(--muted-foreground); }
        .ts-sub { font-size: 12.5px; overflow-wrap: anywhere; }
        .today-signal {
          display: flex; flex-direction: column; gap: 12px; padding: 24px 28px;
          transition: border-color 0.3s var(--ease), box-shadow 0.3s var(--ease);
        }
        .ts-eyebrow {
          font-size: 12px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
          color: var(--accent);
        }
        .ts-headline {
          font-size: 28px; font-weight: 700; line-height: 1.16;
          color: var(--foreground); letter-spacing: -0.02em;
        }
        .ts-rows { display: flex; flex-direction: column; gap: 7px; margin-top: 2px; }
        .ts-row {
          display: grid; grid-template-columns: 96px 1fr; gap: 12px; align-items: baseline;
          font-size: 14.5px; line-height: 1.4;
        }
        .ts-row-label {
          color: var(--text-secondary); font-weight: 600;
          text-transform: none;
        }
        .ts-row-value { color: var(--text-body); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
        .ts-advice {
          font-size: 15px; line-height: 1.55; color: var(--text-body);
          max-width: 760px; margin-top: 4px; padding-top: 12px;
          border-top: 1px solid var(--border);
        }
        /* Рамка-оценка (тонко, как карточка подключения): зелёный / оранжевый / красный */
        .today-signal.st-ok {
          border-color: color-mix(in srgb, var(--status-ok) 40%, transparent);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--status-ok) 15%, transparent);
        }
        .today-signal.st-warn {
          border-color: color-mix(in srgb, var(--status-warn) 40%, transparent);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--status-warn) 15%, transparent);
        }
        .today-signal.st-crit {
          border-color: color-mix(in srgb, var(--status-crit) 40%, transparent);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--status-crit) 15%, transparent);
        }
        @media (max-width: 620px) {
          .today-signal { padding: 20px 18px; }
          .ts-headline { font-size: 24px; }
          .ts-row { grid-template-columns: 84px 1fr; font-size: 14px; }
        }
      `}</style>
    </motion.div>
  )
}
