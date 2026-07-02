import { createPortal } from 'react-dom'

/*
  Рендерит детей в document.body — чтобы модалки не зависели от трансформированных
  предков (framer-motion scale в CockpitShell делал position:fixed относительным окна,
  из-за чего модалки уезжали). Портал возвращает fixed к системе координат экрана.
*/
export default function Portal({ children }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}
