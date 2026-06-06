import { buildHypnogram, STAGE_LEVEL, minToHHMM } from '../utils/hypnogram.js'
import { SLEEP_STAGES } from '../utils/whoop.js'

/*
  График стадий сна по ходу ночи (гипнограмма). Строится из реальных итогов Whoop
  по стадиям + времени засыпания. Поминутных данных Whoop не даёт, поэтому это
  ПРИМЕРНАЯ картина — об этом честно подписано под графиком.
  props: stages {awake,light,rem,deep} (минуты), start "HH:MM", end "HH:MM"
*/
const COLOR = Object.fromEntries(SLEEP_STAGES.map(s => [s.key, s.color]))
const LABEL = Object.fromEntries(SLEEP_STAGES.map(s => [s.key, s.label]))
const ROWS = ['awake', 'rem', 'light', 'deep']   // сверху вниз
const fmt = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} ч ${m} мин` : `${m} мин` }

export default function SleepHypnogram({ stages, start, end }) {
  const hyp = buildHypnogram(stages, start)
  if (!hyp) return <div className="hyp-empty muted">Недостаточно данных для диаграммы сна.</div>

  const W = 1000, padTop = 12, rowH = 34, padBottom = 26, leftPad = 200, rightPad = 16
  const plotW = W - leftPad - rightPad
  const H = padTop + ROWS.length * rowH + padBottom
  const xOf = (min) => leftPad + (hyp.totalMin ? (min / hyp.totalMin) * plotW : 0)
  const yOf = (level) => padTop + level * rowH + rowH / 2

  // Часовые отметки
  const ticks = []
  const firstHour = Math.ceil(hyp.startMin / 60) * 60
  for (let m = firstHour; m <= hyp.startMin + hyp.totalMin + 1; m += 60) {
    ticks.push({ x: xOf(m - hyp.startMin), label: minToHHMM(m) })
  }

  return (
    <div className="hyp">
      <svg viewBox={`0 0 ${W} ${H}`} className="hyp-svg" preserveAspectRatio="none">
        {/* строки стадий: подпись + сетка */}
        {ROWS.map((st, i) => (
          <g key={st}>
            <line x1={leftPad} y1={yOf(i)} x2={W - rightPad} y2={yOf(i)} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 5" />
            <circle cx={14} cy={yOf(i)} r="5" fill={COLOR[st]} />
            <text x={32} y={yOf(i) + 5} textAnchor="start" className="hyp-row-lbl" fill="var(--muted)">{LABEL[st]}</text>
          </g>
        ))}
        {/* часовые линии + подписи */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={t.x} y1={padTop} x2={t.x} y2={padTop + ROWS.length * rowH} stroke="var(--border)" strokeWidth="1" opacity="0.4" />
            <text x={t.x} y={H - 8} textAnchor="middle" className="hyp-tick" fill="var(--muted)">{t.label}</text>
          </g>
        ))}
        {/* вертикальные переходы между стадиями */}
        {hyp.segments.map((s, i) => {
          if (i === 0) return null
          const prev = hyp.segments[i - 1]
          const x = xOf(s.start)
          return <line key={`v${i}`} x1={x} y1={yOf(STAGE_LEVEL[prev.stage])} x2={x} y2={yOf(STAGE_LEVEL[s.stage])} stroke="var(--muted)" strokeWidth="2" opacity="0.5" />
        })}
        {/* горизонтальные отрезки стадий (цветные) */}
        {hyp.segments.map((s, i) => (
          <line key={`h${i}`} x1={xOf(s.start)} y1={yOf(STAGE_LEVEL[s.stage])} x2={xOf(s.end)} y2={yOf(STAGE_LEVEL[s.stage])}
            stroke={COLOR[s.stage]} strokeWidth="5" strokeLinecap="round" />
        ))}
      </svg>

      <div className="hyp-summary">
        {ROWS.map(st => (
          <div key={st} className="hyp-sum">
            <span className="hyp-dot" style={{ background: COLOR[st] }} />
            <span className="hyp-sum-lbl">{LABEL[st]}</span>
            <span className="hyp-sum-val">{fmt(stages[st] || 0)}</span>
          </div>
        ))}
      </div>
      <div className="hyp-note muted">
        Примерная картина ночи по итогам Whoop{start && end ? ` · сон с ${start} до ${end}` : ''}. Точную поминутную раскладку Whoop не предоставляет.
      </div>

      <style>{`
        .hyp { display: flex; flex-direction: column; gap: 12px; }
        .hyp-svg { width: 100%; height: auto; }
        .hyp-row-lbl { font-size: 19px; }
        .hyp-tick { font-size: 17px; }
        .hyp-summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 24px; }
        .hyp-sum { display: flex; align-items: center; gap: 8px; font-size: 13.5px; }
        .hyp-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .hyp-sum-lbl { color: var(--muted); }
        .hyp-sum-val { margin-left: auto; color: var(--foreground); font-weight: 600; }
        .hyp-note { font-size: 12px; line-height: 1.5; }
        .hyp-empty { font-size: 14px; padding: 12px 0; }
      `}</style>
    </div>
  )
}
