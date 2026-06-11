import { useNavigate } from 'react-router-dom'
import { recoveryColor } from '../../utils/whoop.js'
import {
  loadProfile, computeTarget, loadGarmin, loadWhoop, loadPlan, loadIntake,
  workoutKcal, dynamicTarget, carryFromYesterday, eatenForDay
} from '../../utils/nutrition.js'
import { mskDateKey, mskNow } from '../../utils/time.js'
import { useEvents, dateKey } from '../../context/EventsContext.jsx'
import { useT, useLang } from '../../context/LanguageContext.jsx'

/*
  Правая колонка «Ленты» — «На виду»: липкая сводка ключевых чисел дня
  (восстановление, сон, шаги, питание, ближайшее событие). Заполняет правое
  поле журнальной полосы и даёт гланс-обзор, не прокручивая ленту.
  Клик по строке = переход к нужной главе (лента сама прокрутится).
*/

const recLevel = (r) => (r >= 67 ? 'high' : r >= 34 ? 'mid' : 'low')
const toMin = (s) => { const [h, m] = (s || '0:0').split(':').map(Number); return h * 60 + m }

export default function JournalGlance() {
  const navigate = useNavigate()
  const { lang } = useLang()
  const { events } = useEvents()
  const loc = lang === 'en' ? 'en-US' : 'ru-RU'
  const t = useT({
    ru: {
      title: 'На виду',
      recovery: 'Восстановление', sleep: 'Сон', steps: 'Шаги', nutrition: 'Питание', next: 'Ближайшее',
      high: 'высокое', mid: 'среднее', low: 'низкое', h: 'ч', kcal: 'ккал', free: 'День свободен',
    },
    en: {
      title: 'At a glance',
      recovery: 'Recovery', sleep: 'Sleep', steps: 'Steps', nutrition: 'Nutrition', next: 'Next up',
      high: 'high', mid: 'medium', low: 'low', h: 'h', kcal: 'kcal', free: 'Day is free',
    },
  })

  const whoop = loadWhoop()
  const garmin = loadGarmin()
  const rec = whoop?.recovery
  const sleep = whoop?.sleep
  const steps = garmin?.steps
  const stepsGoal = garmin?.stepsGoal || 10000

  // Живая цель питания — тот же расчёт, что на странице «Питание» и в кокпите
  const profile = loadProfile()
  const base = computeTarget(profile)
  const plan = loadPlan()
  const intake = loadIntake()
  const dk = mskDateKey()
  const burned = workoutKcal(garmin, dk, base.bmr)
  const carry = carryFromYesterday(plan, dk, base.kcal)
  const target = dynamicTarget(base, profile, { burned, hasGarmin: !!garmin, recovery: rec ?? null, carry })
  const eaten = eatenForDay(plan, intake, dk)

  // Ближайшее событие сегодня (ещё не закончилось)
  const todayKey = dateKey(mskNow())
  const n = mskNow()
  const nowMin = n.getHours() * 60 + n.getMinutes()
  const pick = (o, f) => (lang === 'en' && o?.[f + 'En']) ? o[f + 'En'] : o?.[f]
  const nextEv = events
    .filter(e => e.date === todayKey && toMin(e.end || e.start) >= nowMin)
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''))[0]

  const rows = [
    rec != null && {
      key: 'rec', lbl: t.recovery, to: '/health',
      val: `${rec}%`, hint: t[recLevel(rec)], dot: recoveryColor(rec),
    },
    sleep && {
      key: 'sleep', lbl: t.sleep, to: '/health',
      val: `${sleep.hoursSlept} ${t.h}`, hint: sleep.performance != null ? `${sleep.performance}%` : '',
    },
    steps != null && {
      key: 'steps', lbl: t.steps, to: '/health',
      val: steps.toLocaleString(loc), hint: `/ ${stepsGoal.toLocaleString(loc)}`,
      bar: Math.min(100, (steps / stepsGoal) * 100),
    },
    {
      key: 'nutr', lbl: t.nutrition, to: '/nutrition',
      val: eaten.toLocaleString(loc), hint: `/ ${target.kcal.toLocaleString(loc)} ${t.kcal}`,
      bar: target.kcal ? Math.min(100, (eaten / target.kcal) * 100) : 0,
    },
    {
      key: 'next', lbl: t.next, to: '/schedule',
      val: nextEv ? nextEv.start : t.free, hint: nextEv ? pick(nextEv, 'title') : '',
    },
  ].filter(Boolean)

  return (
    <div className="card fd-glance">
      <span className="fd-glance-title">{t.title}</span>
      <div className="fd-glance-rows">
        {rows.map(r => (
          <button key={r.key} type="button" className="fd-glance-row" onClick={() => navigate(r.to)}>
            <span className="fd-glance-lbl">{r.dot && <i style={{ background: r.dot }} />}{r.lbl}</span>
            <span className="fd-glance-valwrap">
              <span className="fd-glance-val">{r.val}</span>
              {r.hint && <span className="fd-glance-hint">{r.hint}</span>}
            </span>
            {r.bar != null && (
              <span className="fd-glance-track"><span className="fd-glance-fill" style={{ width: `${r.bar}%` }} /></span>
            )}
          </button>
        ))}
      </div>

      <style>{`
        .fd-glance { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
        .fd-glance-title {
          font-size: 11.5px; font-weight: 700; color: var(--text-secondary);
          text-transform: uppercase; letter-spacing: 0.07em;
        }
        .fd-glance-rows { display: flex; flex-direction: column; }
        .fd-glance-row {
          display: flex; flex-direction: column; gap: 4px;
          padding: 10px 8px; margin: 0 -8px; border: none; border-radius: 10px;
          background: none; cursor: pointer; font-family: inherit; text-align: left;
          transition: background var(--dur-fast) var(--ease);
        }
        .fd-glance-row + .fd-glance-row { border-top: 1px solid var(--border); border-radius: 0; }
        .fd-glance-row:hover { background: var(--bg-tile); border-radius: 10px; border-top-color: transparent; }
        .fd-glance-lbl {
          display: inline-flex; align-items: center; gap: 7px;
          font-size: 11px; font-weight: 600; color: var(--text-muted);
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        .fd-glance-lbl i { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .fd-glance-valwrap { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
        .fd-glance-val {
          font-size: 19px; font-weight: 800; color: var(--text-primary);
          font-variant-numeric: tabular-nums; letter-spacing: -0.01em;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; max-width: 100%;
        }
        .fd-glance-hint {
          font-size: 12px; color: var(--text-muted); min-width: 0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .fd-glance-track {
          height: 6px; border-radius: 3px; margin-top: 2px;
          background: var(--bg-tile); border: 1px solid var(--border); overflow: hidden;
        }
        .fd-glance-fill {
          display: block; height: 100%; border-radius: 3px;
          background: linear-gradient(180deg, var(--accent-btn-top), var(--accent-btn-bot));
        }
      `}</style>
    </div>
  )
}
