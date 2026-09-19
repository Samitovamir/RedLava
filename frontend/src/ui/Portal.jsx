import { createPortal } from 'react-dom'

/*
  Renders its children into document.body so modals don't depend on transformed ancestors
  (a framer-motion scale in CockpitShell made position:fixed relative to the window, and the
  modals drifted). The portal puts fixed back into the screen's coordinate system.
*/
export default function Portal({ children }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}
