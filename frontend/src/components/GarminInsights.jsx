/*
  Показатели Garmin — расширенные тренировочные метрики (Training Status/Load, HRV,
  прогнозы забегов, Endurance/Hill Score, лактатный порог, интенсивные минуты).
  Показывается во вкладке «Спорт» (данные Garmin). Каждая плитка рендерится, только
  если данные есть. Только CSS-переменные, тёмная тема.
  props: garmin (объект albert-garmin-live). Иначе читает из localStorage.
*/
import { useState, useEffect } from 'react'
import { isGuest } from '../api/authFetch.js'
import { useT, useLang } from '../context/LanguageContext.jsx'

const STR = {
  en: {
    title: 'Garmin metrics', sub: 'Advanced training metrics',
    trainingStatus: 'Training status', trainingLoad: 'Training load',
    acute: 'acute', chronic: 'chronic',
    lowAerobic: 'Low aerobic', highAerobic: 'High aerobic', anaerobic: 'Anaerobic',
    hrv: 'Heart rate variability (HRV)', msPerNight: 'ms last night', hrvBaseline: 'HRV baseline',
    racePredictions: 'Race predictions', endurance: 'Endurance', hillStrength: 'Hill strength',
    lactateThreshold: 'Lactate threshold', bpm: 'bpm', minPerKm: 'min/km',
    intensityMinutes: 'Intensity minutes · week', outOf: 'of',
    k5: '5K', k10: '10K',
    lowVolume: 'low volume', optimal: 'optimal', bitHigh: 'a bit high', overload: 'overload',
    elite: 'elite', high: 'high', medium: 'medium', base: 'base',
    strong: 'strong', good: 'good', beginner: 'beginner',
    fbProductive: 'Load is building fitness — keep it up',
    fbPeaking: 'Peak fitness — you can target a race',
    fbMaintaining: 'Fitness is holding — volume is steady',
    fbRecovery: 'Recovery in progress — don’t rush the volume',
    fbUnproductive: 'Fitness isn’t growing — revisit recovery',
    fbOverreaching: 'Load is above your limit — rest needed',
    fbDetraining: 'Fitness is dropping — time to add load',
    fbStrained: 'Overstrain — dial back the intensity',
  },
  ru: {
    title: 'Показатели Garmin', sub: 'Расширенные метрики тренировок',
    trainingStatus: 'Тренировочный статус', trainingLoad: 'Тренировочная нагрузка',
    acute: 'острая', chronic: 'хроническая',
    lowAerobic: 'Низкий аэроб', highAerobic: 'Высокий аэроб', anaerobic: 'Анаэроб',
    hrv: 'Вариабельность пульса (ВЧП)', msPerNight: 'мс за ночь', hrvBaseline: 'норма ВЧП',
    racePredictions: 'Прогноз забегов', endurance: 'Выносливость', hillStrength: 'Сила на подъёмах',
    lactateThreshold: 'Лактатный порог', bpm: 'уд/мин', minPerKm: 'мин/км',
    intensityMinutes: 'Интенсивные минуты · неделя', outOf: 'из',
    k5: '5 км', k10: '10 км',
    lowVolume: 'малый объём', optimal: 'оптимально', bitHigh: 'высоковато', overload: 'перегруз',
    elite: 'элитный', high: 'высокий', medium: 'средний', base: 'базовый',
    strong: 'сильный', good: 'хороший', beginner: 'начальный',
    fbProductive: 'Нагрузка растит форму — так держать',
    fbPeaking: 'Пик формы — можно целиться в старт',
    fbMaintaining: 'Форма держится — объём стабилен',
    fbRecovery: 'Идёт восстановление — не спеши с объёмом',
    fbUnproductive: 'Форма не растёт — пересмотри восстановление',
    fbOverreaching: 'Нагрузка выше меры — нужен отдых',
    fbDetraining: 'Форма падает — пора добавить нагрузку',
    fbStrained: 'Перенапряжение — снизь интенсивность',
  },
}

function readGarmin() {
  try { const s = localStorage.getItem('albert-garmin-live'); return s ? JSON.parse(s) : null } catch { return null }
}

