import { createContext, useContext, useState, useEffect, useCallback } from 'react'

// The assistant's long-term memory: facts and preferences about the user that live on
// between sessions and are mixed into every AI context. Added to by hand or by the AI
// itself (the remember_fact tool).

const STORAGE_KEY = 'albert-memory'
// Memory starts out empty — it fills with real facts about the person (the demo data is gone)
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

  // Updating memory: drop the outdated fact (old) and, if one is supplied, add the new one (new).
  // We match "old" loosely (exactly, or an overlap of ≥6 characters) to catch the AI's own wording.
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
