import { createContext, useContext, useState, useCallback, useEffect } from 'react'

// Язык интерфейса: 'ru' | 'en'. Хранится в localStorage, по умолчанию русский.
// Компоненты держат свои строки локально: const STR = { ru:{...}, en:{...} }; const t = useT(STR)
const LanguageContext = createContext(null)
const KEY = 'albert-lang'

const initial = () => { try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'ru' } catch { return 'ru' } }

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

// Удобный хук: отдаёт нужную половину словаря компонента (с фолбэком на русский).
export function useT(dict) {
  const { lang } = useLang()
  return (dict && dict[lang]) || (dict && dict.ru) || {}
}
