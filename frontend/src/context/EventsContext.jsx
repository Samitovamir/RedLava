import { createContext, useContext, useState, useEffect } from 'react'
import { useHistory } from './HistoryContext.jsx'
import { dayLabel } from '../utils/history.js'
import { mskNow } from '../utils/time.js'
import { isGuest } from '../api/authFetch.js'

// Local YYYY-MM-DD date key (with no timezone shift)
export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const TODAY_KEY = dateKey(mskNow())

// The schedule starts out empty — events come from Google Calendar (the demo set is gone)
export const INITIAL_EVENTS = []
const _DEMO_EVENTS = [
  { type: 'call', title: 'Утренняя планёрка', date: TODAY_KEY, start: '09:00', end: '09:30', who: 'Команда', priority: 2 },
  { type: 'calendar', title: 'Обновить календарь', date: TODAY_KEY, start: '11:00', end: '11:30', who: 'Эдвард Йохансон', priority: 3 },
  { type: 'email', title: 'Отправить отчёт', date: TODAY_KEY, start: '13:00', end: '13:30', who: 'Майк Тейлор', priority: 1 },
  { type: 'call', title: 'Звонок с командой', date: TODAY_KEY, start: '15:00', end: '15:45', who: 'Майк, Джон, Крис', priority: 2 },
  { type: 'meeting', title: 'Тренировка в зале', date: TODAY_KEY, start: '17:30', end: '18:30', who: 'Личное', priority: 3 }
]

const STORAGE_KEY = 'albert-events'
const EventsContext = createContext(null)

const sig = e => `${e.start}|${e.end}|${e.date}`
const detailOf = e => `${dayLabel(e.date)}, ${e.start}–${e.end}`

