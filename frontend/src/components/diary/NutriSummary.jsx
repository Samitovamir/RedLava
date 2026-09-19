/*
  The summary at the top of "Nutrition": calories on the app's standard dial, next to it (when
  FODMAP is on) a three-band dial with the level; below that protein/fat/carbs as bars. Both dials
  and the bars are the shared ones, so this card reads like Home, Sport and Health.
*/

import { useT } from '../../context/LanguageContext.jsx'
import { Gauge, Meters } from '../../ui'
import { LOW_GOOD_ZONES } from '../../utils/scales.js'

const STR = {
  en: { low: 'Low', mod: 'Moderate', high: 'High', breakdown: 'What I ate today', byDish: ' · FODMAP by dish' },
  ru: { low: 'Низкий', mod: 'Умеренный', high: 'Высокий', breakdown: 'Что съедено сегодня', byDish: ' · FODMAP по блюдам' },
}

// Where each FODMAP band puts the marker on the low → high scale, and its color
const FOD = {
  low: { c: 'var(--status-ok)', v: 16 },
  mod: { c: 'var(--status-warn)', v: 50 },
  high: { c: 'var(--status-crit)', v: 84 },
}

export default function NutriSummary({ eatenK, target, remK, over, pct, eatenP, eatenF, eatenC, fodmapOn, fodmapBand, fodmapReason, t, onOpenBreakdown }) {
  const s = useT(STR)
  const macros = [
    { l: t.protein, e: eatenP, g: target.protein, c: 'var(--cat-macro-protein)' },
    { l: t.fat, e: eatenF, g: target.fat, c: 'var(--cat-macro-fat)' },
    { l: t.carb, e: eatenC, g: target.carb, c: 'var(--cat-macro-carb)' },
  ]
  const showDial = fodmapOn   // the traffic light is always shown while the diet is on (with no data, a neutral "—")
  return (
    <div className="card ns-summary">
      <div className={`ns-heroes ${onOpenBreakdown ? 'ns-click' : ''}`}
        onClick={onOpenBreakdown} role={onOpenBreakdown ? 'button' : undefined}>
        <Gauge value={pct} center={eatenK} sub={`/ ${target.kcal}`} label={t.kcal}
          color={over ? 'var(--status-warn)' : 'var(--accent)'} size={showDial ? 132 : 148} />
        {showDial && (
          <Gauge value={FOD[fodmapBand]?.v ?? null} zones={LOW_GOOD_ZONES} center={false} size={132}
            word={FOD[fodmapBand] ? s[fodmapBand] : '—'} wordColor={FOD[fodmapBand]?.c} label="FODMAP" />
        )}
      </div>
      <div className={`ns-left ${over ? 'over' : ''}`}>
        {over ? `${t.over} ${eatenK - target.kcal}` : `${t.left} ${remK}`} {t.kcal}
      </div>
      {showDial && fodmapReason && (
        <div className="ns-fodreason">
          <span className="ns-dot" style={{ background: (FOD[fodmapBand] || FOD.low).c }} />
          <span style={{ color: (FOD[fodmapBand] || FOD.low).c, fontWeight: 700 }}>{s[fodmapBand] || s.low} FODMAP</span>
          <span className="muted"> — {fodmapReason}</span>
        </div>
      )}
      <div className="ns-bars">
        <Meters rows={macros.map(m => ({
          key: m.l, label: m.l, color: m.c,
          pct: m.g > 0 ? Math.min(100, Math.round(m.e / m.g * 100)) : 0,
          text: <>{Math.round(m.e)}<i>/{m.g} {t.g}</i></>,
        }))} />
      </div>

      {onOpenBreakdown && eatenK > 0 && (
        <button className="ns-details" onClick={onOpenBreakdown} type="button">
          {s.breakdown}{fodmapOn ? s.byDish : ''} →
        </button>
      )}

      <style>{`
        .ns-summary { display: flex; flex-direction: column; gap: 12px; }
        .ns-heroes { display: flex; align-items: flex-start; justify-content: space-around; gap: 12px; margin-top: 4px; border-radius: 12px; }
        .ns-heroes.ns-click { cursor: pointer; }
        .ns-details { align-self: center; background: none; border: none; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 600; color: var(--accent); padding: 4px 8px; }
        .ns-details:hover { text-decoration: underline; }
        .ns-left { text-align: center; font-size: 13px; font-weight: 600; color: var(--text-secondary); }
        .ns-left.over { color: var(--status-warn); }
        .ns-fodreason { display: flex; align-items: center; gap: 7px; justify-content: center; font-size: 12.5px; flex-wrap: wrap; }
        .ns-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
        .ns-bars { margin-top: 4px; }
      `}</style>
    </div>
  )
}
