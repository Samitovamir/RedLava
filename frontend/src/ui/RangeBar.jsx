/*
  Where one value sits against its normal range: a blood marker against its reference range,
  last night's HRV against the personal baseline. A neutral track, the normal range tinted, a dot
  on the value. Blood tests and HRV used to draw this two different ways.

  props (all positions are 0–100 along the track, see barGeom in utils/labs.js):
    pos      where the value sits
    band     [left, right] of the normal range, or null when there is no range
    color    the dot's color — the status of the value
    ring     the color of the surface behind the bar, so the dot reads as cut out of it
*/
export default function RangeBar({ pos, band = null, color = 'var(--text-primary)', ring = 'var(--bg-tile)' }) {
  return (
    <div className="rangebar">
      {band && <span className="rangebar-band" style={{ left: `${band[0]}%`, width: `${Math.max(0, band[1] - band[0])}%` }} />}
      <span className="rangebar-dot" style={{ left: `${pos}%`, background: color, boxShadow: `0 0 0 2px ${ring}` }} />

      <style>{`
        .rangebar { position: relative; height: 8px; border-radius: 999px;
          background: color-mix(in srgb, var(--text-faint) 22%, transparent); }
        .rangebar-band { position: absolute; top: 0; bottom: 0; border-radius: 999px;
          background: color-mix(in srgb, var(--status-ok) 34%, transparent); }
        .rangebar-dot { position: absolute; top: 50%; width: 12px; height: 12px; border-radius: 50%;
          transform: translate(-50%, -50%); }
      `}</style>
    </div>
  )
}