export function EventsProvider({ children }) {
  const { logAction } = useHistory()

  const [events, setEventsRaw] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : INITIAL_EVENTS
    } catch {
      return INITIAL_EVENTS
    }
  })

  // A "jump to this date" signal — set by AI actions so the schedule shows the right day
  const [focusSignal, setFocusSignal] = useState(null)

  // Persist on every change — a single source shared by every page
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)) } catch { /* ignore */ }
  }, [events])

  // When Google Calendar is connected we pull the real events (it is the source of truth)
  const [googleConnected, setGoogleConnected] = useState(false)
  // The Google token expired or was revoked (the refresh failed with invalid_grant) — a
  // reconnect is needed. We tell this apart from "never connected at all": only in this case
  // do we show the warning banner.
  const [googleNeedsReconnect, setGoogleNeedsReconnect] = useState(false)
  function syncFromGoogle() {
    return fetch('/api/calendar/status')
      .then(r => r.json())
      .then(d => {
        setGoogleConnected(!!d.connected)
        setGoogleNeedsReconnect(!!d.needsReconnect)
        // Google is not connected — do NOT touch the schedule: an account without Google
        // creates its events by hand (and syncs them across its own devices). This used to
        // clear them, so those events were wiped on every page load.
        if (!d.connected) return null
        return fetch('/api/calendar/events').then(r => r.json())
      })
      .then(data => {
        if (!data) return
        // first visit after the token died: status still reads green, but /events knows the truth
        if (data.needsReconnect) { setGoogleNeedsReconnect(true); setGoogleConnected(false) }
        if (Array.isArray(data.events)) setEventsRaw(data.events)
      })
      .catch(() => {})
  }
  // A guest runs on the demo events (out of localStorage) — we do not sync Google for them,
  // otherwise the empty response a guest gets would overwrite the demo.
  useEffect(() => { if (!isGuest()) syncFromGoogle() }, [])

  // Compare the old and new schedules and record the user's action in the history
  function diffAndLog(prev, next) {
    const prevByTitle = new Map(prev.map(e => [e.title, e]))
    const nextByTitle = new Map(next.map(e => [e.title, e]))
    const added = next.filter(e => !prevByTitle.has(e.title))
    const removed = prev.filter(e => !nextByTitle.has(e.title))
    const moved = next.filter(e => {
      const p = prevByTitle.get(e.title)
      return p && sig(p) !== sig(e)
    })
    if (added.length) {
      added.forEach(e => logAction({ actor: 'user', type: 'event', title: `Added event «${e.title}»`, detail: detailOf(e) }))
    } else if (removed.length) {
      removed.forEach(e => logAction({ actor: 'user', type: 'event', title: `Removed event «${e.title}»`, detail: detailOf(e) }))
    } else if (moved.length === 1) {
      logAction({ actor: 'user', type: 'event', title: `Перенёс «${moved[0].title}»`, detail: detailOf(moved[0]) })
    } else if (moved.length > 1) {
      logAction({ actor: 'user', type: 'event', title: `Обновил расписание (${moved.length} событий)`, detail: 'Изменены времена нескольких событий.' })
    }
  }

  // A wrapper around setState: logs the user's changes to the history
  function setEvents(next) {
    setEventsRaw(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next
      // log outside the render phase
      queueMicrotask(() => { try { diffAndLog(prev, resolved) } catch { /* ignore */ } })
      return resolved
    })
  }

  // Reset without writing to the history
  const resetEvents = () => setEventsRaw(INITIAL_EVENTS)

  // ── Manual schedule operations that respect Google (the source of truth) ──
  // When Google is connected, changes go TO THE CALENDAR and are then re-synced; otherwise
  // they would be wiped on the next load (the bug where a deleted event came back).
  async function removeEvent(ev) {
    if (googleConnected) {
      try { await fetch('/api/calendar/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ googleId: ev.googleId }) }) } catch { /* ignore */ }
      await syncFromGoogle()
      logAction({ actor: 'user', type: 'event', title: `Удалил событие «${ev.title}»`, detail: detailOf(ev) })
    } else {
      setEvents(list => list.filter(e => e !== ev))
    }
  }
  async function upsertEvent(ev, target = null) {
    if (googleConnected) {
      try {
        if (target && target.googleId) {
          await fetch('/api/calendar/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ googleId: target.googleId, title: ev.title, date: ev.date, start: ev.start, end: ev.end, who: ev.who }) })
        } else {
          await fetch('/api/calendar/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) })
        }
      } catch { /* ignore */ }
      await syncFromGoogle()
      logAction({ actor: 'user', type: 'event', title: target ? `Изменил «${ev.title}»` : `Добавил событие «${ev.title}»`, detail: detailOf(ev) })
    } else {
      if (target) setEvents(list => list.map(e => e === target ? ev : e))
      else setEvents(list => [...list, ev])
    }
  }
  // Bulk apply (moving several / deleting a set) — for "Найди время"
  async function applyBulk({ changes = null, removals = [] }) {
    if (googleConnected) {
      if (changes) {
        for (const [ev, patch] of changes.entries()) {
          try { await fetch('/api/calendar/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ googleId: ev.googleId, title: ev.title, date: patch.date || ev.date, start: patch.start || ev.start, end: patch.end || ev.end, who: ev.who }) }) } catch { /* ignore */ }
        }
      }
      for (const ev of removals) {
        try { await fetch('/api/calendar/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ googleId: ev.googleId }) }) } catch { /* ignore */ }
      }
      await syncFromGoogle()
    } else {
      setEvents(list => {
        let next = list
        if (changes) next = next.map(e => changes.get(e) ? { ...e, ...changes.get(e) } : e)
        if (removals.length) { const set = new Set(removals); next = next.filter(e => !set.has(e)) }
        return next
      })
    }
  }

  // Find an event by an inexact title (for moving or deleting it by voice)
  const findByTitle = (list, title) => {
    if (!title) return -1
    const q = title.trim().toLowerCase()
    let i = list.findIndex(e => e.title.toLowerCase() === q)
    if (i === -1) i = list.findIndex(e => e.title.toLowerCase().includes(q) || q.includes(e.title.toLowerCase()))
    return i
  }

  // AI actions awaiting confirmation (move/delete) — see ConfirmAiActionModal.
  // Why: the assistant sees not only the owner's words but also text FROM THE DATA (other
  // people's event titles, emails). If a planted instruction slips in that way ("delete
  // everything" in the description of someone else's meeting), it must not run on its own —
  // a person has to press the button. create_event is safer (it erases nothing and is easy
  // to undo), so it is applied straight away.
  const [pendingAiActions, setPendingAiActions] = useState([])

  async function applyCreates(actions) {
    if (!actions.length) return
    if (googleConnected) {
      let gFocus = null
      for (const a of actions) {
        const inp = a.input || {}
        try {
          const ev = { type: inp.type || 'calendar', title: inp.title || 'Событие', date: inp.date || TODAY_KEY, start: inp.start || '09:00', end: inp.end || '10:00', who: inp.who || '' }
          await fetch('/api/calendar/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) })
          gFocus = ev.date
          logAction({ actor: 'ai', type: 'event', title: `Создал событие «${ev.title}»`, detail: detailOf(ev) })
        } catch { /* skip the action that failed */ }
      }
      await syncFromGoogle()
      if (gFocus) setFocusSignal({ date: gFocus, n: Date.now() })
      return
    }
    let focusDate = null
    setEventsRaw(prev => {
      const next = [...prev]
      const logs = []
      for (const a of actions) {
        const inp = a.input || {}
        const ev = {
          type: inp.type || 'calendar', title: inp.title || 'Событие', date: inp.date || TODAY_KEY,
          start: inp.start || '09:00', end: inp.end || '10:00', who: inp.who || '', priority: inp.priority || 3
        }
        next.push(ev)
        focusDate = ev.date
        logs.push({ actor: 'ai', type: 'event', title: `Создал событие «${ev.title}»`, detail: detailOf(ev) })
      }
      queueMicrotask(() => {
        logs.forEach(l => logAction(l))
        if (focusDate) setFocusSignal({ date: focusDate, n: Date.now() })
      })
      return next
    })
  }

  // Actually carry out one confirmed action (move/delete) — the same logic that used to run
  // immediately, only now on a button press rather than automatically.
  async function runConfirmedAction(a) {
    const inp = a.input || {}
    if (googleConnected) {
      try {
        if (a.name === 'move_event') {
          const idx = findByTitle(events, inp.title)
          if (idx !== -1) {
            const cur = events[idx]
            const date = inp.new_date || cur.date, start = inp.new_start || cur.start, end = inp.new_end || cur.end
            await fetch('/api/calendar/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ googleId: cur.googleId, title: cur.title, date, start, end, who: cur.who }) })
            logAction({ actor: 'ai', type: 'event', title: `Перенёс «${cur.title}»`, detail: detailOf({ date, start, end }) })
            setFocusSignal({ date, n: Date.now() })
          }
        } else if (a.name === 'delete_event') {
          const idx = findByTitle(events, inp.title)
          if (idx !== -1) {
            const cur = events[idx]
            await fetch('/api/calendar/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ googleId: cur.googleId }) })
            logAction({ actor: 'ai', type: 'event', title: `Удалил «${cur.title}»`, detail: detailOf(cur) })
          }
        }
        await syncFromGoogle()
      } catch { /* skip the action that failed */ }
      return
    }
    setEventsRaw(prev => {
      let next = [...prev]
      let log = null, focusDate = null
      if (a.name === 'move_event') {
        const idx = findByTitle(next, inp.title)
        if (idx !== -1) {
          const ev = { ...next[idx] }
          if (inp.new_date) ev.date = inp.new_date
          if (inp.new_start) ev.start = inp.new_start
          if (inp.new_end) ev.end = inp.new_end
          next[idx] = ev
          focusDate = ev.date
          log = { actor: 'ai', type: 'event', title: `Перенёс «${ev.title}»`, detail: detailOf(ev) }
        }
      } else if (a.name === 'delete_event') {
        const idx = findByTitle(next, inp.title)
        if (idx !== -1) {
          const ev = next[idx]
          next = next.filter((_, k) => k !== idx)
          log = { actor: 'ai', type: 'event', title: `Удалил «${ev.title}»`, detail: detailOf(ev) }
        }
      }
      if (log) queueMicrotask(() => { logAction(log); if (focusDate) setFocusSignal({ date: focusDate, n: Date.now() }) })
      return next
    })
  }

  // Apply the actions the AI proposed. create goes through at once; move/delete are queued
  // for confirmation (we resolve the target event NOW so the dialog shows an exact snapshot).
  async function applyAiActions(actions) {
    if (!actions?.length) return
    const creates = actions.filter(a => a.name === 'create_event')
    const destructive = actions.filter(a => a.name === 'move_event' || a.name === 'delete_event')
    if (creates.length) await applyCreates(creates)
    if (destructive.length) {
      const withTarget = destructive
        .map(a => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: a.name, input: a.input, target: events[findByTitle(events, a.input?.title)] || null }))
        .filter(p => p.target)  // no event found — nothing to confirm, so we skip it silently as before
      if (withTarget.length) setPendingAiActions(prev => [...prev, ...withTarget])
    }
  }

  function confirmPendingAiAction(id) {
    const item = pendingAiActions.find(p => p.id === id)
    setPendingAiActions(prev => prev.filter(p => p.id !== id))
    if (item) runConfirmedAction(item)
  }
  function rejectPendingAiAction(id) {
    setPendingAiActions(prev => prev.filter(p => p.id !== id))
  }

  return (
    <EventsContext.Provider value={{
      events, setEvents, resetEvents, applyAiActions, removeEvent, upsertEvent, applyBulk,
      focusSignal, setFocusSignal, syncFromGoogle, googleConnected, googleNeedsReconnect,
      pendingAiActions, confirmPendingAiAction, rejectPendingAiAction
    }}>
      {children}
    </EventsContext.Provider>
  )
}

export function useEvents() {
  const ctx = useContext(EventsContext)
  if (!ctx) throw new Error('useEvents должен использоваться внутри EventsProvider')
  return ctx
}
