import { createContext, useContext, useState, useEffect } from 'react'
import { useHistory } from './HistoryContext.jsx'
import { dayLabel } from '../utils/history.js'
import { mskNow } from '../utils/time.js'

// Локальный ключ даты YYYY-MM-DD (без сдвига часового пояса)
export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const TODAY_KEY = dateKey(mskNow())

// Расписание начинается пустым — события приходят из Google Календаря (демо убрано)
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

  // Сигнал «перейти к дате» — выставляется при действиях ИИ, чтобы расписание показало нужный день
  const [focusSignal, setFocusSignal] = useState(null)

  // Сохраняем при каждом изменении — общий источник для всех страниц
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)) } catch { /* ignore */ }
  }, [events])

  // Если подключён Google Календарь — подтягиваем реальные события (он источник истины)
  const [googleConnected, setGoogleConnected] = useState(false)
  function syncFromGoogle() {
    return fetch('/api/calendar/status')
      .then(r => r.json())
      .then(d => {
        setGoogleConnected(!!d.connected)
        if (!d.connected) { setEventsRaw([]); return null }  // не подключён → пустое расписание
        return fetch('/api/calendar/events').then(r => r.json())
      })
      .then(data => {
        if (data && Array.isArray(data.events)) setEventsRaw(data.events)
      })
      .catch(() => {})
  }
  useEffect(() => { syncFromGoogle() }, [])

  // Сравнить старое и новое расписание и записать действие пользователя в историю
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
      added.forEach(e => logAction({ actor: 'user', type: 'event', title: `Добавил событие «${e.title}»`, detail: detailOf(e) }))
    } else if (removed.length) {
      removed.forEach(e => logAction({ actor: 'user', type: 'event', title: `Удалил событие «${e.title}»`, detail: detailOf(e) }))
    } else if (moved.length === 1) {
      logAction({ actor: 'user', type: 'event', title: `Перенёс «${moved[0].title}»`, detail: detailOf(moved[0]) })
    } else if (moved.length > 1) {
      logAction({ actor: 'user', type: 'event', title: `Обновил расписание (${moved.length} событий)`, detail: 'Изменены времена нескольких событий.' })
    }
  }

  // Обёртка над setState: логирует изменения пользователя в историю
  function setEvents(next) {
    setEventsRaw(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next
      // логируем вне фазы рендера
      queueMicrotask(() => { try { diffAndLog(prev, resolved) } catch { /* ignore */ } })
      return resolved
    })
  }

  // Сброс без записи в историю
  const resetEvents = () => setEventsRaw(INITIAL_EVENTS)

  // ── Ручные операции расписания с учётом Google (он источник истины) ──
  // Если Google подключён, изменения уходят В КАЛЕНДАРЬ и затем пересинхронизируются,
  // иначе они стирались бы при следующей загрузке (баг: удалённое событие возвращалось).
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
  // Массовое применение (перенос нескольких / удаление набора) — для «Найди время»
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

  // Найти событие по неточному названию (для переноса/удаления голосом)
  const findByTitle = (list, title) => {
    if (!title) return -1
    const q = title.trim().toLowerCase()
    let i = list.findIndex(e => e.title.toLowerCase() === q)
    if (i === -1) i = list.findIndex(e => e.title.toLowerCase().includes(q) || q.includes(e.title.toLowerCase()))
    return i
  }

  // Применить действия, которые предложил ИИ (create/move/delete). Пишутся в Историю как 'ai'.
  async function applyAiActions(actions) {
    if (!actions?.length) return

    // Google подключён → выполняем изменения прямо в календаре, затем пересинхронизируем
    if (googleConnected) {
      let gFocus = null
      const gLogs = []
      for (const a of actions) {
        const inp = a.input || {}
        try {
          if (a.name === 'create_event') {
            const ev = { type: inp.type || 'calendar', title: inp.title || 'Событие', date: inp.date || TODAY_KEY, start: inp.start || '09:00', end: inp.end || '10:00', who: inp.who || '' }
            await fetch('/api/calendar/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) })
            gFocus = ev.date
            gLogs.push({ actor: 'ai', type: 'event', title: `Создал событие «${ev.title}»`, detail: detailOf(ev) })
          } else if (a.name === 'move_event') {
            const idx = findByTitle(events, inp.title)
            if (idx !== -1) {
              const cur = events[idx]
              const date = inp.new_date || cur.date, start = inp.new_start || cur.start, end = inp.new_end || cur.end
              await fetch('/api/calendar/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ googleId: cur.googleId, title: cur.title, date, start, end, who: cur.who }) })
              gFocus = date
              gLogs.push({ actor: 'ai', type: 'event', title: `Перенёс «${cur.title}»`, detail: detailOf({ date, start, end }) })
            }
          } else if (a.name === 'delete_event') {
            const idx = findByTitle(events, inp.title)
            if (idx !== -1) {
              const cur = events[idx]
              await fetch('/api/calendar/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ googleId: cur.googleId }) })
              gLogs.push({ actor: 'ai', type: 'event', title: `Удалил «${cur.title}»`, detail: detailOf(cur) })
            }
          }
        } catch { /* пропускаем неудачное действие */ }
      }
      await syncFromGoogle()
      gLogs.forEach(l => logAction(l))
      if (gFocus) setFocusSignal({ date: gFocus, n: Date.now() })
      return
    }

    let focusDate = null
    setEventsRaw(prev => {
      let next = [...prev]
      const logs = []
      for (const a of actions) {
        const inp = a.input || {}
        if (a.name === 'create_event') {
          const ev = {
            type: inp.type || 'calendar',
            title: inp.title || 'Событие',
            date: inp.date || TODAY_KEY,
            start: inp.start || '09:00',
            end: inp.end || '10:00',
            who: inp.who || '',
            priority: inp.priority || 3
          }
          next.push(ev)
          focusDate = ev.date
          logs.push({ actor: 'ai', type: 'event', title: `Создал событие «${ev.title}»`, detail: detailOf(ev) })
        } else if (a.name === 'move_event') {
          const idx = findByTitle(next, inp.title)
          if (idx !== -1) {
            const ev = { ...next[idx] }
            if (inp.new_date) ev.date = inp.new_date
            if (inp.new_start) ev.start = inp.new_start
            if (inp.new_end) ev.end = inp.new_end
            next[idx] = ev
            focusDate = ev.date
            logs.push({ actor: 'ai', type: 'event', title: `Перенёс «${ev.title}»`, detail: detailOf(ev) })
          }
        } else if (a.name === 'delete_event') {
          const idx = findByTitle(next, inp.title)
          if (idx !== -1) {
            const ev = next[idx]
            next = next.filter((_, k) => k !== idx)
            logs.push({ actor: 'ai', type: 'event', title: `Удалил «${ev.title}»`, detail: detailOf(ev) })
          }
        }
      }
      queueMicrotask(() => {
        logs.forEach(l => logAction(l))
        if (focusDate) setFocusSignal({ date: focusDate, n: Date.now() })
      })
      return next
    })
  }

  return (
    <EventsContext.Provider value={{ events, setEvents, resetEvents, applyAiActions, removeEvent, upsertEvent, applyBulk, focusSignal, syncFromGoogle, googleConnected }}>
      {children}
    </EventsContext.Provider>
  )
}

export function useEvents() {
  const ctx = useContext(EventsContext)
  if (!ctx) throw new Error('useEvents должен использоваться внутри EventsProvider')
  return ctx
}
