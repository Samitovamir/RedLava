import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { INITIAL_HISTORY, nowStamp, buildGuestHistory } from '../utils/history.js'
import { isGuest } from '../api/authFetch.js'

const STORAGE_KEY = 'albert-history'
const HistoryContext = createContext(null)

export function HistoryProvider({ children }) {
  const [entries, setEntries] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      const parsed = saved ? JSON.parse(saved) : null
      // Гость без записей — наполняем демо-журналом, чтобы раздел не был пустым.
      if (Array.isArray(parsed) && parsed.length) return parsed
      return isGuest() ? buildGuestHistory() : INITIAL_HISTORY
    } catch {
      return isGuest() ? buildGuestHistory() : INITIAL_HISTORY
    }
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) } catch { /* ignore */ }
  }, [entries])

  // Записать действие. actor: 'ai' | 'user' (по умолчанию 'user')
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
