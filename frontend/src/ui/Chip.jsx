// Чип/тег/фильтр. active — выбранное состояние; color — цвет точки-индикатора
// (обычно categoryColor(key)); onClick делает его кнопкой.
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
