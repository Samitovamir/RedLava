import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { INITIAL_HISTORY, nowStamp, buildGuestHistory } from '../utils/history.js'
import { isGuest } from '../api/authFetch.js'

const STORAGE_KEY = 'albert-history'
// Version of the guest's demo log. Bump it whenever buildGuestHistory() changes, so that a
// returning guest's stale demo log is replaced with a fresh one (for example, so the English
// titleEn/detailEn fields show up).
const GUEST_HIST_VER = '2'
const GUEST_HIST_VER_KEY = 'albert-hist-demo-ver'
const HistoryContext = createContext(null)

export function HistoryProvider({ children }) {
  const [entries, setEntries] = useState(() => {
    try {
      // Guest: if the demo log's version is stale, re-seed it with a fresh demo.
      // Guests only — a real user's log is left alone.
      if (isGuest()) {
        const storedVer = localStorage.getItem(GUEST_HIST_VER_KEY)
        if (storedVer !== GUEST_HIST_VER) {
          const fresh = buildGuestHistory()
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
            localStorage.setItem(GUEST_HIST_VER_KEY, GUEST_HIST_VER)
          } catch { /* ignore */ }
          return fresh
        }
      }
      const saved = localStorage.getItem(STORAGE_KEY)
      const parsed = saved ? JSON.parse(saved) : null
      // A guest with no entries — fill in the demo log so the section is not empty.
      if (Array.isArray(parsed) && parsed.length) return parsed
      return isGuest() ? buildGuestHistory() : INITIAL_HISTORY
    } catch {
      return isGuest() ? buildGuestHistory() : INITIAL_HISTORY
    }
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) } catch { /* ignore */ }
  }, [entries])

  // Record an action. actor: 'ai' | 'user' (defaults to 'user')
  const logAction = useCallback((action) => {
    setEntries(prev => [
      {
        id: Date.now() + Math.random(),
        actor: action.actor || 'user',
        type: action.type || 'task',
        status: action.status || 'done',
        datetime: action.datetime || nowStamp(),
        title: action.title || 'Действие',
        detail: action.detail || ''
      },
      ...prev
    ])
  }, [])

  const resetHistory = useCallback(() => setEntries(INITIAL_HISTORY), [])

  return (
    <HistoryContext.Provider value={{ entries, logAction, resetHistory }}>
      {children}
    </HistoryContext.Provider>
  )
}

export function useHistory() {
  const ctx = useContext(HistoryContext)
  if (!ctx) throw new Error('useHistory должен использоваться внутри HistoryProvider')
  return ctx
}
