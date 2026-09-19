import { useRef, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'

// An iOS-style time wheel (a drum): two vertical scroll drums —
// hours (00–23) and minutes (00..60 by step). A highlighted selection band sits in the middle.
// Used when adding a planned workout to the calendar, so a convenient time
// can be chosen instead of only the auto-suggested slot.
//
// API:
//   <WheelTimePicker value="07:00" onChange={(next) => ...} minuteStep={5} />
//   value      — an "HH:MM" string (defaults to "07:00")
//   onChange   — (next: "HH:MM") => void; fired once the scrolling stops
//   minuteStep — the minute step (defaults to 5)
//
// Implementation notes:
//   • CSS scroll-snap (mandatory + align center) gives native momentum and snapping.
//   • The item and drum heights are fixed (ITEM=40px, 5 rows → 200px).
//   • The centered item is read from scrollTop / ITEM_HEIGHT, debounced by 120ms
//     on the 'scroll' event.

const ITEM_HEIGHT = 40   // height of one row, px
const VISIBLE_ROWS = 5   // visible rows (odd → there is an exact center)
const DRUM_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS // 200px
// how many blank filler rows go above/below, so that the first/last item
// can sit exactly in the center of the drum
const PAD_ROWS = Math.floor(VISIBLE_ROWS / 2) // 2

const pad2 = (n) => String(n).padStart(2, '0')

// Parse "HH:MM" → { h, m }; tolerant of garbage/undefined.
function parseValue(value) {
  const s = typeof value === 'string' ? value : ''
  const m = s.match(/^(\d{1,2}):(\d{1,2})$/)
  let h = m ? parseInt(m[1], 10) : 7
  let mi = m ? parseInt(m[2], 10) : 0
  if (!Number.isFinite(h) || h < 0 || h > 23) h = 7
  if (!Number.isFinite(mi) || mi < 0 || mi > 59) mi = 0
  return { h, m: mi }
}

// The nearest valid minute index for the given step.
function nearestMinuteIndex(minute, minutes) {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < minutes.length; i++) {
    const d = Math.abs(minutes[i] - minute)
    if (d < bestDist) { bestDist = d; best = i }
  }
  return best
}

// A single drum (hours or minutes). Manages its own scroll, snap and highlight.
function Drum({ items, selectedIndex, onSettle, ariaLabel }) {
  const ref = useRef(null)
  const settleTimer = useRef(null)
  const didInit = useRef(false)
  // the index we set programmatically — so that onChange doesn't loop
  const lastReported = useRef(selectedIndex)

  // Set the initial position to the current value without a smooth animation (first frame).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!didInit.current) {
      el.scrollTop = selectedIndex * ITEM_HEIGHT
      lastReported.current = selectedIndex
      didInit.current = true
    }
  }, [selectedIndex])

  // An external change to value → smoothly spin the drum to the new index,
  // but only if it really differs from the one currently centered.
  useEffect(() => {
    const el = ref.current
    if (!el || !didInit.current) return
    const current = Math.round(el.scrollTop / ITEM_HEIGHT)
    if (current !== selectedIndex) {
      lastReported.current = selectedIndex
      el.scrollTo({ top: selectedIndex * ITEM_HEIGHT, behavior: 'smooth' })
    }
  }, [selectedIndex])

  const handleScroll = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      const idx = Math.round(el.scrollTop / ITEM_HEIGHT)
      const clamped = Math.max(0, Math.min(items.length - 1, idx))
      if (clamped !== lastReported.current) {
        lastReported.current = clamped
        onSettle(clamped)
      }
    }, 120)
  }, [items.length, onSettle])

  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current) }, [])

  // A tap on an item → scroll it to the center and select it.
  const handleTap = (i) => {
    const el = ref.current
    if (!el) return
    el.scrollTo({ top: i * ITEM_HEIGHT, behavior: 'smooth' })
    if (i !== lastReported.current) {
      lastReported.current = i
      onSettle(i)
    }
  }

  return (
    <div
      className="wtp-drum"
      ref={ref}
      onScroll={handleScroll}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
    >
      <div className="wtp-pad" aria-hidden="true" />
      {items.map((label, i) => {
        const dist = Math.abs(i - selectedIndex)
        const isSel = i === selectedIndex
        return (
          <div
            key={label}
            className={`wtp-item${isSel ? ' is-sel' : ''}`}
            data-dist={dist > 3 ? 3 : dist}
            role="option"
            aria-selected={isSel}
            onClick={() => handleTap(i)}
          >
            {label}
          </div>
        )
      })}
      <div className="wtp-pad" aria-hidden="true" />
    </div>
  )
}

