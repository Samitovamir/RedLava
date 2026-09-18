// A thin wrapper over the existing .card / .anchor-card (leather surface + stitching).
// anchor — the large anchor panel; className — for anything specific to a screen.
export default function Card({ as: Tag = 'div', anchor = false, className = '', children, ...rest }) {
  const cls = [anchor ? 'anchor-card' : 'card', className].filter(Boolean).join(' ')
  return <Tag className={cls} {...rest}>{children}</Tag>
}
