import Icon from './Icon.jsx'

// The single button component. variant: primary | ghost | subtle | danger | success.
// size: sm | md | lg. shape="icon" — a square icon-only button.
// iconLeft/iconRight — either an iconMap key string OR a lucide component.
const renderIcon = (i, size) =>
  i ? <Icon name={typeof i === 'string' ? i : undefined} icon={typeof i !== 'string' ? i : undefined} size={size} /> : null

export default function Button({
  variant = 'subtle', size = 'md', shape, iconLeft, iconRight,
  loading = false, disabled = false, className = '', children, ...rest
}) {
  const cls = [
    'ds-btn', `ds-btn--${variant}`,
    size !== 'md' && `ds-btn--${size}`,
    shape === 'icon' && 'ds-btn--icon',
    className,
  ].filter(Boolean).join(' ')
  const isz = size === 'sm' ? 15 : 17
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {renderIcon(iconLeft, isz)}
      {children}
      {renderIcon(iconRight, isz)}
    </button>
  )
}
