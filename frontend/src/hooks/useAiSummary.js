import { useState, useEffect, useCallback } from 'react'

// Простой стабильный хэш строки (для ключа кэша)
function hash(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/*
  Генерация ИИ-сводки с кэшем.
  - id: пространство имён (например, 'daysummary')
  - context: системный контекст с данными — входит в ключ кэша,
    поэтому при изменении данных текст перегенерируется
  - message: сам запрос к ИИ
  - fallback: текст-заглушка, если backend/ключ недоступны (НЕ кэшируется)

  Возвращает { text, loading, source, refresh }.
  source: 'ai' | 'cache' | 'fallback'
*/
export function useAiSummary({ id, context, message, fallback, snapshot }) {
  // Снимок входит в ключ кэша, чтобы сводка перегенерировалась при изменении данных,
  // но передаётся отдельным полем — на бэкенде он кэшируется как общий блок (экономия токенов).
  const cacheKey = `ai-sum:${id}:${hash(context + '|' + (snapshot || ''))}`
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
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
        if (d?.reply) {
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
    const cleanup = load(false)
    return cleanup
  }, [load])

  const refresh = useCallback(() => {
    localStorage.removeItem(cacheKey)
    load(true)
  }, [cacheKey, load])

  return { text, loading, source, refresh }
}
