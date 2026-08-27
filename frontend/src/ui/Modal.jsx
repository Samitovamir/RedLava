import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { variants, Z } from '../motion.js'
import Icon from './Icon.jsx'
import { useT } from '../context/LanguageContext.jsx'

// Единая модалка для всех оверлеев. size: sm(440)|md(540)|lg(760)|reading(820).
// Закрытие по Esc и клику вне; lockScroll блокирует прокрутку фона.
const SIZES = { sm: 440, md: 540, lg: 760, reading: 820 }

export default function Modal({
  open, onClose, size = 'md', title, badge, align = 'center', lockScroll = true,
  fullscreenOnMobile = true, className = '', children,
}) {
  const t = useT({ en: { close: 'Close' }, ru: { close: 'Закрыть' } })
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    let prev
    if (lockScroll) { prev = document.body.style.overflow; document.body.style.overflow = 'hidden' }
    return () => {
      window.removeEventListener('keydown', onKey)
      if (lockScroll) document.body.style.overflow = prev || ''
    }
  }, [open, onClose, lockScroll])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="ds-modal-backdrop"
          style={{ zIndex: Z.modal, alignItems: align === 'top' ? 'flex-start' : 'center' }}
          initial={variants.modalBackdrop.initial}
          animate={variants.modalBackdrop.animate}
          exit={variants.modalBackdrop.exit}
          transition={variants.modalBackdrop.transition}
          onClick={onClose}
        >
          <motion.div
            className={['ds-modal', 'card', fullscreenOnMobile && 'ds-modal--sheet', className].filter(Boolean).join(' ')}
            style={{ maxWidth: SIZES[size] || SIZES.md }}
            initial={variants.modalPanel.initial}
            animate={variants.modalPanel.animate}
            exit={variants.modalPanel.exit}
            transition={variants.modalPanel.transition}
            onClick={(e) => e.stopPropagation()}
          >
            {(title || badge) && (
              <div className="ds-modal__head">
                <div className="ds-modal__titles">
                  {badge && <span className="ds-modal__badge">{badge}</span>}
                  {title && <h3 className="ds-modal__title">{title}</h3>}
                </div>
                <button className="ds-btn ds-btn--ghost ds-btn--icon ds-btn--sm" onClick={onClose} aria-label={t.close} type="button">
                  <Icon name="close" size={18} />
                </button>
              </div>
            )}
            {children}
          </motion.div>

          <style>{`
            .ds-modal-backdrop{ position:fixed; inset:0; display:flex; justify-content:center; padding:24px; background:var(--scrim, rgba(0,0,0,.5)); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); overflow-y:auto; }
            .ds-modal{ width:100%; margin:auto; max-height:92vh; overflow-y:auto; }
            /* На телефоне модалка — bottom-sheet: прижата к низу, во всю ширину, верхние углы скруглены */
            @media (max-width: 640px){
              .ds-modal-backdrop{ padding:0; align-items:flex-end !important; }
              .ds-modal.ds-modal--sheet{ max-width:100% !important; margin:auto 0 0 0; max-height:94dvh; border-radius:var(--radius) var(--radius) 0 0; border-bottom:none; padding-bottom:max(20px, env(safe-area-inset-bottom)); }
              .ds-modal.ds-modal--sheet::after{ border-radius:calc(var(--radius) - 6px) calc(var(--radius) - 6px) 0 0; }
            }
            .ds-modal__head{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px; }
            .ds-modal__titles{ display:flex; flex-direction:column; gap:4px; }
            .ds-modal__badge{ align-self:flex-start; font-size:11px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--accent); background:var(--bg-tile); padding:3px 8px; border-radius:6px; }
            .ds-modal__title{ font-size:18px; font-weight:700; color:var(--foreground); }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
