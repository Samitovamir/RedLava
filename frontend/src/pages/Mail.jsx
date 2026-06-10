import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import MailForm from '../components/MailForm.jsx'
import { Button, SectionHeader } from '../ui'
import { useT } from '../context/LanguageContext.jsx'

// Страница «Письма»: ручное написание и отправка email через Google.
// (ИИ тоже умеет готовить письма — они открываются в окне предпросмотра.)
export default function Mail() {
  const [sentTo, setSentTo] = useState(null)
  const [formKey, setFormKey] = useState(0)   // сброс полей формы для нового письма
  const t = useT({
    ru: {
      title: 'Письма',
      via: 'Email через Google',
      sent: 'Письмо отправлено',
      recipient: 'Получатель:',
      again: 'Написать ещё',
      hint: 'Напишите письмо сами или попросите помощника подготовить текст.',
      sendLabel: 'Отправить письмо',
    },
    en: {
      title: 'Mail',
      via: 'Email via Google',
      sent: 'Email sent',
      recipient: 'Recipient:',
      again: 'Write another',
      hint: 'Write the email yourself or ask the assistant to draft it.',
      sendLabel: 'Send email',
    },
  })

  return (
    <div className="mail-page">
      <SectionHeader title={t.title} subtitle={t.via} />

      <motion.div className="card mail-card"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        {sentTo ? (
          <div className="mail-done">
            <div className="mail-done-icon"><Check size={26} strokeWidth={2} /></div>
            <div className="mail-done-title">{t.sent}</div>
            <div className="mail-done-sub muted">{t.recipient} {sentTo}</div>
            <Button variant="primary" style={{ marginTop: 10 }}
              onClick={() => { setSentTo(null); setFormKey(k => k + 1) }}>{t.again}</Button>
          </div>
        ) : (
          <>
            <p className="mail-hint muted">{t.hint}</p>
            <MailForm key={formKey} onSent={(f) => setSentTo(f.to)} sendLabel={t.sendLabel} />
          </>
        )}
      </motion.div>

      <style>{`
        .mail-page { display: flex; flex-direction: column; gap: 24px; max-width: 640px; margin-inline: auto; padding-bottom: 20px; }
        .muted { color: var(--muted); }
        .mail-hint { font-size: 13.5px; line-height: 1.55; color: var(--text-faint); margin-bottom: 18px; }
        .mail-done { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 30px 0; text-align: center; }
        .mail-done-icon { width: 56px; height: 56px; border-radius: 50%; background: color-mix(in srgb, var(--status-ok) 15%, transparent); color: var(--status-ok); display: flex; align-items: center; justify-content: center; }
        .mail-done-title { font-size: 19px; font-weight: 700; color: var(--foreground); }
        .mail-done-sub { font-size: 14px; }
      `}</style>
    </div>
  )
}
