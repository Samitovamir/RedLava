import { ICONS } from './iconMap.js'

// Единая line-иконка. Использование:
//   <Icon name="lab-blood" color="var(--cat-lab-blood)" />   — по ключу из iconMap
//   <Icon icon={SomeLucide} size={20} />                     — прямой lucide-компонент
// Цвет по умолчанию наследуется (currentColor) — задаётся родителем или пропом color.
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
