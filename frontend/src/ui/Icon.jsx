import { ICONS } from './iconMap.js'

// The one line icon. Usage:
//   <Icon name="lab-blood" color="var(--cat-lab-blood)" />   — by key from iconMap
//   <Icon icon={SomeLucide} size={20} />                     — a lucide component directly
// The color is inherited by default (currentColor) — set by the parent or the color prop.
export default function Icon({ name, icon, size = 18, strokeWidth = 1.7, color, className = '', style, ...rest }) {
  const Cmp = icon || (name ? ICONS[name] : null)
  if (!Cmp) return null
  return (
    <Cmp
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      style={color ? { color, ...style } : style}
      aria-hidden="true"
      {...rest}
    />
  )
}
