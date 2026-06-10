// Пилюля статуса. status: ok | warn | crit | unknown. dot — точка-индикатор.
export default function StatusPill({ status = 'unknown', dot = true, className = '', children, ...rest }) {
  const cls = ['ds-pill', status !== 'unknown' && `ds-pill--${status}`, className].filter(Boolean).join(' ')
  return (
    <span className={cls} {...rest}>
      {dot && <span className="ds-pill__dot" />}
      {children}
    </span>
  )
}
