// Тонкая обёртка над существующим .card / .anchor-card (кожаная поверхность + прошивка).
// anchor — крупная панель-якорь; className — для специфики экрана.
export default function Card({ as: Tag = 'div', anchor = false, className = '', children, ...rest }) {
  const cls = [anchor ? 'anchor-card' : 'card', className].filter(Boolean).join(' ')
  return <Tag className={cls} {...rest}>{children}</Tag>
}
