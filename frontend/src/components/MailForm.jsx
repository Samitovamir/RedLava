import { useState } from 'react'
import MicButton from './MicButton.jsx'
import { useMail } from '../context/MailContext.jsx'

const validEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((s || '').trim())

/*
  Форма письма: кому / тема / текст + кнопка отправки.
  Используется и на странице «Письма», и в окне предпросмотра письма от ИИ.
  props: initial {to,subject,body}, onSent(fields), onCancel, sendLabel
*/
export default function MailForm({ initial, onSent, onCancel, sendLabel = 'Отправить' }) {
  const { sendMail, connected } = useMail()
  const [to, setTo] = useState(initial?.to || '')
  const [subject, setSubject] = useState(initial?.subject || '')
  const [body, setBody] = useState(initial?.body || '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError('')
    if (!validEmail(to)) { setError('Укажите корректный email получателя, например ivan@mail.ru'); return }
    if (!body.trim()) { setError('Добавьте текст письма.'); return }
    setSending(true)
    const r = await sendMail({ to: to.trim(), subject: subject.trim(), body })
    setSending(false)
    if (r.ok) onSent?.({ to: to.trim(), subject: subject.trim(), body })
    else setError(r.message || 'Не удалось отправить письмо.')
  }

  return (
    <div className="mail-form">
      {!connected && (
        <div className="mail-warn">Google не подключён — отправка не сработает. Подключите Google в разделе «Подключения».</div>
      )}
      <label className="mail-field">
        <span className="mail-label">Кому</span>
        <input className="mail-input" type="email" placeholder="ivan@mail.ru" value={to}
          onChange={e => setTo(e.target.value)} />
      </label>
      <label className="mail-field">
        <span className="mail-label">Тема</span>
        <input className="mail-input" placeholder="Например: Встреча в пятницу" value={subject}
          onChange={e => setSubject(e.target.value)} />
      </label>
      <label className="mail-field">
        <span className="mail-label">Текст</span>
        <div className="mail-body-wrap">
          <textarea className="mail-textarea" rows={7} placeholder="Напишите письмо…" value={body}
            onChange={e => setBody(e.target.value)} />
          <div className="mail-mic"><MicButton primary onText={t => setBody(prev => (prev ? prev.trim() + ' ' : '') + t)} /></div>
        </div>
      </label>

      {error && <div className="mail-error">{error}</div>}

      <div className="mail-actions">
        {onCancel && <button className="mail-btn ghost" onClick={onCancel} disabled={sending}>Отмена</button>}
        <button className="mail-btn primary" onClick={submit} disabled={sending}>
          {sending ? 'Отправляю…' : sendLabel}
        </button>
      </div>

      <style>{`
        .mail-form { display: flex; flex-direction: column; gap: 14px; }
        .mail-warn { font-size: 13px; color: var(--orange); background: rgba(249,115,22,0.1); border: 1px solid var(--orange); border-radius: 12px; padding: 10px 12px; }
        .mail-field { display: flex; flex-direction: column; gap: 6px; }
        .mail-label { font-size: 13px; font-weight: 600; color: var(--muted); }
        .mail-input, .mail-textarea {
          width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px;
          padding: 12px 14px; font-family: inherit; font-size: 15px; color: var(--foreground); outline: none; transition: border-color .15s;
        }
        .mail-input:focus, .mail-textarea:focus { border-color: var(--accent); }
        .mail-input::placeholder, .mail-textarea::placeholder { color: var(--muted); }
        .mail-textarea { resize: vertical; line-height: 1.6; min-height: 130px; }
        .mail-body-wrap { position: relative; }
        .mail-mic { position: absolute; right: 10px; bottom: 10px; }
        .mail-error { font-size: 13.5px; color: var(--red); }
        .mail-actions { display: flex; justify-content: flex-end; gap: 10px; }
        .mail-btn { padding: 12px 20px; border-radius: 12px; border: none; font-family: inherit; font-size: 14.5px; font-weight: 700; cursor: pointer; transition: opacity .15s; }
        .mail-btn.primary { background: var(--accent); color: var(--accent-foreground); }
        .mail-btn.primary:hover:not(:disabled) { opacity: .9; }
        .mail-btn.ghost { background: transparent; border: 1px solid var(--border); color: var(--muted); }
        .mail-btn.ghost:hover:not(:disabled) { color: var(--foreground); }
        .mail-btn:disabled { opacity: .5; cursor: default; }
      `}</style>
    </div>
  )
}
