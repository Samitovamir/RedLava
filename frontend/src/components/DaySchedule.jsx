import { useMemo, useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AddEventModal, { repeatLabel, PRIORITY_MAP } from './AddEventModal.jsx'
import MiniCalendar from './MiniCalendar.jsx'
import { useEvents, dateKey } from '../context/EventsContext.jsx'
import { useLang, useT } from '../context/LanguageContext.jsx'
import { categoryColor } from '../utils/categoryColor.js'
import { EVENT_TYPES, eventIconKey } from '../utils/events.js'
import { useIsMobile } from '../layout.js'
import Icon from '../ui/Icon.jsx'

/*
  The day's schedule — a vertical timeline (reference screenshot 1).
  An hour scale down the left, pill cards for the events, a yellow marker for the current time,
  and a "+" FAB. The data is still mock — it will be wired up to Google Calendar.
*/

import { mskNow } from '../utils/time.js'

// Hard bounds for the timeline; the real hour window is derived from the day's events (activeHours)
const HOUR_MIN = 5
const HOUR_MAX = 23
const PX_PER_HOUR = 72

// Icons per event type
const ICONS = {
  call: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  ),
  calendar: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  email: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>
    </svg>
  ),
  meeting: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>
    </svg>
  )
}

// Event types/categories/icons come from the shared dictionary utils/events.js (rendered via ui/Icon).
// The local names COLORS/eventIcon are kept so the call sites don't have to change.
const COLORS = Object.fromEntries(EVENT_TYPES.map((t) => [t.value, categoryColor(t.colorKey)]))
const eventIcon = (e) => <Icon name={eventIconKey(e)} size={17} strokeWidth={2} color="var(--on-accent)" />

// Does the event fall on the given day (repetition included)
function eventOccursOn(ev, viewDate) {
  if (!ev.date) return true // legacy entries with no date — always shown
  const evDate = new Date(ev.date + 'T00:00:00')
  const view = new Date(dateKey(viewDate) + 'T00:00:00')
  if (view < evDate) return false // repeats only count from the start date onwards
  const rep = ev.repeat || 'none'
  if (rep === 'none') return view.getTime() === evDate.getTime()
  if (rep === 'daily') return true
  if (rep === 'weekdays') { const wd = view.getDay(); return wd >= 1 && wd <= 5 }
  if (rep === 'weekly') return view.getDay() === evDate.getDay()
  if (rep === 'monthly') return view.getDate() === evDate.getDate()
  if (rep === 'yearly') return view.getDate() === evDate.getDate() && view.getMonth() === evDate.getMonth()
  if (rep === 'custom') return (ev.customDays || []).includes(view.getDay())
  return view.getTime() === evDate.getTime()
}

