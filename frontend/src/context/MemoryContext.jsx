import { createContext, useContext, useState, useEffect, useCallback } from 'react'

// Долгая память ассистента: факты и предпочтения пользователя, которые живут между
// сессиями и подмешиваются во все контексты ИИ. Пополняется вручную или самим ИИ
// (инструмент remember_fact).

const STORAGE_KEY = 'albert-memory'
// Память начинается пустой — наполняется реальными фактами о человеке (демо убрано)
const SEED = []

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

  // Обновление памяти: убрать устаревший факт (old) и при наличии добавить новый (new).
  // Совпадение «old» ищем мягко (точное или перекличка ≥6 символов), чтобы ловить формулировку ИИ.
  const updateFact = useCallback((oldText, newText) => {
    const o = (oldText || '').trim().toLowerCase()
    const nt = (newText || '').trim()
    setFacts(f => {
      let next = f
      if (o) {
        next = f.filter(x => {
          const xt = x.text.toLowerCase()
          const match = xt === o || (o.length >= 6 && (xt.includes(o) || o.includes(xt)))
          return !match
        })
      }
      if (nt && !next.some(x => x.text.toLowerCase() === nt.toLowerCase())) {
        next = [...next, { id: Date.now() + Math.random(), text: nt }]
      }
      return next
    })
  }, [])

  return (
    <MemoryContext.Provider value={{ facts, addFact, removeFact, updateFact }}>
      {children}
    </MemoryContext.Provider>
  )
}

export function useMemoryFacts() {
  const ctx = useContext(MemoryContext)
  if (!ctx) throw new Error('useMemoryFacts должен использоваться внутри MemoryProvider')
  return ctx
}
