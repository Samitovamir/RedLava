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
export function useAiSummary({ id, context, message, fallback, snapshot, manual = false }) {
  // Снимок входит в ключ кэша, чтобы сводка перегенерировалась при изменении данных,
  // но передаётся отдельным полем — на бэкенде он кэшируется как общий блок (экономия токенов).
  // v2: бамп версии кэша инвалидирует старые значения — в т.ч. залипшие заглушки
  // «слишком много запросов», которые прежний код по ошибке кэшировал как ответ.
  const cacheKey = `ai-sum:v2:${id}:${hash(context + '|' + (snapshot || ''))}`
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(!manual)   // manual → не грузим сами, ждём кнопку
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
        // d.limited === true → это заглушка предохранителя (лимит/троттлинг), а НЕ ответ ИИ.
        // Такую НЕ кэшируем и не показываем — отдаём fallback, чтобы окно не залипало на ней.
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
    if (manual) return            // ручной режим — без авто-загрузки (ничего не вываливаем сами)
    const cleanup = load(false)
    return cleanup
  }, [load, manual])

  // Запустить по требованию: берёт кэш, если есть (бесплатно), иначе запрос к ИИ
  const run = useCallback(() => load(false), [load])

  const refresh = useCallback(() => {
    localStorage.removeItem(cacheKey)
    load(true)
  }, [cacheKey, load])

  return { text, loading, source, refresh, run }
}
