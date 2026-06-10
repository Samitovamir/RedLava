// Поле ввода с подписью. type: text|email|number|date|time|textarea.
// Прочие props (value, onChange, placeholder, rows…) пробрасываются на input/textarea.
export default function Field({ label, type = 'text', error, hint, className = '', children, ...rest }) {
  const isArea = type === 'textarea'
  return (
    <label className={['ds-field', className].filter(Boolean).join(' ')}>
      {label && <span className="ds-field__label">{label}</span>}
      {isArea
        ? <textarea className="ds-input" {...rest} />
        : <input className="ds-input" type={type} {...rest} />}
      {children}
      {hint && !error && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{hint}</span>}
      {error && <span style={{ fontSize: 12.5, color: 'var(--status-crit)' }}>{error}</span>}
    </label>
  )
}
