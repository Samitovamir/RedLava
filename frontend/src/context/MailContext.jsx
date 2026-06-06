import { createContext, useContext, useState, useEffect, useCallback } from 'react'

// Почта: общий черновик (для предпросмотра письма, подготовленного ИИ) + отправка через бэкенд.
// Письмо уходит ТОЛЬКО после явного подтверждения пользователем.
const MailContext = createContext(null)

export function MailProvider({ children }) {
  const [draft, setDraft] = useState(null)        // { to, subject, body } | null
  const [connected, setConnected] = useState(true)

  const refreshStatus = useCallback(() => {
    fetch('/api/gmail/status').then(r => r.json()).then(d => setConnected(!!d.connected)).catch(() => {})
  }, [])
  useEffect(() => { refreshStatus() }, [refreshStatus])

  const openDraft = useCallback((d) => setDraft({ to: d?.to || '', subject: d?.subject || '', body: d?.body || '' }), [])
  const closeDraft = useCallback(() => setDraft(null), [])

  async function sendMail(fields) {
    try {
      const res = await fetch('/api/gmail/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields)
      })
      return await res.json()
    } catch {
      return { ok: false, message: 'Нет связи с сервером.' }
    }
  }

  return (
    <MailContext.Provider value={{ draft, openDraft, closeDraft, sendMail, connected, refreshStatus }}>
      {children}
    </MailContext.Provider>
  )
}

export const useMail = () => useContext(MailContext)
