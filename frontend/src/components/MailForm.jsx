import { useState, useRef, useEffect } from 'react'
import MicButton from './MicButton.jsx'
import { Button, Field } from '../ui'
import { useMail } from '../context/MailContext.jsx'
import { useT } from '../context/LanguageContext.jsx'

const validEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((s || '').trim())

/*
  Форма письма: кому / тема / текст + кнопка отправки.
  Используется и на странице «Письма», и в окне предпросмотра письма от ИИ.
  props: initial {to,subject,body}, onSent(fields), onCancel, sendLabel
*/
export default function MailForm({ initial, onSent, onCancel, sendLabel }) {
  const { sendMail, connected } = useMail()
  const t = useT({
    ru: {
      send: 'Отправить',
      notConnected: 'Google не подключён — отправка не сработает. Подключите Google в разделе «Подключения».',
      to: 'Кому',
      toHint: 'Email получателя, например ivan@mail.ru',
      subject: 'Тема',
      subjectPlaceholder: 'Например: Встреча в пятницу',
      bodyLabel: 'Текст',
      bodyPlaceholder: 'Напишите письмо…',
      bodyHint: 'Можно надиктовать голосом — кнопка микрофона в углу.',
      cancel: 'Отмена',
      sending: 'Отправляю…',
      errEmail: 'Укажите корректный email получателя, например ivan@mail.ru',
      errBody: 'Добавьте текст письма.',
      errSend: 'Не удалось отправить письмо.',
    },
    en: {
      send: 'Send',
      notConnected: 'Google is not connected — sending won’t work. Connect Google in the “Connections” section.',
      to: 'To',
      toHint: 'Recipient email, for example ivan@mail.ru',
      subject: 'Subject',
      subjectPlaceholder: 'For example: Meeting on Friday',
      bodyLabel: 'Body',
      bodyPlaceholder: 'Write your email…',
      bodyHint: 'You can dictate by voice — the mic button is in the corner.',
      cancel: 'Cancel',
      sending: 'Sending…',
      errEmail: 'Enter a valid recipient email, for example ivan@mail.ru',
      errBody: 'Add the email text.',
      errSend: 'Couldn’t send the email.',
    },
  })
  const [to, setTo] = useState(initial?.to || '')
  const [subject, setSubject] = useState(initial?.subject || '')
  const [body, setBody] = useState(initial?.body || '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bodyRef = useRef(null)

  // Авто-рост textarea по содержимому (resize отключён вручную, чтобы микрофон не налезал на уголок).
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(el.scrollHeight, 150) + 'px'
  }, [body])

  // Честное disabled: «Отправить» неактивна, пока не заполнены Кому + Текст.
  const canSend = validEmail(to) && body.trim().length > 0

  async function submit() {
    setError('')
    if (!validEmail(to)) { setError(t.errEmail); return }
    if (!body.trim()) { setError(t.errBody); return }
    setSending(true)
    const r = await sendMail({ to: to.trim(), subject: subject.trim(), body })
    setSending(false)
    if (r.ok) onSent?.({ to: to.trim(), subject: subject.trim(), body })
    else setError(r.message || t.errSend)
  }

  return (
    <div className="mail-form">
      {!connected && (
        <div className="mail-warn">{t.notConnected}</div>
      )}
      <Field label={t.to} type="email" placeholder="ivan@mail.ru" value={to}
        hint={t.toHint} onChange={e => setTo(e.target.value)} />
      <Field label={t.subject} placeholder={t.subjectPlaceholder} value={subject}
        onChange={e => setSubject(e.target.value)} />
      <label className="ds-field">
        <span className="ds-field__label">{t.bodyLabel}</span>
        <div className="mail-body-wrap">
          <textarea ref={bodyRef} className="ds-input mail-textarea" rows={6} placeholder={t.bodyPlaceholder} value={body}
            onChange={e => setBody(e.target.value)} />
          <div className="mail-mic"><MicButton primary onText={t => setBody(prev => (prev ? prev.trim() + ' ' : '') + t)} /></div>
        </div>
        <span className="mail-body-hint">{t.bodyHint}</span>
      </label>

      {error && <div className="mail-error">{error}</div>}

      <div className="mail-actions">
        {onCancel && <Button variant="ghost" onClick={onCancel} disabled={sending}>{t.cancel}</Button>}
        <Button variant="primary" size="lg" onClick={submit} disabled={sending || !canSend}>
          {sending ? t.sending : (sendLabel || t.send)}
        </Button>
      </div>

      <style>{`
        .mail-form { display: flex; flex-direction: column; gap: 14px; max-width: 640px; width: 100%; margin-inline: auto; }
        .mail-warn { font-size: 13px; color: var(--status-warn); background: color-mix(in srgb, var(--status-warn) 12%, transparent); border: 1px solid var(--status-warn); border-radius: 12px; padding: 10px 12px; margin-bottom: 14px; }
        .mail-body-hint { font-size: 12px; color: var(--text-faint); }
        .mail-textarea {
          resize: none; line-height: 1.6; min-height: 150px; overflow: hidden;
          padding-bottom: 48px; /* место под микрофон, чтобы текст не уезжал под него */
        }
        .mail-textarea::-webkit-resizer { display: none; }
        .mail-body-wrap { position: relative; }
        .mail-mic { position: absolute; right: 10px; bottom: 10px; }
        .mail-error { font-size: 13.5px; color: var(--status-crit); }
        .mail-actions { display: flex; justify-content: flex-end; gap: 10px; }
        @media (max-width: 640px) {
          .mail-actions { flex-direction: column-reverse; }
          .mail-actions .ds-btn { width: 100%; min-height: 44px; }
        }
      `}</style>
    </div>
  )
}
