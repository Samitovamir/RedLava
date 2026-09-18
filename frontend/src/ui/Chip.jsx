// A chip/tag/filter. active is the selected state; color is the indicator dot's color
// (usually categoryColor(key)); passing onClick turns it into a button.
export default function Chip({
  active = false, color, dot = false, onClick, as, className = '', children, ...rest
}) {
  const isButton = !!onClick || as === 'button'
  const Tag = isButton ? 'button' : 'span'
  const cls = [
    'ds-chip',
    isButton && 'ds-chip--button',
    active && 'ds-chip--active',
    className,
  ].filter(Boolean).join(' ')
  return (
    <Tag className={cls} onClick={onClick} type={isButton ? 'button' : undefined} {...rest}>
      {(dot || color) && <span className="ds-chip__dot" style={{ background: color || 'var(--text-muted)' }} />}
      {children}
    </Tag>
  )
}
