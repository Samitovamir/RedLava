import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMail } from '../context/MailContext.jsx'
import MailForm from './MailForm.jsx'
import { useT } from '../context/LanguageContext.jsx'

/*
  Окно предпросмотра письма, подготовленного ИИ. Открывается, когда ассистент
  вызвал send_email. Пользователь проверяет/правит и сам нажимает «Отправить».
  Рендерится глобально (в App) — реагирует на draft из MailContext.
*/
export default function MailModal() {
  const { draft, closeDraft } = useMail()
  const [sent, setSent] = useState(false)
  const t = useT({
    ru: {
      badge: 'ИИ подготовил письмо',
      title: 'Проверьте и отправьте',
      close: 'Закрыть',
      sent: '✓ Письмо отправлено',
      send: 'Отправить',
    },
    en: {
      badge: 'AI drafted an email',
      title: 'Review and send',
      close: 'Close',
      sent: '✓ Email sent',
      send: 'Send',
    },
  })

  function onSent() {
    setSent(true)
    setTimeout(() => { setSent(false); closeDraft() }, 1400)
  }
  function close() { setSent(false); closeDraft() }

  return (
    <AnimatePresence>
      {draft && (
        <motion.div className="mm-backdrop" onClick={close}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="card mm-modal" onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
            <div className="mm-head">
              <div>
                <span className="mm-badge">{t.badge}</span>
                <h2 className="mm-title">{t.title}</h2>
              </div>
              <button className="mm-close" onClick={close} aria-label={t.close}>×</button>
            </div>

            {sent ? (
              <div className="mm-sent">{t.sent}</div>
            ) : (
              <MailForm initial={draft} onSent={onSent} onCancel={close} sendLabel={t.send} />
            )}
          </motion.div>

          <style>{`
            .mm-backdrop { position: fixed; inset: 0; z-index: 900; background: rgba(0,0,0,0.55); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 24px; }
            .mm-modal { width: 100%; max-width: 540px; max-height: 88vh; overflow-y: auto; display: flex; flex-direction: column; gap: 18px; padding: 26px; }
            .mm-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
            .mm-badge { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; color: var(--accent-foreground); background: var(--accent); padding: 4px 9px; border-radius: 7px; text-transform: uppercase; }
            .mm-title { font-size: 21px; font-weight: 800; color: var(--foreground); margin-top: 8px; }
            .mm-close { background: transparent; border: none; color: var(--muted); font-size: 26px; line-height: 1; cursor: pointer; padding: 0 4px; }
            .mm-close:hover { color: var(--foreground); }
            .mm-sent { text-align: center; font-size: 17px; font-weight: 700; color: var(--green); padding: 28px 0; }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
