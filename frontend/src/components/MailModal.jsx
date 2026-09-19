import { useState } from 'react'
import { Check } from 'lucide-react'
import { useMail } from '../context/MailContext.jsx'
import MailForm from './MailForm.jsx'
import { Modal } from '../ui'
import { useT } from '../context/LanguageContext.jsx'

/*
  Preview of an email the AI has drafted. Opens when the assistant calls send_email.
  The user checks or edits it and presses "Send" themselves.
  Rendered globally (in App); reacts to the draft in MailContext.
*/
export default function MailModal() {
  const { draft, closeDraft } = useMail()
  const [sent, setSent] = useState(false)
  const t = useT({
    ru: {
      badge: 'ИИ подготовил письмо',
      title: 'Проверьте и отправьте',
      sent: 'Письмо отправлено',
      send: 'Отправить',
    },
    en: {
      badge: 'AI drafted an email',
      title: 'Review and send',
      sent: 'Email sent',
      send: 'Send',
    },
  })

  function onSent() {
    setSent(true)
    setTimeout(() => { setSent(false); closeDraft() }, 1400)
  }
  function close() { setSent(false); closeDraft() }

  return (
    <Modal open={!!draft} onClose={close} size="md" badge={t.badge} title={t.title}>
      {sent ? (
        <div className="mm-sent"><Check size={20} strokeWidth={2} /> {t.sent}</div>
      ) : (
        draft && <MailForm initial={draft} onSent={onSent} onCancel={close} sendLabel={t.send} />
      )}

      <style>{`
        .mm-sent { display: flex; align-items: center; justify-content: center; gap: 8px; text-align: center; font-size: 17px; font-weight: 700; color: var(--status-ok); padding: 28px 0; }
      `}</style>
    </Modal>
  )
}