export default function WheelTimePicker({ value = '07:00', onChange, minuteStep = 5 }) {
  // Normalize the step: an integer in [1..30]; it need not divide 60, but must be >= 1.
  const step = useMemo(() => {
    const n = Math.round(Number(minuteStep))
    return Number.isFinite(n) && n >= 1 && n <= 30 ? n : 5
  }, [minuteStep])

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => pad2(i)), [])
  const minutesNums = useMemo(() => {
    const out = []
    for (let m = 0; m < 60; m += step) out.push(m)
    return out
  }, [step])
  const minutes = useMemo(() => minutesNums.map(pad2), [minutesNums])

  const { h, m } = parseValue(value)
  const hourIndex = h
  const minuteIndex = nearestMinuteIndex(m, minutesNums)

  const emit = useCallback((nextH, nextM) => {
    const next = `${pad2(nextH)}:${pad2(nextM)}`
    if (typeof onChange === 'function') onChange(next)
  }, [onChange])

  const onHour = useCallback((idx) => {
    emit(idx, minutesNums[minuteIndex])
  }, [emit, minutesNums, minuteIndex])

  const onMinute = useCallback((idx) => {
    emit(hourIndex, minutesNums[idx])
  }, [emit, hourIndex, minutesNums])

  return (
    <motion.div
      className="wtp-root"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="wtp-drums">
        {/* the central selection band — on top of the drums, centered */}
        <div className="wtp-band" aria-hidden="true" />

        <Drum
          items={hours}
          selectedIndex={hourIndex}
          onSettle={onHour}
          ariaLabel="Часы"
        />

        <span className="wtp-colon" aria-hidden="true">:</span>

        <Drum
          items={minutes}
          selectedIndex={minuteIndex}
          onSettle={onMinute}
          ariaLabel="Минуты"
        />

        {/* top/bottom feathering, so the outermost rows "fade into the mist" */}
        <div className="wtp-fade wtp-fade--top" aria-hidden="true" />
        <div className="wtp-fade wtp-fade--bot" aria-hidden="true" />
      </div>

      <style>{`
        .wtp-root {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          user-select: none;
          -webkit-user-select: none;
        }
        .wtp-drums {
          position: relative;
          display: flex;
          align-items: center;
          gap: var(--space-1, 4px);
          height: ${DRUM_HEIGHT}px;
          padding: 0 var(--space-3, 12px);
          border-radius: var(--radius-md, 12px);
          border: 1px solid var(--border-med, var(--border));
          background: var(--bg-tile, var(--bg-surface));
          box-shadow: var(--inset-tile, none);
          overflow: hidden;
        }
        .wtp-drum {
          position: relative;
          height: ${DRUM_HEIGHT}px;
          width: 64px;
          overflow-y: auto;
          overflow-x: hidden;
          scroll-snap-type: y mandatory;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
          scrollbar-width: none;
          outline: none;
          z-index: 1;
        }
        .wtp-drum::-webkit-scrollbar { display: none; width: 0; height: 0; }
        .wtp-drum:focus-visible { outline: none; }
        .wtp-drum:focus-visible .wtp-item.is-sel {
          box-shadow: inset 0 0 0 1px var(--accent);
          border-radius: var(--radius-sm, 8px);
        }
        .wtp-pad { height: ${PAD_ROWS * ITEM_HEIGHT}px; flex: 0 0 auto; }
        .wtp-item {
          height: ${ITEM_HEIGHT}px;
          line-height: ${ITEM_HEIGHT}px;
          text-align: center;
          font-size: 22px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          font-feature-settings: 'tnum' 1;
          color: var(--text-primary, var(--foreground));
          scroll-snap-align: center;
          scroll-snap-stop: always;
          cursor: pointer;
          transition: opacity var(--dur-fast, 150ms) var(--ease, ease),
                      transform var(--dur-fast, 150ms) var(--ease, ease),
                      color var(--dur-fast, 150ms) var(--ease, ease);
        }
        /* fade and shrink with distance from the centre */
        .wtp-item[data-dist="0"] { opacity: 1;    transform: scale(1); }
        .wtp-item[data-dist="1"] { opacity: 0.55; transform: scale(0.88); color: var(--text-secondary, var(--muted)); }
        .wtp-item[data-dist="2"] { opacity: 0.32; transform: scale(0.78); color: var(--text-muted, var(--muted)); }
        .wtp-item[data-dist="3"] { opacity: 0.18; transform: scale(0.72); color: var(--text-muted, var(--muted)); }
        .wtp-item.is-sel { color: var(--accent); font-weight: 700; }

        .wtp-colon {
          z-index: 2;
          font-size: 22px;
          font-weight: 700;
          color: var(--text-secondary, var(--muted));
          padding-bottom: 2px;
        }

        /* the central selection band */
        .wtp-band {
          position: absolute;
          left: var(--space-2, 8px);
          right: var(--space-2, 8px);
          top: 50%;
          height: ${ITEM_HEIGHT}px;
          transform: translateY(-50%);
          border-radius: var(--radius-sm, 8px);
          background: var(--bg-surface, var(--bg-card));
          border-top: 1px solid var(--border-med, var(--border));
          border-bottom: 1px solid var(--border-med, var(--border));
          pointer-events: none;
          z-index: 0;
        }

        /* feathered edges */
        .wtp-fade {
          position: absolute;
          left: 0; right: 0;
          height: ${ITEM_HEIGHT * 1.6}px;
          pointer-events: none;
          z-index: 3;
        }
        .wtp-fade--top {
          top: 0;
          background: linear-gradient(180deg, var(--bg-tile, var(--bg-surface)), transparent);
        }
        .wtp-fade--bot {
          bottom: 0;
          background: linear-gradient(0deg, var(--bg-tile, var(--bg-surface)), transparent);
        }

        @media (prefers-reduced-motion: reduce) {
          .wtp-item { transition: none; }
          .wtp-root { animation: none; }
        }
      `}</style>
    </motion.div>
  )
}