function toMinutes(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function topFor(t) {
  return ((toMinutes(t) - HOUR_MIN * 60) / 60) * PX_PER_HOUR
}

function formatRu(offset, lang = 'ru') {
  const d = mskNow()
  d.setDate(d.getDate() + offset)
  if (lang === 'en') {
    const monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    let prefixEn = ''
    if (offset === 0) prefixEn = 'Today, '
    else if (offset === 1) prefixEn = 'Tomorrow, '
    else if (offset === -1) prefixEn = 'Yesterday, '
    return `${prefixEn}${monthsEn[d.getMonth()]} ${d.getDate()}`
  }
  // genitive case: "5 июня" (the 5th of June)
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
  let prefix = ''
  if (offset === 0) prefix = 'Сегодня, '
  else if (offset === 1) prefix = 'Завтра, '
  else if (offset === -1) prefix = 'Вчера, '
  return `${prefix}${d.getDate()} ${months[d.getMonth()]}`
}

function minutesToStr(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Work out the horizontal layout of overlapping events (the width is split into columns)
function layoutEvents(list) {
  const items = list.map((e, i) => ({
    ...e, _i: i, _ref: e, _s: toMinutes(e.start), _e: toMinutes(e.end)
  })).sort((a, b) => a._s - b._s || a._e - b._e)

  // greedily spread them across the columns
  const colEnds = []
  items.forEach(ev => {
    let col = colEnds.findIndex(end => ev._s >= end)
    if (col === -1) { col = colEnds.length; colEnds.push(ev._e) }
    else colEnds[col] = ev._e
    ev._col = col
  })
  // how many columns are taken up in this event's cluster of overlaps
  items.forEach(ev => {
    const overlapping = items.filter(o => o._s < ev._e && o._e > ev._s)
    ev._cols = Math.max(...overlapping.map(o => o._col)) + 1
  })
  return items
}

// The minimum height of an event card (enough for the icon + 2 lines of text)
const MIN_EV_H = 58
const EV_GAP = 6

// An all-day event (00:00–23:59, which is how they arrive from Google Calendar) is kept
// off the scale: it would draw as a card a full day tall on top of the "now" line and
// push the ordinary events into a second column. Its place is the strip above the scale.
function isAllDayEvent(e) {
  return toMinutes(e.start) === 0 && toMinutes(e.end) >= 23 * 60 + 59
}

// Vertical packing: short or adjacent events never overlap.
// Every event gets a _top and a _height; within a column the blocks push each other downwards.
// Times outside the scale (earlier than HOUR_MIN) are clamped to its start.
function packTimeline(items) {
  const colBottom = {}
  const ordered = [...items].sort((a, b) => a._s - b._s || a._e - b._e)
  ordered.forEach(ev => {
    const natTop = Math.max(0, topFor(ev.start))
    const dur = Math.max(0, topFor(ev.end)) - natTop
    const h = Math.max(dur, MIN_EV_H)
    const prevBottom = colBottom[ev._col] ?? -Infinity
    const top = Math.max(natTop, prevBottom + EV_GAP)
    ev._top = top
    ev._height = h
    colBottom[ev._col] = top + h
  })
  return items
}

// --- Finding time ---
const WORK_START = 8 * 60   // 08:00
const WORK_END = 21 * 60    // no tasks after 21:00

// The day's free windows inside working hours
function freeWindows(evs) {
  const busy = evs.map(e => [toMinutes(e.start), toMinutes(e.end)]).sort((a, b) => a[0] - b[0])
  const free = []
  let cur = WORK_START
  busy.forEach(([s, e]) => {
    if (s > cur) free.push([cur, Math.min(s, WORK_END)])
    cur = Math.max(cur, e)
  })
  if (cur < WORK_END) free.push([cur, WORK_END])
  return free.filter(([s, e]) => e > s)
}

const hasContiguous = (evs, need) => freeWindows(evs).some(([s, e]) => e - s >= need)

// Pick low-priority events that could be dropped to free up "need" minutes in a row
function suggestMoves(evs, need) {
  // urgent ones (1) stay put; start with the lowest (3), then the important ones (2)
  const movable = evs
    .filter(e => (e.priority || 3) >= 2)
    .sort((a, b) => (b.priority || 3) - (a.priority || 3))
  let remaining = [...evs]
  const removed = []
  for (const m of movable) {
    if (hasContiguous(remaining, need)) break
    remaining = remaining.filter(e => e !== m)
    removed.push(m)
  }
  if (!hasContiguous(remaining, need)) return null
  // the window that has opened up
  const win = freeWindows(remaining).find(([s, e]) => e - s >= need)
  return { removed, slot: { start: win[0], end: win[0] + need } }
}

// Find the earliest free slot of length dur among the busy intervals
function earliestFit(busy, dur) {
  const sorted = [...busy].sort((a, b) => a[0] - b[0])
  let cur = WORK_START
  for (const [s, e] of sorted) {
    if (s - cur >= dur) return [cur, cur + dur]
    cur = Math.max(cur, e)
  }
  if (WORK_END - cur >= dur) return [cur, cur + dur]
  return null
}

// Smart shift: free up a contiguous window of "need" minutes by moving ONLY the events in the way
// (urgent ones stay put, and at most one important one may move). Returns a plan or null.
function planShift(evs, need) {
  const grid = 15
  let best = null
  for (let P = WORK_START; P + need <= WORK_END; P += grid) {
    const block = [P, P + need]
    const overlapping = evs.filter(e => toMinutes(e.start) < block[1] && toMinutes(e.end) > block[0])
    if (overlapping.length === 0) continue                                   // this is simply free (the contiguous pass would have found it)
    if (overlapping.some(e => (e.priority || 3) === 1)) continue             // urgent events must not be moved
    if (overlapping.filter(e => (e.priority || 3) === 2).length > 1) continue // no more than one important one

    const staying = evs.filter(e => !overlapping.includes(e))
    let busy = staying.map(e => [toMinutes(e.start), toMinutes(e.end)]).concat([block])
    const changes = new Map()
    let ok = true
    const toPlace = [...overlapping].sort((a, b) => (toMinutes(b.end) - toMinutes(b.start)) - (toMinutes(a.end) - toMinutes(a.start)))
    for (const ev of toPlace) {
      const dur = toMinutes(ev.end) - toMinutes(ev.start)
      const slot = earliestFit(busy, dur)
      if (!slot) { ok = false; break }
      changes.set(ev, { start: minutesToStr(slot[0]), end: minutesToStr(slot[1]) })
      busy = [...busy, slot]
    }
    if (ok && (!best || overlapping.length < best.moved.length)) {
      best = { changes, gap: block, moved: overlapping }
      if (overlapping.length === 1) break // no plan can move fewer than one
    }
  }
  return best
}


export default function DaySchedule({ extended = false, onViewDayChange }) {
  const { lang } = useLang()
  // The English text of a demo event when there is one; otherwise the original (Russian)
  const pick = (o, f) => (lang === 'en' && o && o[f + 'En']) ? o[f + 'En'] : (o ? o[f] : '')
  const t = useT({
    ru: {
      day: 'День', week: 'Неделя', month: 'Месяц',
      list: 'Список', columns: 'Колонки',
      prevDay: 'Предыдущий день', nextDay: 'Следующий день', prevWeek: 'Предыдущая неделя', nextWeek: 'Следующая неделя', prevMonth: 'Предыдущий месяц', nextMonth: 'Следующий месяц', pickDate: 'Выбрать дату',
      findTime: 'Найди время', findTimeTitle: 'Найти время',
      need: 'Нужно', hoursShort: 'ч',
      contig: 'Подряд', parts: 'Частями',
      findTimeBtn: 'Найти время',
      ftNote: 'Учитываю, что дел после 21:00 быть не должно',
      freeContig: 'Свободно подряд:',
      book: 'забронировать',
      availableParts: (h) => `Доступно ${h} ч по частям:`,
      noContig: (h) => `Подряд ${h} ч нет. Варианты:`,
      noVariants: 'Нет вариантов без сдвига неотложных дел. Попробуйте «Частями» или другой день.',
      slotArrow: 'слот',
      shiftBtn: 'Подвинуть',
      partsNotEnough: (h) => `Свободно всего ${h} ч — меньше нужного. Подвиньте события или выберите другой день.`,
      notifications: 'Уведомления',
      menu: 'Меню',
      goToday: 'Перейти на сегодня', resetEvents: 'Сбросить события', addEvent: 'Добавить событие',
      emptyTimeline: 'На этот день событий нет. Нажмите «+», чтобы добавить.',
      emptyColumns: 'Нет событий на этот день',
      allDay: 'Весь день',
      priorityTip: (n, label) => `Приоритет ${n} · ${label}`,
      edit: 'Редактировать', move: 'Перенести', remove: 'Удалить',
      addEventTitle: 'Добавить событие',
      close: 'Закрыть',
      willChange: (n, word) => `Изменится ${n} ${word}. Освободится `,
      colEvent: 'Событие', colWas: 'Было', colWill: 'Станет',
      pvRemove: 'убрать',
      apply: 'Применить', cancel: 'Отмена',
      conflictTitle: 'События пересекаются по времени',
      keepBoth: 'Оставить оба', keepBothSub: 'Покажу рядом в одно время',
      shiftNew: 'Сдвинуть новое',
      replaceOld: 'Заменить прошлое',
      // movers
      shiftEventsTitle: 'Подвинуть события',
      freeByRemovingTitle: 'Освободить, убрав'
    },
    en: {
      day: 'Day', week: 'Week', month: 'Month',
      list: 'List', columns: 'Columns',
      prevDay: 'Previous day', nextDay: 'Next day', prevWeek: 'Previous week', nextWeek: 'Next week', prevMonth: 'Previous month', nextMonth: 'Next month', pickDate: 'Pick a date',
      findTime: 'Find time', findTimeTitle: 'Find time',
      need: 'Need', hoursShort: 'h',
      contig: 'In a row', parts: 'In parts',
      findTimeBtn: 'Find time',
      ftNote: 'I take into account that there should be no tasks after 21:00',
      freeContig: 'Free in a row:',
      book: 'book',
      availableParts: (h) => `Available ${h} h in parts:`,
      noContig: (h) => `No ${h} h in a row. Options:`,
      noVariants: 'No options without moving urgent tasks. Try “In parts” or another day.',
      slotArrow: 'slot',
      shiftBtn: 'Shift',
      partsNotEnough: (h) => `Only ${h} h free in total — less than needed. Move events or pick another day.`,
      notifications: 'Notifications',
      menu: 'Menu',
      goToday: 'Go to today', resetEvents: 'Reset events', addEvent: 'Add event',
      emptyTimeline: 'No events for this day. Tap “+” to add one.',
      emptyColumns: 'No events for this day',
      allDay: 'All day',
      priorityTip: (n, label) => `Priority ${n} · ${label}`,
      edit: 'Edit', move: 'Reschedule', remove: 'Delete',
      addEventTitle: 'Add event',
      close: 'Close',
      willChange: (n, word) => `${n} ${word} will change. This frees up `,
      colEvent: 'Event', colWas: 'Was', colWill: 'Becomes',
      pvRemove: 'remove',
      apply: 'Apply', cancel: 'Cancel',
      conflictTitle: 'Events overlap in time',
      keepBoth: 'Keep both', keepBothSub: 'I’ll show them side by side at the same time',
      shiftNew: 'Shift the new one',
      replaceOld: 'Replace the old one',
      shiftEventsTitle: 'Shift events',
      freeByRemovingTitle: 'Free up by removing'
    }
  })
  const hours = useMemo(() => {
    const arr = []
    for (let h = HOUR_MIN; h <= HOUR_MAX; h++) arr.push(h)
    return arr
  }, [])

  // --- State ---
  const isMobile = useIsMobile()  // on a phone the day is shown as a list (agenda), not an hour-by-hour scale
  const { events, resetEvents, removeEvent, upsertEvent, applyBulk, focusSignal } = useEvents()  // the shared source for every page
  // extended mode: 'day' | 'week' | 'month'; normal mode: 'list' | 'columns'
  const [viewMode, setViewMode] = useState(extended ? 'day' : 'list')
  const [dayOffset, setDayOffset] = useState(0)       // 0=today, -1=yesterday, +1=tomorrow
  const [openMenu, setOpenMenu] = useState(null)      // 'bell' | 'header' | 'ev-<i>' | 'findtime' | null
  const [modalOpen, setModalOpen] = useState(false)
  const [editEvent, setEditEvent] = useState(null)    // the event being edited (null = adding a new one)
  const [conflict, setConflict] = useState(null)      // { pending, existing } — an overlap in time
  const [prefillStart, setPrefillStart] = useState(null) // start time for a new task coming from "Find time"
  const [ftHours, setFtHours] = useState(2)           // how many hours are needed
  const [ftContig, setFtContig] = useState(true)      // in a row / in parts
  const [ftResult, setFtResult] = useState(null)      // the search result
  const [ftPreview, setFtPreview] = useState(null)    // preview of the rearrangement { variant, rows, slot }

  // The date being viewed
  const viewDate = mskNow()
  viewDate.setDate(viewDate.getDate() + dayOffset)
  const viewKey = dateKey(viewDate)

  // The AI created or rescheduled an event → jump to its day so it is visible right away
  const scrollRef = useRef(null)
  useEffect(() => {
    if (!focusSignal?.date) return
    const today0 = mskNow(); today0.setHours(0, 0, 0, 0)
    const sel0 = new Date(focusSignal.date + 'T00:00:00'); sel0.setHours(0, 0, 0, 0)
    setDayOffset(Math.round((sel0 - today0) / 86400000))
    setViewMode(m => (m === 'week' || m === 'month' ? 'day' : m))
    setOpenMenu(null)
    // Scroll the timeline to the event's time (once the day has re-rendered).
    if (focusSignal.time) {
      const top = ((toMinutes(focusSignal.time) - HOUR_MIN * 60) / 60) * PX_PER_HOUR
      requestAnimationFrame(() => requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: Math.max(0, top - 80), behavior: 'smooth' })
      }))
    }
  }, [focusSignal])

  // Tell the parent which day is open, so the summary on the right is about that same day.
  useEffect(() => { onViewDayChange?.(viewKey) }, [viewKey])

  // The day's events (repeats included) for an arbitrary date
  const eventsOf = (d) => events
    .filter(e => eventOccursOn(e, d))
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))

  const dayEvents = eventsOf(viewDate)

  // Auto-scroll the timeline when a day opens: to "now" (when we are looking at today and the time
  // is within range), otherwise to the day's first event — so we don't land in the dead zone up top.
  useEffect(() => {
    if (viewMode !== 'list' && viewMode !== 'day') return
    const el = scrollRef.current
    if (!el) return
    const n = mskNow()
    const nMin = n.getHours() * 60 + n.getMinutes()
    const isToday = dayOffset === 0 && nMin >= HOUR_MIN * 60 && nMin <= HOUR_MAX * 60
    let target
    if (isToday) {
      target = ((nMin - HOUR_MIN * 60) / 60) * PX_PER_HOUR - 120
    } else if (dayEvents.length) {
      target = topFor(dayEvents[0].start) - 60
    } else {
      target = 0
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
    }))
  }, [viewKey, viewMode])

  // All-day events get their own strip above the scale; only the timed ones go on the timeline
  const allDayEvents = dayEvents.filter(isAllDayEvent)
  const timedEvents = dayEvents.filter(e => !isAllDayEvent(e))

  // The packed timeline layout (no overlaps) + the container's resulting height
  const positionedEvents = packTimeline(layoutEvents(timedEvents))
  const timelineHeight = Math.max(
    (HOUR_MAX - HOUR_MIN) * PX_PER_HOUR + 40,
    ...positionedEvents.map(e => e._top + e._height),
    0
  ) + 20

  // The days of the week that contains the day being viewed (Mon–Sun)
  const weekDays = useMemo(() => {
    const base = new Date(viewDate)
    const wd = (base.getDay() + 6) % 7 // 0=Mon
    base.setDate(base.getDate() - wd)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base); d.setDate(base.getDate() + i); return d
    })
  }, [viewKey])

  // The month's days for the grid (padded out to whole weeks)
  const monthCells = useMemo(() => {
    const y = viewDate.getFullYear(), m = viewDate.getMonth()
    const first = new Date(y, m, 1)
    let off = (first.getDay() + 6) % 7
    const cells = []
    for (let i = 0; i < off; i++) cells.push(null)
    const days = new Date(y, m + 1, 0).getDate()
    for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [viewKey])


  // Escape closes any open dropdown
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setOpenMenu(null); setModalOpen(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // --- Button handlers ---
  // The arrow step depends on the view: in Week and Month a one-day shift didn't move
  // the grid at all — reaching the next month took about 30 clicks.
  const stepDays = viewMode === 'month' ? 30 : viewMode === 'week' ? 7 : 1
  const prevDay = () => { setDayOffset(o => o - stepDays); setOpenMenu(null) }   // ‹ — back one step of the current view
  const nextDay = () => { setDayOffset(o => o + stepDays); setOpenMenu(null) }   // › — forward one step of the current view
  // The arrow's tooltip has to name the step it actually takes
  const prevTitle = viewMode === 'month' ? t.prevMonth : viewMode === 'week' ? t.prevWeek : t.prevDay
  const nextTitle = viewMode === 'month' ? t.nextMonth : viewMode === 'week' ? t.nextWeek : t.nextDay
  const goToday = () => { setDayOffset(0); setOpenMenu(null) }            // "Go to today"

  // Jump to an arbitrary date from the calendar
  const goToDate = (d) => {
    const today0 = mskNow(); today0.setHours(0, 0, 0, 0)
    const sel0 = new Date(d); sel0.setHours(0, 0, 0, 0)
    setDayOffset(Math.round((sel0 - today0) / 86400000))
    setOpenMenu(null)
  }

  // Check for a time overlap on the same day (excluding the event being edited)
  const findOverlap = (ev) => {
    const s = toMinutes(ev.start), e = toMinutes(ev.end)
    const evView = new Date(ev.date + 'T00:00:00')
    return events.find(o =>
      o !== editEvent &&
      o.date === ev.date &&  // the same start date (for repeats this is simplified to the start date)
      eventOccursOn(o, evView) &&
      toMinutes(o.start) < e && toMinutes(o.end) > s
    )
  }

  // Saving from the modal: either adding OR editing
  const saveEvent = (ev) => {
    const overlap = findOverlap(ev)
    if (overlap) {
      setConflict({ pending: ev, existing: overlap, editing: editEvent })
      return
    }
    commitEvent(ev, editEvent)
  }

  const commitEvent = (ev, target) => {
    upsertEvent(ev, target)
    setEditEvent(null)
  }

  // Resolving an overlap
  const resolveKeepBoth = () => { commitEvent(conflict.pending, conflict.editing); setConflict(null) }
  const resolveReplace = async () => {
    await removeEvent(conflict.existing)
    await upsertEvent(conflict.pending, conflict.editing)
    setEditEvent(null); setConflict(null)
  }
  const resolveShift = () => {
    const dur = toMinutes(conflict.pending.end) - toMinutes(conflict.pending.start)
    const newStart = toMinutes(conflict.existing.end)
    const shifted = { ...conflict.pending, start: minutesToStr(newStart), end: minutesToStr(newStart + dur) }
    commitEvent(shifted, conflict.editing)
    setConflict(null)
  }

  const deleteEvent = (ev) => {                                           // event menu → delete
    removeEvent(ev)
    setOpenMenu(null)
  }
  const startEdit = (ev) => {                                             // event menu → edit/reschedule
    setEditEvent(ev)
    setModalOpen(true)
    setOpenMenu(null)
  }
  const openAdd = () => { setEditEvent(null); setPrefillStart(null); setModalOpen(true); setOpenMenu(null) }
  const closeModal = () => { setModalOpen(false); setEditEvent(null); setPrefillStart(null) }
  const toggleMenu = (id) => setOpenMenu(cur => cur === id ? null : id)

  // From "Find time": open the add dialog with the slot pre-filled (one hour by default)
  const addAtSlot = (slot) => {
    const dur = Math.min(60, slot.end - slot.start)
    setPrefillStart({ start: minutesToStr(slot.start), end: minutesToStr(slot.start + dur) })
    setEditEvent(null)
    setModalOpen(true)
    setOpenMenu(null)
  }

  // Jump to a specific day (from the month or week view)
  const goToDay = (d) => { goToDate(d); setViewMode('day') }

  // Run the time search
  const runFindTime = () => {
    const need = Math.round(ftHours * 60)
    const free = freeWindows(dayEvents)
    if (ftContig) {
      const fits = free.filter(([s, e]) => e - s >= need).map(([s]) => ({ start: s, end: s + need }))
      if (fits.length) { setFtResult({ ok: true, mode: 'contig', slots: fits }); return }

      const allowed = (evs) => {
        const p1 = evs.filter(e => (e.priority || 3) === 1).length
        const p2 = evs.filter(e => (e.priority || 3) === 2).length
        return p1 === 0 && p2 <= 1
      }

      // There is no contiguous slot — assemble the options
      const variants = []

      // THE MAIN OPTION: move the events in the way (without touching the urgent ones)
      const plan = planShift(dayEvents, need)
      if (plan) {
        const n = plan.moved.length
        const gapStr = `${minutesToStr(plan.gap[0])}–${minutesToStr(plan.gap[1])}`
        const desc = lang === 'en'
          ? `I’ll move ${n} ${n === 1 ? 'event' : 'events'}, freeing up ${gapStr}`
          : `Перенесу ${n} ${n === 1 ? 'событие' : 'события'}, освободится ${gapStr}`
        variants.push({
          kind: 'shift', changes: plan.changes,
          title: t.shiftEventsTitle,
          desc,
          slot: { start: plan.gap[0], end: plan.gap[1] }
        })
      }

      // THE FALLBACK: drop them (only when shifting is impossible, or as an alternative)
      const rem = suggestMoves(dayEvents, need)
      if (rem && allowed(rem.removed)) {
        const names = rem.removed.map(e => e.title).join(', ')
        variants.push({
          kind: 'remove', events: rem.removed, slot: rem.slot,
          title: t.freeByRemovingTitle,
          desc: lang === 'en' ? `I’ll remove: ${names}` : `Уберу: ${names}`
        })
      }

      setFtResult({ ok: false, mode: 'contig', variants })
    } else {
      const total = free.reduce((a, [s, e]) => a + (e - s), 0)
      if (total >= need) { setFtResult({ ok: true, mode: 'parts', windows: free, total }); return }
      setFtResult({ ok: false, mode: 'parts', total, need })
    }
  }

  // Open the rearrangement preview (we only show the events affected)
  const openPreview = (v) => {
    let rows
    if (v.kind === 'shift') {
      rows = [...v.changes.entries()]
        .filter(([e, ch]) => e.start !== ch.start || e.end !== ch.end)
        .map(([e, ch]) => ({ title: e.title, type: e.type, priority: e.priority, kind: 'move', before: `${e.start}–${e.end}`, after: `${ch.start}–${ch.end}` }))
        .sort((a, b) => a.after.localeCompare(b.after))
    } else {
      rows = v.events.map(e => ({ title: e.title, type: e.type, priority: e.priority, kind: 'remove', before: `${e.start}–${e.end}` }))
    }
    setFtPreview({ variant: v, rows, slot: v.slot })
    setOpenMenu(null)
  }

  // Confirm the rearrangement — it is applied everywhere through the shared context
  const confirmPreview = () => {
    const v = ftPreview.variant
    if (v.kind === 'shift') {
      applyBulk({ changes: v.changes })
    } else {
      applyBulk({ removals: v.events })
    }
    setFtPreview(null)
    setFtResult(null)
  }

  // the current time (the line only shows when we are looking at today)
  const now = mskNow()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const inRange = dayOffset === 0 && nowMin >= HOUR_MIN * 60 && nowMin <= HOUR_MAX * 60
  const nowTop = ((nowMin - HOUR_MIN * 60) / 60) * PX_PER_HOUR
  const nowLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  return (
    <div className={`day-schedule card ${extended ? 'extended' : ''}`}>
      {/* Header */}
      <div className="ds-head">
        {/* View switcher */}
        {extended ? (
          <div className="ds-view-switch text">
            <button className={`ds-view-txt ${viewMode === 'day' ? 'active' : ''}`} onClick={() => setViewMode('day')}>{t.day}</button>
            <button className={`ds-view-txt ${viewMode === 'week' ? 'active' : ''}`} onClick={() => setViewMode('week')}>{t.week}</button>
            <button className={`ds-view-txt ${viewMode === 'month' ? 'active' : ''}`} onClick={() => setViewMode('month')}>{t.month}</button>
          </div>
        ) : (
          <div className="ds-view-switch">
            <button
              className={`ds-view ${viewMode === 'list' ? 'active' : ''}`}
              title={t.list} onClick={() => setViewMode('list')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
            <button
              className={`ds-view ${viewMode === 'columns' ? 'active' : ''}`}
              title={t.columns} onClick={() => setViewMode('columns')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>
            </button>
          </div>
        )}

        {/* Day navigation: ‹ date › (clicking the date opens the calendar) */}
        <div className="ds-nav">
          <button className="ds-arrow" onClick={prevDay} title={prevTitle} aria-label={prevTitle}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
          <div className="ds-menu-wrap">
            <button className={`ds-date ${openMenu === 'cal' ? 'active' : ''}`} onClick={() => toggleMenu('cal')} title={t.pickDate}>
              {formatRu(dayOffset, lang)}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6, opacity: 0.6 }}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <AnimatePresence>
              {openMenu === 'cal' && (
                <div className="ds-cal-pop">
                  <MiniCalendar value={viewDate} onSelect={goToDate} onToday={goToday} />
                </div>
              )}
            </AnimatePresence>
          </div>
          <button className="ds-arrow" onClick={nextDay} title={nextTitle} aria-label={nextTitle}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>
        </div>

        {/* Bell and menu */}
        <div className="ds-actions">
          {/* Find time — only in extended mode */}
          {extended && (
            <div className="ds-menu-wrap">
              <button className={`ds-findtime ${openMenu === 'findtime' ? 'active' : ''}`} onClick={() => toggleMenu('findtime')} title={t.findTimeTitle} aria-label={t.findTimeTitle}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
                <span className="ds-findtime-label">{t.findTime}</span>
              </button>
              <AnimatePresence>
                {openMenu === 'findtime' && (
                  <motion.div className="ds-dropdown wide ft-pop" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                    <div className="ds-dropdown-title">{t.findTimeTitle} · {formatRu(dayOffset, lang).replace(lang === 'en' ? 'Today, ' : 'Сегодня, ', '')}</div>

                    {/* Search parameters */}
                    <div className="ds-ft-controls">
                      <div className="ds-ft-hours">
                        <span>{t.need}</span>
                        <button className="ds-ft-step" onClick={() => setFtHours(h => Math.max(0.5, h - 0.5))}>−</button>
                        <span className="ds-ft-hval">{ftHours} {t.hoursShort}</span>
                        <button className="ds-ft-step" onClick={() => setFtHours(h => Math.min(12, h + 0.5))}>+</button>
                      </div>
                      <div className="ds-ft-toggle">
                        <button className={ftContig ? 'active' : ''} onClick={() => { setFtContig(true); setFtResult(null) }}>{t.contig}</button>
                        <button className={!ftContig ? 'active' : ''} onClick={() => { setFtContig(false); setFtResult(null) }}>{t.parts}</button>
                      </div>
                    </div>
                    <button className="ds-ft-run" onClick={runFindTime}>{t.findTimeBtn}</button>
                    <span className="ds-ft-note">{t.ftNote}</span>

                    {/* Result */}
                    {ftResult && ftResult.ok && ftResult.mode === 'contig' && (
                      <div className="ds-ft-res">
                        <div className="ds-ft-res-title">{t.freeContig}</div>
                        {ftResult.slots.map((s, i) => (
                          <button key={i} className="ds-ft-slot" onClick={() => addAtSlot(s)}>
                            <span className="ds-ft-time">{minutesToStr(s.start)} – {minutesToStr(s.end)}</span>
                            <span className="ds-ft-dur">{t.book}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {ftResult && ftResult.ok && ftResult.mode === 'parts' && (
                      <div className="ds-ft-res">
                        <div className="ds-ft-res-title">{t.availableParts(Math.round(ftResult.total / 60 * 10) / 10)}</div>
                        {ftResult.windows.map(([s, e], i) => (
                          <button key={i} className="ds-ft-slot" onClick={() => addAtSlot({ start: s, end: e })}>
                            <span className="ds-ft-time">{minutesToStr(s)} – {minutesToStr(e)}</span>
                            <span className="ds-ft-dur">{Math.round((e - s) / 60 * 10) / 10} {t.hoursShort}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {ftResult && !ftResult.ok && ftResult.mode === 'contig' && (
                      <div className="ds-ft-res">
                        {ftResult.variants && ftResult.variants.length > 0 ? (
                          <>
                            <div className="ds-ft-res-title warn">{t.noContig(ftHours)}</div>
                            {ftResult.variants.map((v, i) => (
                              <div key={i} className="ds-ft-variant">
                                <div className="ds-ft-var-info">
                                  <span className="ds-ft-var-title">{v.title}</span>
                                  <span className="ds-ft-var-desc">{v.desc}</span>
                                  <span className="ds-ft-var-slot">→ {t.slotArrow} {minutesToStr(v.slot.start)}–{minutesToStr(v.slot.end)}</span>
                                </div>
                                <button className="ds-ft-apply" onClick={() => openPreview(v)}>{t.shiftBtn}</button>
                              </div>
                            ))}
                          </>
                        ) : (
                          <div className="ds-ft-res-title warn">{t.noVariants}</div>
                        )}
                      </div>
                    )}
                    {ftResult && !ftResult.ok && ftResult.mode === 'parts' && (
                      <div className="ds-ft-res">
                        <div className="ds-ft-res-title warn">{t.partsNotEnough(Math.round(ftResult.total / 60 * 10) / 10)}</div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <button className="ds-add-btn" onClick={openAdd} title={t.addEvent}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span className="ds-add-txt">{t.addEvent}</span>
          </button>

          <div className="ds-menu-wrap">
            <button className={`ds-icon-btn ${openMenu === 'header' ? 'active' : ''}`} onClick={() => toggleMenu('header')} title={t.menu}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
            </button>
            <AnimatePresence>
              {openMenu === 'header' && (
                <motion.div className="ds-dropdown" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                  <button className="ds-dropdown-item" onClick={goToday}>{t.goToday}</button>
                  <button className="ds-dropdown-item" onClick={() => { resetEvents(); setOpenMenu(null) }}>{t.resetEvents}</button>
                  <button className="ds-dropdown-item" onClick={openAdd}>{t.addEvent}</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Backdrop that closes the dropdown on a click outside */}
      {openMenu && <div className="ds-backdrop" onClick={() => setOpenMenu(null)} />}

      {/* All-day events — compact strips above the scale (as in Google Calendar) */}
      {(viewMode === 'list' || viewMode === 'day') && allDayEvents.length > 0 && (
        <div className="ds-allday">
          {allDayEvents.map((ev, i) => (
            <div key={`ad-${i}`} className="ds-allday-chip">
              <span className="ds-allday-dot" style={{ background: COLORS[ev.type] || 'var(--accent)' }} />
              <span className="ds-allday-title">{pick(ev, 'title')}</span>
              <span className="ds-allday-meta">{t.allDay}</span>
              <div className="ds-menu-wrap">
                <button className="ds-event-menu" onClick={() => toggleMenu(`ad-${i}`)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                </button>
                <AnimatePresence>
                  {openMenu === `ad-${i}` && (
                    <motion.div className="ds-dropdown ev-drop" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                      <button className="ds-dropdown-item" onClick={() => startEdit(ev)}>{t.edit}</button>
                      <button className="ds-dropdown-item danger" onClick={() => deleteEvent(ev)}>{t.remove}</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* The "Day/List" mode — a vertical timeline (desktop).
          On a phone the hour-by-hour scale is awkward (empty hours, too narrow) → the agenda list below. */}
      {(viewMode === 'list' || viewMode === 'day') && !isMobile && (
        <div className="ds-scroll" ref={scrollRef}>
          <div className="ds-timeline" style={{ height: timelineHeight }}>
            {/* Hour lines + faint half-hour marks (the cards are aligned to these) */}
            {hours.map((h, i) => (
              <div key={h}>
                <div className="ds-hour-row" style={{ top: i * PX_PER_HOUR }}>
                  <span className="ds-hour-label">{String(h).padStart(2, '0')}:00</span>
                  <div className="ds-hour-line" />
                </div>
                {h < HOUR_MAX && (
                  <div className="ds-half-row" style={{ top: i * PX_PER_HOUR + PX_PER_HOUR / 2 }}>
                    <div className="ds-half-line" />
                  </div>
                )}
              </div>
            ))}

            {/* The current-time line */}
            {inRange && (
              <div className="ds-now" style={{ top: nowTop }}>
                <span className="ds-now-label">{nowLabel}</span>
                <div className="ds-now-line" />
              </div>
            )}

            {dayEvents.length === 0 && (
              <p className="ds-empty-list">{t.emptyTimeline}</p>
            )}

            {/* Events (overlaps handled by splitting the width into columns) */}
            {positionedEvents.map((e, k) => {
              const ev = e._ref  // a reference to the original object, for the operations
              const i = k
              const top = e._top
              const height = e._height
              const gap = 6
              const widthExpr = `calc((100% - 64px) / ${e._cols} - ${gap}px)`
              const leftExpr = `calc(60px + (100% - 64px) * ${e._col} / ${e._cols})`
              const overlapped = e._cols > 1
              return (
                <motion.div
                  key={`${e.title}-${i}`}
                  className={`ds-event ${overlapped ? 'overlapped' : ''} ${openMenu === `ev-${i}` ? 'menu-open' : ''}`}
                  style={{ top, height, left: leftExpr, width: widthExpr, right: 'auto', '--ev-color': COLORS[e.type] }}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: 0.05 * k }}
                  whileHover={{ scale: 1.01 }}
                >
                  <span className="ds-event-icon" style={{ background: COLORS[e.type] }}>
                    {eventIcon(e)}
                  </span>
                  <div className="ds-event-body">
                    <span className="ds-event-title">
                      {e.priority && e.priority <= 2 && (
                        <span
                          className="ds-pri-dot"
                          style={{ background: categoryColor(PRIORITY_MAP[e.priority]?.colorKey) }}
                          title={t.priorityTip(e.priority, lang === 'en' ? PRIORITY_MAP[e.priority]?.labelEn : PRIORITY_MAP[e.priority]?.label)}
                        />
                      )}
                      {pick(e, 'title')}
                      {e.repeat && e.repeat !== 'none' && (
                        <svg className="ds-repeat-ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label={repeatLabel(e.repeat, e.customDays, lang)}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                      )}
                    </span>
                    <span className="ds-event-meta">{e.start} – {e.end} <span className="ds-dot">•</span> {pick(e, 'who')}</span>
                  </div>
                  <div className="ds-menu-wrap">
                    <button className="ds-event-menu" onClick={() => toggleMenu(`ev-${i}`)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                    </button>
                    <AnimatePresence>
                      {openMenu === `ev-${i}` && (
                        <motion.div className="ds-dropdown ev-drop" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                          <button className="ds-dropdown-item" onClick={() => startEdit(ev)}>{t.edit}</button>
                          <button className="ds-dropdown-item" onClick={() => startEdit(ev)}>{t.move}</button>
                          <button className="ds-dropdown-item danger" onClick={() => deleteEvent(ev)}>{t.remove}</button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}

      {/* The "Day/List" mode on a phone — an agenda list (no hour grid) */}
      {(viewMode === 'list' || viewMode === 'day') && isMobile && (
        <div className="ds-agenda">
          {dayEvents.length === 0 && <p className="ds-empty-list">{t.emptyTimeline}</p>}
          {timedEvents.map((e, i) => (
            <motion.div
              key={`ag-${e.title}-${i}`}
              className={`ds-ag-item ${openMenu === `ev-${i}` ? 'menu-open' : ''}`}
              style={{ '--ev-color': COLORS[e.type] }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: Math.min(i * 0.03, 0.18) }}
            >
              <div className="ds-ag-time">
                <span className="ds-ag-start">{e.start}</span>
                <span className="ds-ag-end">{e.end}</span>
              </div>
              <span className="ds-ag-rail" />
              <span className="ds-event-icon" style={{ background: COLORS[e.type] }}>{eventIcon(e)}</span>
              <div className="ds-ag-body">
                <span className="ds-event-title">
                  {e.priority && e.priority <= 2 && (
                    <span className="ds-pri-dot" style={{ background: categoryColor(PRIORITY_MAP[e.priority]?.colorKey) }} />
                  )}
                  {pick(e, 'title')}
                  {e.repeat && e.repeat !== 'none' && (
                    <svg className="ds-repeat-ic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                  )}
                </span>
                {pick(e, 'who') && <span className="ds-event-meta">{pick(e, 'who')}</span>}
              </div>
              <div className="ds-menu-wrap">
                <button className="ds-event-menu" onClick={() => toggleMenu(`ev-${i}`)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                </button>
                <AnimatePresence>
                  {openMenu === `ev-${i}` && (
                    <motion.div className="ds-dropdown ev-drop" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                      <button className="ds-dropdown-item" onClick={() => startEdit(e)}>{t.edit}</button>
                      <button className="ds-dropdown-item" onClick={() => startEdit(e)}>{t.move}</button>
                      <button className="ds-dropdown-item danger" onClick={() => deleteEvent(e)}>{t.remove}</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* The "Columns" mode — a compact grid of events */}
      {viewMode === 'columns' && (
        <div className="ds-columns">
          {dayEvents.length === 0 && <p className="ds-empty">{t.emptyColumns}</p>}
          {dayEvents.map((e, i) => (
            <div key={i} className="ds-col-card" style={{ '--ev-color': COLORS[e.type] }}>
              <span className="ds-event-icon" style={{ background: COLORS[e.type] }}>{eventIcon(e)}</span>
              <span className="ds-event-title">{pick(e, 'title')}</span>
              <span className="ds-event-meta">{e.start} – {e.end}</span>
              <span className="ds-event-meta">{pick(e, 'who')}</span>
            </div>
          ))}
        </div>
      )}

      {/* The "Week" mode — 7 columns */}
      {viewMode === 'week' && (
        <div className="ds-week">
          {weekDays.map((d, i) => {
            const evs = eventsOf(d)
            const isToday = dateKey(d) === dateKey(now)
            const wdNames = lang === 'en'
              ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
              : ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
            return (
              <div key={i} className={`ds-wk-col ${isToday ? 'today' : ''}`}>
                <button className="ds-wk-head" onClick={() => goToDay(d)}>
                  <span className="ds-wk-wd">{wdNames[d.getDay()]}</span>
                  <span className="ds-wk-num">{d.getDate()}</span>
                </button>
                <div className="ds-wk-events">
                  {evs.length === 0 && <span className="ds-wk-empty">—</span>}
                  {evs.map((e, k) => (
                    <button key={k} className="ds-wk-ev" style={{ '--ev-color': COLORS[e.type] }} onClick={() => startEdit(e)}>
                      <span className="ds-wk-ev-time">{e.start}</span>
                      <span className="ds-wk-ev-title">{e.priority && e.priority <= 2 && <span className="ds-pri-dot" style={{ background: categoryColor(PRIORITY_MAP[e.priority]?.colorKey) }} />}{pick(e, 'title')}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* The "Month" mode — a calendar grid */}
      {viewMode === 'month' && (
        <div className="ds-month">
          <div className="ds-month-week">
            {(lang === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']).map(w => <span key={w} className="ds-month-wd">{w}</span>)}
          </div>
          <div className="ds-month-grid">
            {monthCells.map((d, i) => {
              if (!d) return <div key={i} className="ds-month-cell empty" />
              const evs = eventsOf(d)
              const isToday = dateKey(d) === dateKey(now)
              return (
                <button key={i} className={`ds-month-cell ${isToday ? 'today' : ''}`} onClick={() => goToDay(d)}>
                  <span className="ds-month-num">{d.getDate()}</span>
                  <div className="ds-month-dots">
                    {evs.slice(0, 4).map((e, k) => (
                      <span key={k} className="ds-month-dot" style={{ background: COLORS[e.type] }} />
                    ))}
                  </div>
                  {evs.length > 0 && <span className="ds-month-count">{evs.length}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* FAB — add an event */}
      <button className="ds-fab" title={t.addEventTitle} onClick={openAdd}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>

      {/* The add / edit modal */}
      <AnimatePresence>
        {modalOpen && (
          <AddEventModal
            onAdd={saveEvent}
            onClose={closeModal}
            initial={editEvent}
            defaultDate={viewKey}
            defaultStart={prefillStart?.start}
            defaultEnd={prefillStart?.end}
          />
        )}
      </AnimatePresence>

      {/* The rearrangement preview window */}
      <AnimatePresence>
        {ftPreview && (
          <div className="ds-conflict-backdrop" onClick={() => setFtPreview(null)}>
            <motion.div
              className="ds-preview card"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <div className="ds-pv-head">
                <h3>{ftPreview.variant.title}</h3>
                <button className="ds-pv-close" onClick={() => setFtPreview(null)} aria-label={t.close}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <p className="ds-pv-sub">{t.willChange(ftPreview.rows.length, lang === 'en' ? (ftPreview.rows.length === 1 ? 'event' : 'events') : (ftPreview.rows.length === 1 ? 'событие' : 'события'))}<b>{minutesToStr(ftPreview.slot.start)}–{minutesToStr(ftPreview.slot.end)}</b>.</p>

              <div className="ds-pv-cols">
                <div className="ds-pv-col-head"><span>{t.colEvent}</span><span>{t.colWas}</span><span></span><span>{t.colWill}</span></div>
                {ftPreview.rows.map((r, i) => (
                  <div key={i} className={`ds-pv-row ${r.kind === 'remove' ? 'rm' : ''}`}>
                    <span className="ds-pv-ev">
                      <span className="ds-pv-ic" style={{ background: COLORS[r.type] }}>{eventIcon(r)}</span>
                      <span className="ds-pv-title">{r.priority && r.priority <= 2 && <span className="ds-pri-dot" style={{ background: categoryColor(PRIORITY_MAP[r.priority]?.colorKey) }} />}{r.title}</span>
                    </span>
                    <span className="ds-pv-old">{r.before}</span>
                    <span className="ds-pv-arrow">→</span>
                    {r.kind === 'remove'
                      ? <span className="ds-pv-rm">{t.pvRemove}</span>
                      : <span className="ds-pv-new">{r.after}</span>}
                  </div>
                ))}
              </div>

              <div className="ds-pv-actions">
                <button className="ds-pv-btn primary" onClick={confirmPreview}>{t.apply}</button>
                <button className="ds-pv-btn ghost" onClick={() => setFtPreview(null)}>{t.cancel}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* The event overlap window */}
      <AnimatePresence>
        {conflict && (
          <div className="ds-conflict-backdrop" onClick={() => setConflict(null)}>
            <motion.div
              className="ds-conflict card"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <div className="ds-conflict-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <h3>{t.conflictTitle}</h3>
              <p className="ds-conflict-text">
                {lang === 'en' ? (
                  <>
                    The new event <b>“{conflict.pending.title}”</b> ({conflict.pending.start}–{conflict.pending.end})
                    overlaps with the already planned <b>“{conflict.existing.title}”</b> ({conflict.existing.start}–{conflict.existing.end}).
                    What would you like to do?
                  </>
                ) : (
                  <>
                    Новое событие <b>«{conflict.pending.title}»</b> ({conflict.pending.start}–{conflict.pending.end})
                    попадает на время уже запланированного <b>«{conflict.existing.title}»</b> ({conflict.existing.start}–{conflict.existing.end}).
                    Как поступить?
                  </>
                )}
              </p>
              <div className="ds-conflict-actions">
                <button className="ds-conflict-btn" onClick={resolveKeepBoth}>
                  <span className="ds-cb-title">{t.keepBoth}</span>
                  <span className="ds-cb-sub">{t.keepBothSub}</span>
                </button>
                <button className="ds-conflict-btn" onClick={resolveShift}>
                  <span className="ds-cb-title">{t.shiftNew}</span>
                  <span className="ds-cb-sub">{lang === 'en' ? `I’ll place it right after “${conflict.existing.title}”` : `Поставлю сразу после «${conflict.existing.title}»`}</span>
                </button>
                <button className="ds-conflict-btn danger" onClick={resolveReplace}>
                  <span className="ds-cb-title">{t.replaceOld}</span>
                  <span className="ds-cb-sub">{lang === 'en' ? `I’ll delete “${conflict.existing.title}”` : `Удалю «${conflict.existing.title}»`}</span>
                </button>
                <button className="ds-conflict-btn ghost" onClick={() => setConflict(null)}>
                  <span className="ds-cb-title">{t.cancel}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .day-schedule {
          position: relative;
          display: flex;
          flex-direction: column;
          padding: 0;
          overflow: visible;   /* so the dropdowns (Find time) aren't clipped */
          height: 560px;
          /* The toolbar adapts to the card's own width, not the window's: next to the day
             summary on a 1440px screen the card is narrow, and every label wrapped onto two lines */
          container-type: inline-size; container-name: dsched;
        }
        .day-schedule.extended { height: 100%; }   /* on the Schedule page it takes all the available height */
        /* the inner areas keep the card's rounded corners */
        .ds-scroll, .ds-week, .ds-month, .ds-columns {
          border-radius: 0 0 var(--radius) var(--radius);
        }
        .ds-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 18px;
          border-bottom: 1px solid var(--border);
        }
        .ds-view-switch {
          display: flex;
          gap: 3px;
          background: var(--bg-secondary);
          padding: 3px;
          border-radius: 10px;
        }
        .ds-view {
          width: 30px; height: 28px;
          border: none;
          background: transparent;
          color: var(--muted-foreground);
          border-radius: 7px;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .ds-view.active {
          background: var(--accent);
          color: var(--on-accent);
        }
        .ds-view-switch.text { padding: 3px; }
        .ds-view-txt {
          border: none; background: transparent;
          color: var(--muted-foreground);
          font-family: inherit; font-size: 13px; font-weight: 600;
          padding: 7px 14px; border-radius: 8px; cursor: pointer;
          transition: all 0.15s;
        }
        .ds-view-txt:hover { color: var(--foreground); }
        .ds-view-txt.active { background: var(--accent); color: var(--on-accent); }

        .ds-findtime {
          display: flex; align-items: center; gap: 7px;
          padding: 8px 14px;
          border: 1px solid var(--border);
          background: var(--bg-secondary);
          color: var(--foreground);
          font-family: inherit; font-size: 13px; font-weight: 600;
          border-radius: 10px; cursor: pointer;
          transition: all 0.15s;
        }
        .ds-findtime:hover, .ds-findtime.active { border-color: var(--border-hover); color: var(--primary); }
        .ds-findtime, .ds-date, .ds-add-btn { white-space: nowrap; }
        @container dsched (max-width: 1000px) {
          .ds-findtime-label { display: none; }
          .ds-findtime { padding: 8px 11px; }
        }
        .ds-findtime svg { color: var(--primary); }
        .ft-pop { left: auto; right: 0; min-width: 300px; max-height: 70vh; overflow-y: auto; }
        .ds-ft-controls { display: flex; flex-direction: column; gap: 8px; padding: 4px 6px 8px; }
        .ds-ft-hours { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted-foreground); }
        .ds-ft-step {
          width: 26px; height: 26px; border-radius: 8px;
          border: 1px solid var(--border); background: var(--card);
          color: var(--foreground); font-size: 16px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; line-height: 1;
        }
        .ds-ft-step:hover { border-color: var(--border-hover); }
        .ds-ft-hval { font-size: 14px; font-weight: 700; color: var(--foreground); min-width: 44px; text-align: center; }
        .ds-ft-toggle { display: flex; gap: 4px; background: var(--card); padding: 3px; border-radius: 9px; }
        .ds-ft-toggle button {
          flex: 1; border: none; background: transparent; color: var(--muted-foreground);
          font-family: inherit; font-size: 12.5px; font-weight: 600; padding: 7px; border-radius: 7px; cursor: pointer;
          transition: all 0.15s;
        }
        .ds-ft-toggle button.active { background: var(--primary); color: var(--primary-foreground); }
        .ds-ft-run {
          margin: 0 6px; padding: 9px; border-radius: 9px; border: none;
          background: var(--primary); color: var(--primary-foreground);
          font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
          transition: opacity 0.15s;
        }
        .ds-ft-run:hover { opacity: 0.9; }
        .ds-ft-note { font-size: 11px; color: var(--muted-foreground); padding: 4px 6px; text-align: center; }
        .ds-ft-res { border-top: 1px solid var(--border); margin-top: 6px; padding-top: 6px; display: flex; flex-direction: column; gap: 2px; }
        .ds-ft-res-title { font-size: 12px; font-weight: 600; color: var(--muted-foreground); padding: 4px 8px; }
        .ds-ft-res-title.warn { color: var(--yellow); line-height: 1.5; }
        .ds-ft-slot {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          text-align: left; border: none; background: transparent;
          padding: 9px 10px; border-radius: 8px; cursor: pointer;
          font-family: inherit; transition: background 0.12s;
        }
        .ds-ft-slot:hover { background: color-mix(in srgb, var(--text-primary) 6%, transparent); }
        .ds-ft-time { font-size: 13.5px; font-weight: 600; color: var(--foreground); }
        .ds-ft-dur { font-size: 11.5px; color: var(--green); }
        .ds-ft-move {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 10px; border-radius: 8px;
        }
        .ds-ft-move-title { font-size: 13px; color: var(--foreground); font-weight: 500; }
        .ds-ft-move-meta { font-size: 11px; color: var(--muted-foreground); margin-left: auto; }
        .ds-ft-variant {
          display: flex; align-items: center; gap: 10px;
          padding: 10px; border-radius: 10px;
          background: color-mix(in srgb, var(--text-primary) 2.5%, transparent);
          border: 1px solid var(--border);
          margin: 0 2px 6px;
        }
        .ds-ft-var-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
        .ds-ft-var-title { font-size: 13px; font-weight: 600; color: var(--foreground); }
        .ds-ft-var-desc { font-size: 11.5px; color: var(--muted-foreground); line-height: 1.4; }
        .ds-ft-var-slot { font-size: 11px; color: var(--green); font-weight: 500; }
        .ds-ft-apply {
          flex-shrink: 0;
          padding: 8px 14px; border-radius: 9px; border: none;
          background: var(--primary); color: var(--primary-foreground);
          font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
          transition: opacity 0.15s;
        }
        .ds-ft-apply:hover { opacity: 0.9; }

        /* Week view */
        .ds-week {
          flex: 1; overflow-y: auto;
          /* minmax(0,1fr): columns may shrink NARROWER than their content — otherwise 7 columns
             blow the card wider than the screen and the page scrolls sideways (mobile). */
          display: grid; grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 6px; padding: 14px;
        }
        .ds-wk-col { min-width: 0; }
        .ds-wk-ev-title, .ds-wk-wd { overflow-wrap: anywhere; }
        .ds-wk-col {
          display: flex; flex-direction: column; gap: 6px;
          border-radius: 12px; padding: 6px;
          background: color-mix(in srgb, var(--text-primary) 1.5%, transparent);
        }
        .ds-wk-col.today { background: color-mix(in srgb, var(--accent-today) 7%, transparent); }
        .ds-wk-head {
          display: flex; flex-direction: column; align-items: center; gap: 2px;
          border: none; background: transparent; cursor: pointer;
          padding: 6px 0; border-radius: 8px; font-family: inherit;
          transition: background 0.15s;
        }
        .ds-wk-head:hover { background: var(--bg-secondary); }
        .ds-wk-wd { font-size: 11px; font-weight: 600; color: var(--muted-foreground); text-transform: uppercase; }
        .ds-wk-num { font-size: 17px; font-weight: 700; color: var(--foreground); }
        .ds-wk-col.today .ds-wk-num { color: var(--accent-today, var(--yellow)); }
        .ds-wk-events { display: flex; flex-direction: column; gap: 5px; }
        .ds-wk-empty { text-align: center; color: var(--muted-foreground); font-size: 12px; padding: 8px 0; opacity: 0.5; }
        .ds-wk-ev {
          display: flex; flex-direction: column; gap: 2px;
          text-align: left; cursor: pointer; font-family: inherit;
          border: none; border-left: 3px solid var(--ev-color);
          background: var(--bg-secondary);
          padding: 7px 9px; border-radius: 8px;
          transition: background 0.15s;
        }
        .ds-wk-ev:hover { background: var(--card); }
        .ds-wk-ev-time { font-size: 11px; font-weight: 600; color: var(--ev-color); }
        .ds-wk-ev-title { font-size: 12.5px; color: var(--foreground); line-height: 1.3; }

        /* Month view */
        .ds-month { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; }
        .ds-month-week { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 8px; }
        .ds-month-wd { text-align: center; font-size: 11px; font-weight: 600; color: var(--muted-foreground); text-transform: uppercase; }
        .ds-month-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; flex: 1; }
        .ds-month-cell {
          position: relative;
          min-height: 72px;
          display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
          border: 1px solid var(--border); border-radius: 10px;
          background: color-mix(in srgb, var(--text-primary) 1.5%, transparent);
          padding: 8px; cursor: pointer; font-family: inherit;
          transition: border-color 0.15s, background 0.15s;
        }
        .ds-month-cell:hover { border-color: var(--border-hover); background: var(--bg-secondary); }
        .ds-month-cell.empty { background: transparent; border-color: transparent; cursor: default; }
        .ds-month-cell.today { border-color: var(--accent-today, var(--yellow)); }
        .ds-month-num { font-size: 13px; font-weight: 600; color: var(--foreground); }
        .ds-month-cell.today .ds-month-num { color: var(--accent-today, var(--yellow)); }
        .ds-month-dots { display: flex; flex-wrap: wrap; gap: 3px; }
        .ds-month-dot { width: 7px; height: 7px; border-radius: 50%; }
        .ds-month-count {
          position: absolute; bottom: 6px; right: 8px;
          font-size: 10px; color: var(--muted-foreground);
        }
        .ds-nav { display: flex; align-items: center; gap: 12px; }
        .ds-arrow {
          width: 26px; height: 26px;
          border: none; background: transparent;
          color: var(--muted-foreground);
          cursor: pointer; border-radius: 7px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .ds-arrow:hover { background: var(--bg-secondary); color: var(--foreground); }
        .ds-date {
          font-size: 15px; font-weight: 600; color: var(--foreground);
          border: none; background: transparent; cursor: pointer;
          padding: 5px 10px; border-radius: 8px; font-family: inherit;
          transition: background 0.15s;
          min-width: 130px; text-align: center;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .ds-date:hover, .ds-date.active { background: var(--bg-secondary); }
        .ds-cal-pop {
          position: absolute;
          top: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
          z-index: 60;
        }
        .ds-actions { display: flex; gap: 4px; }
        .ds-menu-wrap { position: relative; }

        /* ── Mobile: the header doesn't fit on one line — the date moves to its own centred
           line, "Find time" folds to an icon; touch targets are ≥40px (arrows, event menu,
           icons, view tabs) ── */
        @media (max-width: 640px) {
          .ds-head { flex-wrap: wrap; gap: 8px 10px; padding: 12px 12px; }
          .ds-nav { order: 3; flex-basis: 100%; justify-content: center; gap: 6px; }
          .ds-date { min-width: 0; font-size: 14px; min-height: 40px; }
          .ds-findtime-label { display: none; }
          .ds-findtime { padding: 8px 12px; min-height: 40px; }
          .ds-view-txt { padding: 9px 13px; min-height: 40px; }
          .ds-arrow { width: 40px; height: 40px; }
          .ds-event-menu { width: 40px; height: 40px; }
          .ds-chat-send { width: 40px; height: 40px; }
          .ft-pop { min-width: 0; width: min(300px, calc(100vw - 32px)); }
          /* The schedule flows in the page's own scroll (no nested scroll) so the event
             actions menu (Edit/Delete) isn't clipped by the agenda container and stays
             tappable. */
          .day-schedule.extended { height: auto; }
          .ds-agenda { overflow: visible; flex: none; }
          /* Week on a phone: a vertical agenda strip instead of 7 narrow columns (in columns
             the text broke letter by letter). A day is a row: the date on the left, events on the right. */
          .ds-week { grid-template-columns: 1fr; gap: 8px; padding: 10px; }
          .ds-wk-col { flex-direction: row; align-items: stretch; gap: 12px; padding: 10px 12px;
            background: var(--bg-tile); box-shadow: var(--inset-tile, none); }
          .ds-wk-head { flex-direction: column; justify-content: center; gap: 0;
            min-width: 42px; flex-shrink: 0; padding: 0; }
          .ds-wk-events { flex: 1; min-width: 0; }
          .ds-wk-ev { padding: 8px 11px; }
          .ds-wk-ev-title { overflow-wrap: normal; word-break: normal; }
          .ds-wk-empty { text-align: left; padding: 4px 2px; }
        }
        .ds-icon-btn.active { background: var(--bg-secondary); color: var(--foreground); }
        .ds-bell-dot {
          position: absolute; top: 6px; right: 7px;
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--red); border: 1.5px solid var(--card);
        }

        /* Dropdown menu */
        .ds-backdrop { position: fixed; inset: 0; z-index: 40; }
        .ds-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          min-width: 190px;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.45);
          padding: 6px;
          z-index: 50;
          display: flex; flex-direction: column; gap: 2px;
        }
        .ds-dropdown.wide { min-width: 280px; }
        .ds-dropdown.ev-drop { right: 0; top: calc(100% + 4px); }
        .ds-dropdown-title {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--muted-foreground);
          padding: 8px 10px 6px;
        }
        .ds-dropdown-item {
          text-align: left;
          border: none; background: transparent;
          color: var(--foreground);
          font-family: inherit; font-size: 13.5px;
          padding: 9px 10px; border-radius: 8px;
          cursor: pointer; transition: background 0.12s;
        }
        .ds-dropdown-item:hover { background: color-mix(in srgb, var(--text-primary) 6%, transparent); }
        .ds-dropdown-item.danger { color: var(--red); }
        .ds-dropdown-item.danger:hover { background: color-mix(in srgb, var(--red) 12%, transparent); }
        .ds-notif {
          display: flex; flex-direction: column; gap: 3px;
          padding: 9px 10px; border-radius: 8px;
        }
        .ds-notif:hover { background: color-mix(in srgb, var(--text-primary) 4%, transparent); }
        .ds-notif-text { font-size: 13px; color: var(--foreground); line-height: 1.4; }
        .ds-notif-time { font-size: 11px; color: var(--muted-foreground); }
        .ds-icon-btn {
          width: 30px; height: 30px;
          border: none; background: transparent;
          color: var(--muted-foreground);
          cursor: pointer; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .ds-icon-btn:hover { background: var(--bg-secondary); color: var(--foreground); }
        @media (max-width: 640px) { .ds-icon-btn { width: 40px; height: 40px; } }

        /* A visible "Add event" button (it used to be hidden in the "…" menu) */
        .ds-add-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 8px 14px; border-radius: 999px;
          border: none; background: var(--accent); color: var(--on-accent, #fff);
          font-family: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer;
          transition: filter 0.15s, transform 0.1s;
        }
        .ds-add-btn:hover { filter: brightness(1.06); }
        .ds-add-btn:active { transform: translateY(1px); }
        /* On a narrow screen the button loses its label and becomes a second identical "+"
           next to the floating one — only the floating one stays (it sits under the thumb). */
        @media (max-width: 640px) { .ds-add-btn { display: none; } }

        /* "All day" chips above the time grid */
        .ds-allday { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 18px 0; flex-shrink: 0; }
        .ds-allday-chip {
          display: inline-flex; align-items: center; gap: 8px;
          background: var(--bg-tile); border: 1px solid var(--border);
          border-radius: 10px; padding: 5px 6px 5px 11px;
          min-width: 0;
        }
        .ds-allday-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .ds-allday-title {
          font-size: 13px; font-weight: 600; color: var(--text-body);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px;
        }
        .ds-allday-meta { font-size: 12px; color: var(--text-muted); flex-shrink: 0; }
        .ds-allday .ds-menu-wrap { position: relative; }

        .ds-scroll { flex: 1; overflow-y: auto; padding: 12px 18px 18px; }
        .ds-timeline { position: relative; }

        /* Agenda list (phone): the day's events as rows, without the hourly grid */
        .ds-agenda {
          flex: 1; min-height: 0; overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          display: flex; flex-direction: column; gap: 8px;
          padding: 12px 14px 16px;
          border-radius: 0 0 var(--radius) var(--radius);
        }
        .ds-ag-item {
          position: relative;
          display: flex; align-items: center; gap: 11px;
          min-width: 0;
          padding: 11px 8px 11px 11px;
          border-radius: 14px;
          background: var(--bg-tile);
          box-shadow: var(--inset-tile, none);
          border: 1px solid var(--border-soft);
        }
        .ds-ag-item.menu-open { z-index: 50; overflow: visible; }
        .ds-ag-time {
          flex-shrink: 0; width: 44px;
          display: flex; flex-direction: column; gap: 1px; align-items: flex-start;
        }
        .ds-ag-start { font-size: 14px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
        .ds-ag-end { font-size: 11.5px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
        .ds-ag-rail { flex-shrink: 0; width: 3px; align-self: stretch; min-height: 30px; border-radius: 2px; background: var(--ev-color, var(--accent)); }
        .ds-ag-item .ds-event-icon { width: 32px; height: 32px; border-radius: 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.24); }
        .ds-ag-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
        .ds-ag-item .ds-event-title {
          display: flex; align-items: center; flex-wrap: wrap; gap: 0;
          white-space: normal; overflow: visible; text-overflow: clip;
          overflow-wrap: anywhere; line-height: 1.25;
        }
        .ds-ag-item .ds-event-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .ds-hour-row { position: absolute; left: 0; right: 0; display: flex; align-items: center; gap: 12px; }
        .ds-hour-label {
          font-size: 12px;
          color: var(--text-muted);
          min-width: 42px;
          font-variant-numeric: tabular-nums;
        }
        .ds-hour-line { flex: 1; height: 1px; background: var(--border-soft); }
        /* half-hour mark — fainter than the hour line; the cards visually line up with it */
        .ds-half-row { position: absolute; left: 54px; right: 0; display: flex; align-items: center; }
        .ds-half-line { flex: 1; height: 1px; background: var(--border-soft); opacity: 0.4; }

        .ds-now { position: absolute; left: 0; right: 0; display: flex; align-items: center; z-index: 5; }
        .ds-now-label {
          font-size: 11px;
          font-weight: 700;
          color: var(--bg-app);
          background: var(--accent-today, var(--yellow));
          padding: 3px 9px;
          border-radius: 6px 6px 6px 0;
          position: relative;
          z-index: 2;
          font-variant-numeric: tabular-nums;
        }
        .ds-now-line { flex: 1; height: 2px; background: var(--accent-today, var(--yellow)); }

        .ds-event {
          position: absolute;
          left: 60px;
          right: 4px;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 14px;
          background: var(--bg-tile);
          border: 1px solid var(--border-med);
          border-radius: 16px;
          box-shadow: var(--shadow-card);
          cursor: pointer;
          z-index: 3;
          overflow: hidden;   /* safety net: content never spills out of the card */
          box-sizing: border-box;
        }
        .ds-event-icon {
          width: 42px; height: 42px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 2px 6px rgba(0,0,0,0.28);
        }
        .ds-event-body { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
        .ds-event-title {
          font-size: 14.5px;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .ds-event-meta { font-size: 12.5px; color: var(--text-muted); }
        .ds-dot { margin: 0 4px; color: var(--ev-color); }
        .ds-event-menu {
          border: none; background: transparent;
          color: var(--muted-foreground);
          cursor: pointer; padding: 4px;
          border-radius: 6px;
          flex-shrink: 0;
          transition: all 0.15s;
        }
        .ds-event-menu:hover { background: color-mix(in srgb, var(--text-primary) 6%, transparent); color: var(--foreground); }
        /* z-index above the backdrop (40) so clicks on menu items register */
        .ds-event .ds-menu-wrap { z-index: 60; }
        /* while the menu is open, lift the card above the backdrop AND drop the clipping so the
           dropdown isn't cut off (text clipping lives on .ds-event-title itself) */
        .ds-event.menu-open { z-index: 50; overflow: visible; }
        .ds-event.overlapped { left: auto; }
        .ds-repeat-ic { margin-left: 6px; color: var(--muted-foreground); vertical-align: middle; }
        .ds-pri-dot { width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; flex-shrink: 0; display: inline-block; }

        /* Columns mode */
        .ds-columns {
          flex: 1;
          overflow-y: auto;
          padding: 18px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 12px;
          align-content: start;
        }
        .ds-col-card {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 14px;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-left: 3px solid var(--ev-color);
          border-radius: 14px;
        }
        .ds-col-card .ds-event-icon { width: 34px; height: 34px; margin-bottom: 2px; }
        .ds-empty { color: var(--muted-foreground); font-size: 14px; padding: 20px; }
        .ds-empty-list {
          position: absolute; left: 60px; right: 4px; top: 40px;
          color: var(--muted-foreground); font-size: 14px;
          text-align: center; padding: 24px;
        }
        /* In the agenda (phone) the container isn't position:relative, so the absolute chip
           stuck to the card and overlapped the date row. In this context it stays in
           normal flow. */
        .ds-agenda .ds-empty-list {
          position: static; left: auto; right: auto; top: auto;
          padding: 32px 16px;
        }

        .ds-fab {
          position: absolute;
          bottom: 18px; right: 18px;
          width: 50px; height: 50px;
          border-radius: 50%;
          border: none;
          background: var(--accent);
          color: var(--on-accent);
          box-shadow: var(--shadow-btn);
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.15s;
          z-index: 10;
        }
        .ds-fab:hover { transform: scale(1.08); }
        .ds-fab:active { transform: scale(0.95); }
        /* On a large screen the header already has a labelled "+" — the floating button there
           only covered the last row of the week or month. */
        @media (min-width: 641px) { .ds-fab { display: none; } }
        /* On a narrow one, leave room for it so it doesn't sit on top of events. */
        @media (max-width: 640px) {
          .ds-scroll, .ds-week, .ds-month, .ds-agenda { padding-bottom: 76px; }
        }

        .ds-event-title { display: inline-flex; align-items: center; }

        /* Overlay window */
        .ds-preview {
          width: 100%; max-width: 560px;
          display: flex; flex-direction: column; gap: 16px;
          max-height: 80vh; overflow-y: auto;
        }
        .ds-pv-head { display: flex; align-items: center; justify-content: space-between; }
        .ds-pv-head h3 { font-size: 19px; font-weight: 700; color: var(--foreground); }
        .ds-pv-close {
          width: 34px; height: 34px; flex-shrink: 0;
          border: none; background: transparent;
          color: var(--muted-foreground);
          border-radius: 10px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .ds-pv-close:hover { background: var(--bg-secondary); color: var(--foreground); }
        .ds-pv-sub { font-size: 14px; color: var(--muted-foreground); line-height: 1.5; }
        .ds-pv-sub b { color: var(--green); }
        .ds-pv-cols { display: flex; flex-direction: column; gap: 6px; }
        .ds-pv-col-head {
          display: grid; grid-template-columns: 1fr 80px 24px 80px;
          align-items: center; gap: 10px;
          font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
          color: var(--muted-foreground); padding: 0 12px 4px;
        }
        .ds-pv-row {
          display: grid; grid-template-columns: 1fr 80px 24px 80px;
          align-items: center; gap: 10px;
          padding: 10px 12px; border-radius: 12px;
          background: var(--bg-secondary); border: 1px solid var(--border);
        }
        .ds-pv-row.rm { opacity: 0.7; }
        .ds-pv-ev { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .ds-pv-ic {
          width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .ds-pv-ic svg { width: 14px; height: 14px; }
        .ds-pv-title { font-size: 13.5px; font-weight: 500; color: var(--foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ds-pv-old { font-size: 13px; color: var(--muted-foreground); text-decoration: line-through; }
        .ds-pv-arrow { color: var(--muted-foreground); font-size: 14px; text-align: center; }
        .ds-pv-new { font-size: 13px; font-weight: 700; color: var(--green); }
        .ds-pv-rm { font-size: 12px; font-weight: 600; color: var(--red); }
        .ds-pv-actions { display: flex; gap: 10px; }
        .ds-pv-btn {
          padding: 11px 22px; border-radius: 11px;
          font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
          border: 1px solid transparent; transition: all 0.18s;
        }
        .ds-pv-btn.primary { background: var(--primary); color: var(--primary-foreground); flex: 1; }
        .ds-pv-btn.primary:hover { opacity: 0.9; }
        .ds-pv-btn.ghost { background: transparent; border-color: var(--border); color: var(--muted-foreground); }
        .ds-pv-btn.ghost:hover { color: var(--foreground); border-color: var(--border-hover); }

        .ds-conflict-backdrop {
          position: fixed; inset: 0;
          background: var(--scrim);
          backdrop-filter: blur(3px);
          z-index: 600;
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
        }
        .ds-conflict {
          width: 100%; max-width: 440px;
          display: flex; flex-direction: column; gap: 14px;
          align-items: flex-start;
        }
        .ds-conflict-icon {
          width: 48px; height: 48px;
          border-radius: 14px;
          background: color-mix(in srgb, var(--accent-today) 14%, transparent);
          display: flex; align-items: center; justify-content: center;
        }
        .ds-conflict h3 { font-size: 18px; font-weight: 700; color: var(--foreground); }
        .ds-conflict-text { font-size: 14px; line-height: 1.6; color: var(--muted-foreground); }
        .ds-conflict-text b { color: var(--foreground); font-weight: 600; }
        .ds-conflict-actions { display: flex; flex-direction: column; gap: 8px; width: 100%; margin-top: 4px; }
        .ds-conflict-btn {
          display: flex; flex-direction: column; gap: 2px;
          text-align: left;
          padding: 12px 14px;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          cursor: pointer;
          font-family: inherit;
          transition: border-color 0.15s, background 0.15s;
        }
        .ds-conflict-btn:hover { border-color: var(--border-hover); }
        .ds-conflict-btn.danger:hover { border-color: color-mix(in srgb, var(--red) 50%, transparent); }
        .ds-conflict-btn.ghost { background: transparent; align-items: center; }
        .ds-conflict-btn.ghost:hover { border-color: var(--border-hover); }
        .ds-cb-title { font-size: 14px; font-weight: 600; color: var(--foreground); }
        .ds-conflict-btn.danger .ds-cb-title { color: var(--red); }
        .ds-cb-sub { font-size: 12px; color: var(--muted-foreground); }
      `}</style>
    </div>
  )
}
