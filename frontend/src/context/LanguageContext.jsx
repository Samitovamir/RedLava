import { createContext, useContext, useState, useCallback, useEffect } from 'react'

// UI language: 'en' | 'ru'. Persisted in localStorage; on first visit we follow the
// browser locale (Russian-speaking users get Russian, everyone else English).
// Components keep their own strings: const STR = { en:{...}, ru:{...} }; const t = useT(STR)
const LanguageContext = createContext(null)
const KEY = 'redlava-lang'

const browserPrefersRu = () => {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
    return langs.some(l => String(l).toLowerCase().startsWith('ru'))
  } catch { return false }
}

const initial = () => {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'ru' || saved === 'en') return saved
    return browserPrefersRu() ? 'ru' : 'en'
  } catch { return 'en' }
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(initial)
  const setLang = useCallback((l) => {
    const v = l === 'en' ? 'en' : 'ru'
    setLangState(v)
    try { localStorage.setItem(KEY, v) } catch { /* ignore */ }
  }, [])
  const toggle = useCallback(() => setLangState(prev => {
    const v = prev === 'ru' ? 'en' : 'ru'
    try { localStorage.setItem(KEY, v) } catch { /* ignore */ }
    return v
  }), [])
  useEffect(() => { try { document.documentElement.lang = lang } catch { /* ignore */ } }, [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggle }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLang = () => useContext(LanguageContext)

// Returns the matching half of a component's dictionary.
// Falls back to English, then Russian, so a partially translated component still renders.
export function useT(dict) {
  const { lang } = useLang()
  return (dict && dict[lang]) || (dict && dict.en) || (dict && dict.ru) || {}
}
