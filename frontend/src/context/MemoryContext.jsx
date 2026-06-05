import { createContext, useContext, useState, useEffect, useCallback } from 'react'

// Долгая память ассистента: факты и предпочтения владельца, которые живут между
// сессиями и подмешиваются во все контексты ИИ. Пополняется вручную или самим ИИ
// (инструмент remember_fact).

const STORAGE_KEY = 'albert-memory'
const SEED = [
  { id: 1, text: 'Не планировать дела после 21:00' },
  { id: 2, text: 'Предпочитает тренировки вечером' }
]

const MemoryContext = createContext(null)

export function MemoryProvider({ children }) {
  const [facts, setFacts] = useState(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY)
      return s ? JSON.parse(s) : SEED
    } catch {
      return SEED
    }
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(facts)) } catch { /* ignore */ }
  }, [facts])

  const addFact = useCallback((text) => {
    const t = (text || '').trim()
    if (!t) return
    setFacts(f => (f.some(x => x.text.toLowerCase() === t.toLowerCase()) ? f : [...f, { id: Date.now() + Math.random(), text: t }]))
  }, [])

  const removeFact = useCallback((id) => setFacts(f => f.filter(x => x.id !== id)), [])

  return (
    <MemoryContext.Provider value={{ facts, addFact, removeFact }}>
      {children}
    </MemoryContext.Provider>
  )
}

export function useMemoryFacts() {
  const ctx = useContext(MemoryContext)
  if (!ctx) throw new Error('useMemoryFacts должен использоваться внутри MemoryProvider')
  return ctx
}