// Garmin иногда отдаёт код-энум (LOW_RT_MOD_OR_HIGH и т.п.) вместо человеческого текста —
// такое не показываем.
const clean = s => (s != null && !/^[A-Z0-9][A-Z0-9_]{3,}$/.test(String(s).trim())) ? s : null
const statusColor = k => ({ PRODUCTIVE: 'var(--status-ok)', PEAKING: 'var(--status-ok)', MAINTAINING: 'var(--accent)', RECOVERY: 'var(--status-warn)', UNPRODUCTIVE: 'var(--status-warn)', OVERREACHING: 'var(--status-crit)', DETRAINING: 'var(--status-crit)' }[k] || 'var(--accent)')
// Запасная фраза по статусу (если backend не прислал текст — приходит кодом)
const statusFeedback = (k, s) => ({ PRODUCTIVE: s.fbProductive, PEAKING: s.fbPeaking, MAINTAINING: s.fbMaintaining, RECOVERY: s.fbRecovery, UNPRODUCTIVE: s.fbUnproductive, OVERREACHING: s.fbOverreaching, DETRAINING: s.fbDetraining, STRAINED: s.fbStrained }[k] || null)
const balanceColor = k => ({ OPTIMAL: 'var(--status-ok)', LOW: 'var(--status-warn)', HIGH: 'var(--status-crit)' }[k] || 'var(--accent)')
const hrvColor = k => ({ BALANCED: 'var(--status-ok)', UNBALANCED: 'var(--status-warn)', LOW: 'var(--status-crit)', POOR: 'var(--status-crit)' }[k] || 'var(--accent)')
// Уровень словом из числового значения (Garmin не всегда присылает готовый текст)
const enduranceLevel = (v, s) => v == null ? null : v >= 9000 ? s.elite : v >= 6000 ? s.high : v >= 3000 ? s.medium : s.base
const hillLevel = (v, s) => v == null ? null : v >= 75 ? s.strong : v >= 50 ? s.good : v >= 25 ? s.medium : s.beginner

