import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Heart, Moon, Activity, Gauge, BatteryCharging, Scale, Waves, Droplet, Wind, Thermometer,
  BarChart3, Footprints, Zap, Flame, Route, Plus, X, Check, Info
} from 'lucide-react'
import ArcGauge from '../ArcGauge.jsx'
import { recoveryColor, SLEEP_STAGES } from '../../utils/whoop.js'
import { mskDateKey } from '../../utils/time.js'
import { WIDGETS, loadLayout, saveLayout, availableToAdd } from '../../utils/widgets.js'

const ICONS = { heart: Heart, moon: Moon, activity: Activity, gauge: Gauge, battery: BatteryCharging, scale: Scale, waves: Waves, droplet: Droplet, wind: Wind, thermo: Thermometer, chart: BarChart3, footprints: Footprints, run: Zap, flame: Flame, route: Route }
const SLEEP_COLOR = Object.fromEntries(SLEEP_STAGES.map(s => [s.key, s.color]))
const SLEEP_LBL = { deep: 'Глубокий', light: 'Лёгкий', rem: 'REM', awake: 'Бодрств.' }
const fmtHm = min => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} ч ${m} м` : `${m} м` }

const OK = 'var(--status-ok)', WARN = 'var(--status-warn)', CRIT = 'var(--status-crit)', ACC = 'var(--accent)'
const vo2Fit = v => v >= 50 ? 'Превосходно' : v >= 45 ? 'Отлично' : v >= 40 ? 'Хорошо' : v >= 35 ? 'Средне' : 'Ниже среднего'

// Конфиг «бублика» по метрике: значение, шкала, зоны/маркер или заливка, подпись-уровень.
function gaugeCfg(id, m) {
  switch (id) {
    case 'recovery': return { v: m.recovery, min: 0, max: 100, zones: [{ from: 0, to: 34, color: CRIT }, { from: 34, to: 67, color: WARN }, { from: 67, to: 100, color: OK }], marker: true, center: `${m.recovery}%`, word: m.recovery >= 67 ? 'Высокое' : m.recovery >= 34 ? 'Среднее' : 'Низкое' }
    case 'sleep': case 'sleepEff': { const v = id === 'sleep' ? m.sleepScore : m.sleepEfficiency; return { v, min: 0, max: 100, zones: [{ from: 0, to: 60, color: CRIT }, { from: 60, to: 80, color: WARN }, { from: 80, to: 100, color: OK }], marker: true, center: `${v}%`, word: v >= 80 ? 'Хорошо' : v >= 60 ? 'Средне' : 'Мало' } }
    case 'stress': case 'stressSport': return { v: m.stress, min: 0, max: 100, zones: [{ from: 0, to: 25, color: OK }, { from: 25, to: 50, color: WARN }, { from: 50, to: 75, color: 'var(--status-crit)' }, { from: 75, to: 100, color: CRIT }], marker: true, center: `${m.stress}`, word: m.stress <= 25 ? 'Покой' : m.stress <= 50 ? 'Низкий' : m.stress <= 75 ? 'Средний' : 'Высокий' }
    case 'bodyBattery': case 'bbSport': return { v: m.bbCurrent, min: 0, max: 100, zones: [{ from: 0, to: 25, color: CRIT }, { from: 25, to: 50, color: WARN }, { from: 50, to: 100, color: OK }], marker: true, center: `${m.bbCurrent}`, word: (m.bbCharged != null || m.bbDrained != null) ? `${m.bbCharged != null ? '+' + m.bbCharged : ''}${m.bbDrained != null ? ' −' + m.bbDrained : ''}`.trim() : 'заряд' }
    case 'vo2max': return { v: m.vo2Max, min: 20, max: 58, zones: [{ from: 20, to: 33, color: CRIT }, { from: 33, to: 40, color: WARN }, { from: 40, to: 46, color: OK }, { from: 46, to: 58, color: ACC }], marker: true, center: `${m.vo2Max}`, word: vo2Fit(m.vo2Max) }
    case 'spo2': return { v: m.spo2, min: 90, max: 100, zones: [{ from: 90, to: 95, color: WARN }, { from: 95, to: 100, color: OK }], marker: true, center: `${m.spo2}%`, word: m.spo2 >= 95 ? 'Норма' : 'Низковато' }
    case 'rhr': case 'restingHr': { const v = m.rhr ?? m.restingHr; return { v, min: 40, max: 90, zones: [{ from: 40, to: 55, color: OK }, { from: 55, to: 70, color: WARN }, { from: 70, to: 90, color: CRIT }], marker: true, center: `${v}`, word: 'уд/мин' } }
    case 'strain': return { v: (m.strain / m.strainMax) * 100, min: 0, max: 100, color: ACC, center: `${m.strain}`, word: `из ${m.strainMax}` }
    case 'steps': return { v: m.steps, min: 0, max: 10000, color: ACC, center: m.steps.toLocaleString('ru-RU'), word: 'цель 10 000' }
    case 'hrv': return { v: m.hrv, min: 20, max: 120, color: ACC, center: `${m.hrv}`, word: 'мс' }
    default: return null
  }
}

function insightFor(id, m) {
  switch (id) {
    case 'recovery': return m.recovery >= 67 ? 'Тело хорошо восстановилось — можно давать высокую нагрузку.' : m.recovery >= 34 ? 'Среднее восстановление — умеренная нагрузка, следи за самочувствием.' : 'Низкое восстановление — день отдыха или лёгкая активность.'
    case 'strain': { const p = Math.round(m.strain / m.strainMax * 100); return p >= 70 ? 'Нагрузка высокая — впереди восстановление.' : p >= 40 ? 'Умеренная нагрузка на сегодня.' : 'Нагрузка низкая — есть запас.' }
    case 'stress': case 'stressSport': return m.stress <= 25 ? 'Спокойное состояние.' : m.stress <= 50 ? 'Умеренное напряжение — норма для активного дня.' : m.stress <= 75 ? 'Повышенный стресс — сделай паузу.' : 'Высокий стресс — восстановись.'
    case 'bodyBattery': case 'bbSport': return m.bbCurrent >= 50 ? 'Энергии достаточно для нагрузки.' : m.bbCurrent >= 25 ? 'Заряд средний — планируй с оглядкой.' : 'Заряд низкий — телу нужен отдых.'
    case 'sleep': return m.sleepScore >= 85 ? 'Отличный сон — организм восстановился.' : m.sleepScore >= 70 ? 'Сон в норме.' : 'Недосып — постарайся добрать отдых.'
    case 'vo2max': return `Аэробная форма: ${vo2Fit(m.vo2Max).toLowerCase()}. Растёт от регулярных аэробных тренировок.`
    case 'steps': return m.steps >= 10000 ? 'Дневная цель по шагам достигнута.' : `До цели 10 000 осталось ${(10000 - m.steps).toLocaleString('ru-RU')}.`
    case 'balance': { const d = m.recovery - Math.round(m.strain / m.strainMax * 100); return d >= 15 ? 'Есть запас — организм готов к нагрузке.' : d <= -15 ? 'Нагрузка выше восстановления — нужен отдых.' : 'Баланс — держи умеренный темп.' }
    case 'hrv': return 'HRV — маркер восстановления. Сравнивай со своим обычным уровнем, а не с чужим.'
    case 'rhr': case 'restingHr': return 'Пульс покоя стабилен — хороший знак. Рост на 5+ уд/мин — сигнал усталости или болезни.'
    case 'spo2': return m.spo2 >= 95 ? 'Кислород в норме.' : 'Ниже нормы — присмотрись к дыханию во сне.'
    default: return ''
  }
}

// ── Формы ──
function Num({ id, m }) {
  const w = WIDGETS[id]
  const val = id === 'rhr' || id === 'restingHr' ? (m.rhr ?? m.restingHr)
    : id === 'sleep' ? m.sleepScore : id === 'sleepEff' ? m.sleepEfficiency
      : id === 'weekVolume' ? m.weekKm : id === 'skinTemp' ? m.skinTemp
        : id === 'bodyBattery' || id === 'bbSport' ? m.bbCurrent : id === 'vo2max' ? m.vo2Max
          : m[id] ?? m.stress
  return <div className="wg-num"><span className="wg-num-v">{val}<span className="wg-num-u">{w.unit}</span></span></div>
}

function WeekBars({ week, big }) {
  return (
    <div className={`wg-week ${big ? 'big' : ''}`}>
      {week.map((d, i) => (
        <div key={i} className="wg-wc">
          <div className="wg-ww"><motion.div className="wg-wb" style={{ background: recoveryColor(d.recovery) }} initial={{ height: 0 }} animate={{ height: `${d.recovery}%` }} transition={{ duration: 0.5, delay: i * 0.04 }} /></div>
          <span className="wg-wv">{d.recovery}</span><span className="wg-wd">{d.day}</span>
        </div>
      ))}
    </div>
  )
}
function SleepBar({ m, legend }) {
  const st = m.sleepStages || {}, order = ['deep', 'light', 'rem', 'awake']
  const total = order.reduce((s, k) => s + (st[k] || 0), 0) || 1
  return (
    <div className="wg-sleep">
      <div className="wg-sl-bar">{order.map(k => st[k] > 0 && <div key={k} className="wg-sl-seg" style={{ width: `${st[k] / total * 100}%`, background: SLEEP_COLOR[k] }} />)}</div>
      {legend && <div className="wg-sl-legend">{order.map(k => <div key={k} className="wg-sl-leg"><span className="wg-dot" style={{ background: SLEEP_COLOR[k] }} /><span className="wg-sl-l">{SLEEP_LBL[k]}</span><span className="wg-sl-v">{fmtHm(st[k] || 0)}</span></div>)}</div>}
    </div>
  )
}
function Calories({ m }) {
  const today = mskDateKey(), p = n => String(n).padStart(2, '0'), d = new Date(); d.setDate(d.getDate() - 6)
  const wa = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  const kt = m.workouts.filter(w => w.date === today).reduce((s, w) => s + (w.calories || 0), 0)
  const kw = m.workouts.filter(w => w.date >= wa).reduce((s, w) => s + (w.calories || 0), 0)
  return <div className="wg-cols"><div className="wg-col"><span className="wg-col-v">{kt.toLocaleString('ru-RU')}</span><span className="wg-col-c">сегодня</span></div><div className="wg-col"><span className="wg-col-v">{kw.toLocaleString('ru-RU')}</span><span className="wg-col-c">за неделю</span></div></div>
}
function BalanceBars({ m }) {
  const loadPct = Math.min(100, Math.round(m.strain / m.strainMax * 100))
  return (
    <div className="wg-bal">
      <div className="wg-bal-row"><span className="wg-bal-l">Восст.</span><div className="wg-bal-t"><div className="wg-bal-f" style={{ width: `${m.recovery}%`, background: OK }} /></div><span className="wg-bal-v">{m.recovery}%</span></div>
      <div className="wg-bal-row"><span className="wg-bal-l">Нагрузка</span><div className="wg-bal-t"><div className="wg-bal-f" style={{ width: `${loadPct}%`, background: ACC }} /></div><span className="wg-bal-v">{m.strain}</span></div>
    </div>
  )
}

// Бублик (форма ring / часть detail)
function Ring({ id, m, size = 118, hideSub }) {
  const c = gaugeCfg(id, m)
  if (!c) return null
  return <ArcGauge value={c.v} min={c.min} max={c.max} zones={c.zones || null} marker={!!c.marker} color={c.color || ACC} centerText={c.center} sublabel={hideSub ? null : c.word} size={size} />
}

// Тело виджета по форме
function Body({ id, form, m }) {
  const w = WIDGETS[id]
  const series = w.kind === 'series'
  if (form === 'num') return <Num id={id} m={m} />
  if (form === 'ring') {
    if (id === 'sleep') return <div className="wg-ring-wide"><div className="wg-ring-fig"><div className="wg-big">{m.sleepScore}%</div><div className="wg-sub">{m.sleepHours} ч</div></div><div className="wg-ring-side"><SleepBar m={m} /></div></div>
    if (id === 'recoveryWeek') return <WeekBars week={m.week} />
    if (id === 'calories') return <Calories m={m} />
    if (id === 'balance') return <BalanceBars m={m} />
    // gauge-бублик слева + уровень справа
    return <div className="wg-ring-wide"><Ring id={id} m={m} size={104} hideSub /><div className="wg-ring-side"><div className="wg-ring-word">{gaugeCfg(id, m)?.word}</div></div></div>
  }
  // detail (2×2): график/бублик + пояснение ИИ
  const ins = insightFor(id, m)
  return (
    <div className="wg-detail">
      <div className="wg-detail-top">
        {id === 'sleep' ? <SleepBar m={m} legend /> : id === 'recoveryWeek' ? <WeekBars week={m.week} big /> : id === 'balance' ? <BalanceBars m={m} /> : id === 'calories' ? <Calories m={m} /> : <Ring id={id} m={m} size={128} />}
      </div>
      {ins && <div className="wg-ins"><span>✦</span><span>{ins}</span></div>}
    </div>
  )
}

// Тайл: переворот по тапу (вне правки), long-press → правка
function Tile({ item, m, edit, flipped, onFlip, onLongPress, onDelete, dragHandlers, resizeStart }) {
  const w = WIDGETS[item.id]
  const timer = useRef(null); const moved = useRef(false); const down = useRef(null)
  if (!w) return null
  const Icon = ICONS[w.icon] || Activity
  const onDown = e => {
    moved.current = false; down.current = { x: e.clientX, y: e.clientY }
    if (edit) { dragHandlers.onPointerDown(e, item.id); return }
    timer.current = setTimeout(() => { onLongPress() }, 480)
  }
  const onMove = e => {
    if (down.current && Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > 8) moved.current = true
    if (!edit && moved.current && timer.current) { clearTimeout(timer.current); timer.current = null }
  }
  const onUp = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (!edit && !moved.current) onFlip()
    down.current = null
  }
  return (
    <div className={`wg-tile wg-${item.form} ${edit ? 'wg-editing' : ''} ${flipped ? 'wg-flipped' : ''}`}
      data-wid={item.id} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }}>
      <div className="wg-inner">
        <div className="wg-face wg-front">
          <div className="wg-head"><Icon size={14} strokeWidth={1.8} /><span className="wg-title">{w.title}</span></div>
          <div className="wg-body"><Body id={item.id} form={item.form} m={m} /></div>
          {!edit && item.form !== 'detail' && <span className="wg-flip-hint"><Info size={13} strokeWidth={1.8} /></span>}
        </div>
        <div className="wg-face wg-back">
          <div className="wg-head"><Icon size={14} strokeWidth={1.8} /><span className="wg-title">{w.title}</span></div>
          <p className="wg-explain">{w.explain}</p>
        </div>
      </div>
      {edit && <>
        <button className="wg-del" onPointerDown={e => e.stopPropagation()} onClick={() => onDelete(item.id)} aria-label="Убрать"><X size={14} strokeWidth={2.6} /></button>
        {w.forms.length > 1 && <span className="wg-resize" onPointerDown={e => { e.stopPropagation(); resizeStart(e, item.id) }} />}
      </>}
    </div>
  )
}

export default function WidgetGrid({ page, metrics }) {
  const m = metrics
  const [layout, setLayout] = useState(() => loadLayout(page, m))
  const [edit, setEdit] = useState(false)
  const [flipped, setFlipped] = useState(null)
  const [picker, setPicker] = useState(false)
  const [drag, setDrag] = useState(null)      // перемещение: {id}
  const [rz, setRz] = useState(null)          // ресайз: {id, forms, sx, sy}
  const gridRef = useRef(null)

  const apply = next => { setLayout(next); saveLayout(page, next) }
  const del = id => apply(layout.filter(it => it.id !== id))
  const setForm = (id, form) => apply(layout.map(it => it.id === id ? { ...it, form } : it))
  const add = id => { apply([...layout, { id, form: WIDGETS[id].def }]); setPicker(false) }
  const canAdd = availableToAdd(page, layout, m)

  // ── Перемещение (drag тела) ──
  const dragHandlers = {
    onPointerDown: (e, id) => { setDrag({ id }); e.target.setPointerCapture?.(e.pointerId) }
  }
  const onGridMove = useCallback(e => {
    if (drag) {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const tile = el?.closest?.('[data-wid]')
      const overId = tile?.getAttribute('data-wid')
      if (overId && overId !== drag.id) {
        setLayout(prev => {
          const from = prev.findIndex(x => x.id === drag.id), to = prev.findIndex(x => x.id === overId)
          if (from < 0 || to < 0) return prev
          const next = [...prev]; const [it] = next.splice(from, 1); next.splice(to, 0, it)
          saveLayout(page, next); return next
        })
      }
    } else if (rz) {
      const dx = e.clientX - rz.sx, dy = e.clientY - rz.sy, mag = dx + dy
      const forms = rz.forms
      let idx = mag < -30 ? 0 : mag < 60 ? Math.min(1, forms.length - 1) : forms.length - 1
      idx = Math.max(0, Math.min(forms.length - 1, idx))
      setLayout(prev => { const next = prev.map(it => it.id === rz.id ? { ...it, form: forms[idx] } : it); saveLayout(page, next); return next })
    }
  }, [drag, rz, page])
  const endGesture = useCallback(() => { setDrag(null); setRz(null) }, [])
  useEffect(() => {
    if (!drag && !rz) return
    window.addEventListener('pointermove', onGridMove)
    window.addEventListener('pointerup', endGesture)
    return () => { window.removeEventListener('pointermove', onGridMove); window.removeEventListener('pointerup', endGesture) }
  }, [drag, rz, onGridMove, endGesture])

  const resizeStart = (e, id) => { setRz({ id, forms: WIDGETS[id].forms, sx: e.clientX, sy: e.clientY }) }

  // тап по пустому месту сетки — выход из правки
  const onWrapPointerDown = e => { if (edit && !e.target.closest('.wg-tile') && !e.target.closest('.wg-plus') && !e.target.closest('.wg-pick')) setEdit(false) }

  if (!layout.length && !canAdd.length) return null

  return (
    <div className={`wg-wrap ${edit ? 'wg-edit' : ''}`} onPointerDown={onWrapPointerDown}>
      {edit && (
        <button className="wg-plus" onClick={() => setPicker(true)} aria-label="Добавить"><Plus size={20} strokeWidth={2.4} /></button>
      )}
      <div className="wg-grid" ref={gridRef}>
        {layout.map(item => (
          <div key={item.id} className={`wg-cell wg-${item.form} ${drag?.id === item.id ? 'wg-dragging' : ''}`}>
            <Tile item={item} m={m} edit={edit} flipped={flipped === item.id}
              onFlip={() => setFlipped(f => f === item.id ? null : item.id)}
              onLongPress={() => { setEdit(true); setFlipped(null) }}
              onDelete={del} dragHandlers={dragHandlers} resizeStart={resizeStart} />
          </div>
        ))}
      </div>
      {edit && <div className="wg-edit-hint">Тяни за угол — размер · перетащи — порядок · тап по пустому — готово</div>}

      <AnimatePresence>
        {picker && (
          <motion.div className="wg-pick-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onPointerDown={e => { e.stopPropagation(); setPicker(false) }}>
            <motion.div className="wg-pick" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} onPointerDown={e => e.stopPropagation()}>
              <div className="wg-pick-head"><span>Добавить виджет</span><button className="wg-del" onClick={() => setPicker(false)}><X size={18} /></button></div>
              {canAdd.length ? <div className="wg-pick-list">{canAdd.map(w => { const Ic = ICONS[w.icon] || Activity; return <button key={w.id} className="wg-pick-item" onClick={() => add(w.id)}><Ic size={16} /> {w.title}<Plus size={15} className="wg-pick-plus" /></button> })}</div>
                : <div className="wg-pick-empty">Все доступные виджеты уже добавлены</div>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .wg-wrap { position: relative; display: flex; flex-direction: column; gap: 12px; }
        .wg-plus { position: absolute; top: -46px; left: 0; width: 36px; height: 36px; border-radius: 50%; border: none; background: var(--accent); color: var(--on-accent,#fff); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 5; box-shadow: var(--shadow-lift, 0 4px 12px rgba(0,0,0,.3)); }
        .wg-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; grid-auto-rows: 150px; grid-auto-flow: row dense; }
        .wg-cell.wg-num { grid-column: span 1; grid-row: span 1; }
        .wg-cell.wg-ring { grid-column: span 2; grid-row: span 1; }
        .wg-cell.wg-detail { grid-column: span 2; grid-row: span 2; }
        .wg-cell.wg-dragging { opacity: .35; }

        .wg-tile { width: 100%; height: 100%; min-width: 0; perspective: 900px; }
        .wg-inner { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; transition: transform .5s cubic-bezier(.4,.2,.2,1); }
        .wg-tile.wg-flipped .wg-inner { transform: rotateY(180deg); }
        .wg-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; box-sizing: border-box; background: var(--bg-card-top, var(--bg-surface)); border: 1px solid var(--border-med, var(--border)); border-radius: 18px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; overflow: hidden; }
        .wg-back { transform: rotateY(180deg); }
        .wg-head { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); flex: none; }
        .wg-title { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wg-body { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; }
        .wg-explain { font-size: 13px; line-height: 1.5; color: var(--text-body); margin: 0; overflow: auto; }
        .wg-flip-hint { position: absolute; bottom: 8px; right: 10px; color: var(--text-faint); opacity: .5; }

        .wg-num { display: flex; flex-direction: column; align-items: center; }
        .wg-num-v { font-size: 34px; font-weight: 800; color: var(--foreground); font-variant-numeric: tabular-nums; line-height: 1; }
        .wg-num-u { font-size: 0.45em; font-weight: 600; color: var(--muted-foreground); }
        .wg-cols { display: flex; gap: 22px; }
        .wg-col { display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .wg-col-v { font-size: 22px; font-weight: 800; color: var(--foreground); }
        .wg-col-c { font-size: 11px; color: var(--muted-foreground); }

        .wg-ring-wide { display: flex; align-items: center; gap: 14px; width: 100%; justify-content: center; }
        .wg-ring-side { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .wg-ring-word { font-size: 15px; font-weight: 700; color: var(--foreground); }
        .wg-ring-fig { display: flex; flex-direction: column; align-items: center; }
        .wg-big { font-size: 30px; font-weight: 800; color: var(--foreground); line-height: 1; }
        .wg-sub { font-size: 12px; color: var(--muted-foreground); }

        .wg-week { display: flex; align-items: flex-end; gap: 6px; width: 100%; height: 82px; }
        .wg-week.big { height: 150px; }
        .wg-wc { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; height: 100%; }
        .wg-ww { flex: 1; width: 60%; max-width: 20px; display: flex; align-items: flex-end; background: var(--bg-secondary); border-radius: 5px; overflow: hidden; }
        .wg-wb { width: 100%; border-radius: 5px 5px 0 0; min-height: 3px; }
        .wg-wv { font-size: 10px; font-weight: 700; color: var(--foreground); }
        .wg-wd { font-size: 9.5px; color: var(--muted-foreground); }

        .wg-sleep { display: flex; flex-direction: column; gap: 8px; width: 100%; }
        .wg-sl-bar { display: flex; height: 15px; border-radius: 8px; overflow: hidden; background: var(--bg-secondary); }
        .wg-sl-seg { height: 100%; }
        .wg-sl-legend { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 16px; }
        .wg-sl-leg { display: flex; align-items: center; gap: 6px; font-size: 12px; }
        .wg-sl-l { color: var(--muted-foreground); } .wg-sl-v { margin-left: auto; color: var(--foreground); font-weight: 600; }
        .wg-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }

        .wg-bal { display: flex; flex-direction: column; gap: 9px; width: 100%; }
        .wg-bal-row { display: grid; grid-template-columns: 56px 1fr auto; align-items: center; gap: 8px; }
        .wg-bal-l { font-size: 11.5px; font-weight: 600; color: var(--muted-foreground); }
        .wg-bal-t { height: 9px; border-radius: 999px; background: var(--bg-secondary); overflow: hidden; }
        .wg-bal-f { height: 100%; border-radius: 999px; }
        .wg-bal-v { font-size: 12.5px; font-weight: 700; color: var(--foreground); }

        .wg-detail { display: flex; flex-direction: column; gap: 10px; width: 100%; height: 100%; justify-content: center; }
        .wg-detail-top { display: flex; align-items: center; justify-content: center; }
        .wg-ins { display: flex; gap: 7px; align-items: flex-start; font-size: 12.5px; line-height: 1.45; color: var(--text-body); background: var(--bg-tile, var(--bg-secondary)); border-radius: 10px; padding: 8px 10px; }
        .wg-ins span:first-child { color: var(--accent); }

        .wg-editing { animation: wg-wig .35s ease-in-out infinite; }
        .wg-cell:nth-child(2n) .wg-editing { animation-delay: .09s; }
        @keyframes wg-wig { 0%,100% { transform: rotate(-.5deg); } 50% { transform: rotate(.5deg); } }
        .wg-del { position: absolute; top: -6px; left: -6px; width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--bg-app,#000); background: var(--status-crit); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 6; }
        .wg-resize { position: absolute; bottom: 2px; right: 2px; width: 26px; height: 26px; border-radius: 0 0 16px 0; cursor: nwse-resize; z-index: 6; touch-action: none; background: radial-gradient(circle at bottom right, var(--accent) 0 8px, transparent 9px); }
        .wg-edit .wg-tile { touch-action: none; }
        .wg-edit-hint { font-size: 11.5px; color: var(--text-secondary); text-align: center; }

        .wg-pick-back { position: fixed; inset: 0; z-index: 600; background: var(--scrim, rgba(0,0,0,.55)); display: flex; align-items: center; justify-content: center; padding: 20px; }
        .wg-pick { width: 100%; max-width: 420px; max-height: 76vh; overflow-y: auto; background: var(--bg-card-top, var(--bg-surface)); border: 1px solid var(--border-med); border-radius: 20px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
        .wg-pick-head { display: flex; align-items: center; justify-content: space-between; font-size: 17px; font-weight: 700; color: var(--foreground); }
        .wg-pick-list { display: flex; flex-direction: column; gap: 8px; }
        .wg-pick-item { display: flex; align-items: center; gap: 10px; padding: 13px 14px; border-radius: 12px; border: 1px solid var(--border-med); background: var(--bg-tile); color: var(--text-body); font-family: inherit; font-size: 14.5px; font-weight: 600; cursor: pointer; text-align: left; }
        .wg-pick-plus { margin-left: auto; color: var(--accent); }
        .wg-pick-empty { font-size: 14px; color: var(--muted-foreground); padding: 8px 4px; }

        @media (min-width: 641px) { .wg-grid { grid-template-columns: repeat(4, 1fr); } .wg-cell.wg-ring, .wg-cell.wg-detail { grid-column: span 2; } }
      `}</style>
    </div>
  )
}
