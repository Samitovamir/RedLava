import { useState, useEffect, useCallback } from 'react'

// A simple stable string hash (used for the cache key)
function hash(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/*
  Generating an AI summary, with a cache.
  - id: the namespace (for example, 'daysummary')
  - context: the system context carrying the data — it is part of the cache key,
    so the text is regenerated whenever the data changes
  - message: the request to the AI itself
  - fallback: placeholder text for when the backend or the key is unavailable (NOT cached)

  Returns { text, loading, source, refresh }.
  source: 'ai' | 'cache' | 'fallback'
*/
export function useAiSummary({ id, context, message, fallback, snapshot, manual = false }) {
  // The snapshot is part of the cache key so the summary regenerates when the data changes,
  // but it is sent as a separate field — the backend caches it as a shared block (saving tokens).
  // v2: bumping the cache version invalidates the old values, including the stuck
  // "too many requests" stubs that the previous code mistakenly cached as answers.
  const cacheKey = `ai-sum:v2:${id}:${hash(context + '|' + (snapshot || ''))}`
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(!manual)   // manual → we don't load on our own, we wait for the button
  const [source, setSource] = useState('cache')

  const load = useCallback((force) => {
    let cancelled = false
    if (!force) {
      const stored = localStorage.getItem(cacheKey)
      if (stored) { setText(stored); setSource('cache'); setLoading(false); return () => {} }
    }
    setLoading(true)
    fetch('/api/ai/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, context, snapshot })
    })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        // d.limited === true → this is the circuit breaker's stub (a limit or throttling), NOT an
        // AI answer. We neither cache nor show it — we return the fallback so the panel isn't stuck on it.
        if (d?.reply && !d.limited) {
          localStorage.setItem(cacheKey, d.reply)
          setText(d.reply); setSource('ai')
        } else {
          setText(fallback); setSource('fallback')
        }
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setText(fallback); setSource('fallback'); setLoading(false)
      })
    return () => { cancelled = true }
  }, [cacheKey, context, message, fallback, snapshot])

  useEffect(() => {
    if (manual) return            // manual mode — no auto-loading (we don't dump anything on the user)
    const cleanup = load(false)
    return cleanup
  }, [load, manual])

  // Run on demand: uses the cache if there is one (free), otherwise calls the AI
  const run = useCallback(() => load(false), [load])

  const refresh = useCallback(() => {
    localStorage.removeItem(cacheKey)
    load(true)
  }, [cacheKey, load])

  return { text, loading, source, refresh, run }
}
