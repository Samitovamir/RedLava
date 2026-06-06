import { useState } from 'react'
import { motion } from 'framer-motion'
import MailForm from '../components/MailForm.jsx'

// Страница «Письма»: ручное написание и отправка email через Google.
// (ИИ тоже умеет готовить письма — они открываются в окне предпросмотра.)
export default function Mail() {
  const [sentTo, setSentTo] = useState(null)
  const [formKey, setFormKey] = useState(0)   // сброс полей формы для нового письма

  return (
    <div className="mail-page">
      <div className="page-header">
        <h2>Письма</h2>
        <span className="muted">Email через Google</span>
      </div>

      <motion.div className="card mail-card"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        {sentTo ? (
          <div className="mail-done">
            <div className="mail-done-icon">✓</div>
            <div className="mail-done-title">Письмо отправлено</div>
            <div className="mail-done-sub muted">Получатель: {sentTo}</div>
            <button className="mail-done-btn" onClick={() => { setSentTo(null); setFormKey(k => k + 1) }}>Написать ещё</button>
          </div>
        ) : (
          <>
            <p className="mail-hint muted">Можно написать письмо здесь, а можно просто попросить помощника: «напиши контакту, что заберу абонемент завтра» — он подготовит текст, а вы проверите и отправите.</p>
            <MailForm key={formKey} onSent={(f) => setSentTo(f.to)} sendLabel="Отправить письмо" />
          </>
        )}
      </motion.div>

      <style>{`
        .mail-page { display: flex; flex-direction: column; gap: 24px; max-width: 720px; padding-bottom: 20px; }
        .page-header { display: flex; align-items: baseline; gap: 12px; }
        .page-header h2 { font-size: 24px; font-weight: 700; }
        .muted { color: var(--muted); }
        .mail-card { display: flex; flex-direction: column; gap: 16px; }
        .mail-hint { font-size: 14px; line-height: 1.6; }
        .mail-done { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 30px 0; text-align: center; }
        .mail-done-icon { width: 56px; height: 56px; border-radius: 50%; background: rgba(34,197,94,0.15); color: var(--green); font-size: 28px; display: flex; align-items: center; justify-content: center; }
        .mail-done-title { font-size: 19px; font-weight: 700; color: var(--foreground); }
        .mail-done-sub { font-size: 14px; }
        .mail-done-btn { margin-top: 10px; padding: 11px 20px; border-radius: 12px; border: none; background: var(--accent); color: var(--accent-foreground); font-family: inherit; font-size: 14.5px; font-weight: 700; cursor: pointer; }
        .mail-done-btn:hover { opacity: .9; }
      `}</style>
    </div>
  )
}