export default function GarminInsights({ garmin }) {
  const s = useT(STR)
  const { lang } = useLang()
  // Готовые русские подписи с бэкенда (statusRu/levelRu) показываем только в русском UI
  const ruOnly = v => (lang === 'ru' ? clean(v) : null)
  // Гость — расширенные метрики в демо (albert-garmin-live). Реальный — ленивый /insights,
  // чтобы не блокировать основную загрузку заряда тела / стресса.
  const [fetched, setFetched] = useState(null)
  useEffect(() => {
    if (isGuest()) return
    let ok = true
    fetch('/api/garmin/insights').then(r => r.json()).then(d => { if (ok && d && d.connected) setFetched(d) }).catch(() => {})
    return () => { ok = false }
  }, [])
  const g = fetched || garmin || readGarmin()
  if (!g) return null
  const ts = g.trainingStatus, tl = g.trainingLoad, hrv = g.hrvStatus
  const race = g.racePredictions, endur = g.enduranceScore, hill = g.hillScore
  const lt = g.lactateThreshold, im = g.intensityMinutes
  if (!ts && !tl && !hrv && !race && !endur && !hill && !lt && !im) return null

  // HRV: положение последней ночи в диапазоне базовой линии (low..high)
  const hrvPos = hrv && hrv.low != null && hrv.high != null && hrv.high > hrv.low
    ? Math.max(0, Math.min(1, (hrv.lastNight - hrv.low) / (hrv.high - hrv.low))) * 100 : null
  const imPct = im && im.goal ? Math.min(100, Math.round(im.weekly / im.goal * 100)) : null
  // Баланс нагрузки по ACWR (острая/хроническая): 0.8–1.3 — оптимальное окно
  const acwr = tl?.ratio
  const loadBal = acwr == null ? null
    : acwr < 0.8 ? { w: s.lowVolume, c: 'var(--status-warn)' }
    : acwr <= 1.3 ? { w: s.optimal, c: 'var(--status-ok)' }
    : acwr <= 1.5 ? { w: s.bitHigh, c: 'var(--status-warn)' }
    : { w: s.overload, c: 'var(--status-crit)' }

  return (
    <div className="gi">
      <div className="gi-head">
        <span className="gi-title">{s.title}</span>
        <span className="gi-sub">{s.sub}</span>
      </div>

      <div className="gi-grid">
        {/* Training Status — герой */}
        {ts && (
          <div className="gi-tile gi-span2">
            <div className="gi-cap">{s.trainingStatus}</div>
            <div className="gi-status" style={{ color: statusColor(ts.status) }}>{ruOnly(ts.statusRu) || clean(ts.status) || '—'}</div>
            {(clean(ts.feedback) || statusFeedback(ts.status, s)) && <div className="gi-status-fb">{clean(ts.feedback) || statusFeedback(ts.status, s)}</div>}
            {ts.vo2Max != null && <div className="gi-chip">VO₂max <b>{ts.vo2Max}</b></div>}
          </div>
        )}

        {/* Training Load */}
        {tl && (
          <div className="gi-tile gi-span2">
            <div className="gi-cap">{s.trainingLoad}</div>
            <div className="gi-load-top">
              <div className="gi-load-num"><span className="gi-big">{tl.acute}</span><span className="gi-mut">{s.acute}</span></div>
              <div className="gi-load-num"><span className="gi-big">{tl.chronic}</span><span className="gi-mut">{s.chronic}</span></div>
              {loadBal && <div className="gi-balance" style={{ color: loadBal.c }}>{loadBal.w}{acwr != null ? ` · ${acwr.toFixed(2)}` : ''}</div>}
            </div>
            {tl.focus && (
              <div className="gi-focus">
                {[[s.lowAerobic, tl.focus.low, 'var(--status-ok)'], [s.highAerobic, tl.focus.high, 'var(--accent)'], [s.anaerobic, tl.focus.anaerobic, 'var(--status-warn)']].map(([lbl, v, c]) => (
                  <div className="gi-focus-row" key={lbl}>
                    <span className="gi-focus-lbl">{lbl}</span>
                    <div className="gi-bar"><div className="gi-bar-fill" style={{ width: `${v}%`, background: c }} /></div>
                    <span className="gi-focus-val">{v}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* HRV Status */}
        {hrv && (
          <div className="gi-tile">
            <div className="gi-cap">{s.hrv}</div>
            <div className="gi-hrv-num"><span className="gi-big">{hrv.lastNight}</span><span className="gi-mut">{s.msPerNight}</span></div>
            {ruOnly(hrv.statusRu) && <div className="gi-status-sm" style={{ color: hrvColor(hrv.statusKey) }}>{ruOnly(hrv.statusRu)}</div>}
            {hrvPos != null && (
              <div className="gi-hrv-range">
                <div className="gi-bar"><span className="gi-hrv-marker" style={{ left: `${hrvPos}%` }} /></div>
                <div className="gi-hrv-cap"><span>{hrv.low}</span><span className="gi-mut">{s.hrvBaseline}</span><span>{hrv.high}</span></div>
              </div>
            )}
          </div>
        )}

        {/* Прогноз забегов */}
        {race && (
          <div className="gi-tile gi-span2">
            <div className="gi-cap">{s.racePredictions}</div>
            <div className="gi-race">
              {[[s.k5, race.fiveK], [s.k10, race.tenK], ['21.1', race.half], ['42.2', race.marathon]].filter(([, v]) => v).map(([lbl, v]) => (
                <div className="gi-race-col" key={lbl}>
                  <span className="gi-race-val">{v}</span>
                  <span className="gi-race-lbl">{lbl}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Endurance Score */}
        {endur && (
          <div className="gi-tile">
            <div className="gi-cap">{s.endurance}</div>
            <div className="gi-big">{endur.score.toLocaleString('ru-RU')}</div>
            {(ruOnly(endur.levelRu) || enduranceLevel(endur.score, s)) && <div className="gi-status-sm">{ruOnly(endur.levelRu) || enduranceLevel(endur.score, s)}</div>}
          </div>
        )}

        {/* Hill Score */}
        {hill && (
          <div className="gi-tile">
            <div className="gi-cap">{s.hillStrength}</div>
            <div className="gi-big">{hill.score}</div>
            {(ruOnly(hill.levelRu) || hillLevel(hill.score, s)) && <div className="gi-status-sm">{ruOnly(hill.levelRu) || hillLevel(hill.score, s)}</div>}
          </div>
        )}

        {/* Лактатный порог */}
        {lt && (
          <div className="gi-tile">
            <div className="gi-cap">{s.lactateThreshold}</div>
            <div className="gi-lt">
              {lt.hr != null && <div className="gi-lt-col"><span className="gi-big">{lt.hr}</span><span className="gi-mut">{s.bpm}</span></div>}
              {lt.pace && <div className="gi-lt-col"><span className="gi-big">{lt.pace}</span><span className="gi-mut">{s.minPerKm}</span></div>}
            </div>
          </div>
        )}

        {/* Интенсивные минуты */}
        {im && (
          <div className="gi-tile">
            <div className="gi-cap">{s.intensityMinutes}</div>
            <div className="gi-im"><span className="gi-big">{im.weekly}</span><span className="gi-mut">{s.outOf} {im.goal}</span></div>
            {imPct != null && <div className="gi-bar gi-bar-lg"><div className="gi-bar-fill" style={{ width: `${imPct}%`, background: imPct >= 100 ? 'var(--status-ok)' : 'var(--accent)' }} /></div>}
          </div>
        )}
      </div>

      <style>{`
        .gi { display: flex; flex-direction: column; gap: 16px; }
        .gi-head { display: flex; flex-direction: column; gap: 2px; }
        .gi-title { font-size: 18px; font-weight: 700; color: var(--text-primary); }
        .gi-sub { font-size: 13px; color: var(--text-muted); }
        .gi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .gi-tile {
          display: flex; flex-direction: column; gap: 8px;
          padding: 16px; border-radius: 16px;
          border: 1px solid var(--border-med); background: var(--bg-tile);
          box-shadow: var(--inset-tile, none); min-width: 0;
        }
        .gi-span2 { grid-column: span 2; }
        .gi-cap { font-size: 11.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); }
        .gi-big { font-size: 28px; font-weight: 800; color: var(--text-primary); line-height: 1; font-variant-numeric: tabular-nums; }
        .gi-mut { font-size: 12px; color: var(--text-muted); }
        .gi-status { font-size: 24px; font-weight: 800; letter-spacing: -0.01em; }
        .gi-status-fb { font-size: 13.5px; color: var(--text-secondary); line-height: 1.45; }
        .gi-status-sm { font-size: 13.5px; font-weight: 700; color: var(--text-body); }
        .gi-chip {
          align-self: flex-start; margin-top: 2px; font-size: 12.5px; color: var(--text-secondary);
          padding: 4px 10px; border-radius: 999px; background: var(--bg-surface); border: 1px solid var(--border-med);
        }
        .gi-chip b { color: var(--text-primary); }
        /* Load */
        .gi-load-top { display: flex; align-items: baseline; gap: 20px; flex-wrap: wrap; }
        .gi-load-num { display: flex; flex-direction: column; gap: 2px; }
        .gi-balance { margin-left: auto; font-size: 14px; font-weight: 700; }
        .gi-focus { display: flex; flex-direction: column; gap: 7px; margin-top: 4px; }
        .gi-focus-row { display: grid; grid-template-columns: 110px 1fr 40px; align-items: center; gap: 10px; }
        .gi-focus-lbl { font-size: 12px; color: var(--text-secondary); }
        .gi-focus-val { font-size: 12px; color: var(--text-body); text-align: right; font-variant-numeric: tabular-nums; }
        .gi-bar { position: relative; height: 8px; border-radius: 999px; background: color-mix(in srgb, var(--text-faint) 22%, transparent); overflow: hidden; }
        .gi-bar-lg { height: 10px; overflow: visible; }
        .gi-bar-fill { height: 100%; border-radius: 999px; }
        /* HRV */
        .gi-hrv-num { display: flex; align-items: baseline; gap: 8px; }
        .gi-hrv-range { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
        .gi-hrv-range .gi-bar { overflow: visible; background: linear-gradient(90deg, color-mix(in srgb, var(--status-warn) 40%, transparent), color-mix(in srgb, var(--status-ok) 55%, transparent), color-mix(in srgb, var(--status-warn) 40%, transparent)); }
        .gi-hrv-marker { position: absolute; top: -3px; width: 2px; height: 14px; border-radius: 2px; background: var(--text-primary); transform: translateX(-50%); }
        .gi-hrv-cap { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); }
        /* Race */
        .gi-race { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .gi-race-col { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
        .gi-race-val { font-size: 21px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
        .gi-race-lbl { font-size: 12px; color: var(--text-muted); }
        /* Lactate */
        .gi-lt { display: flex; gap: 24px; }
        .gi-lt-col { display: flex; flex-direction: column; gap: 2px; }
        .gi-im { display: flex; align-items: baseline; gap: 8px; }
        @media (max-width: 900px) { .gi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .gi-span2 { grid-column: span 2; } }
        @media (max-width: 560px) {
          .gi-grid { grid-template-columns: 1fr; }
          .gi-span2 { grid-column: span 1; }
          .gi-race { grid-template-columns: repeat(4, 1fr); }
        }
      `}</style>
    </div>
  )
}
