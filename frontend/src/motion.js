// One set of motion tokens for every framer-motion animation.
// The goal is to get rid of the scattered magic numbers (0.15/0.2/0.25/0.35/0.4 and
// one-off springs) and keep the JS animations in step with the --dur-* / --ease CSS tokens
// from index.css. Premium motion in the spirit of Porsche x CarPlay: calm, precise, no jolts.

// Durations (seconds) = --dur-* / 1000
export const DUR = { fast: 0.15, base: 0.2, slow: 0.3, slower: 0.4 }

// Curve = --ease: cubic-bezier(0.4, 0, 0.2, 1)
export const EASE = [0.4, 0, 0.2, 1]

// Springs for different jobs
export const SPRING = {
  snappy: { type: 'spring', stiffness: 420, damping: 34 }, // navigation, toggles, small elements
  soft: { type: 'spring', stiffness: 300, damping: 30 },   // modals
  panel: { type: 'spring', stiffness: 260, damping: 26 },  // large panels / reading overlay
}

// Ready-made variants for motion.* — reuse these instead of local initial/animate
export const variants = {
  // modal backdrop
  modalBackdrop: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: DUR.base, ease: EASE },
  },
  // modal panel
  modalPanel: {
    initial: { opacity: 0, scale: 0.96, y: 12 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.96, y: 12 },
    transition: SPRING.soft,
  },
  // gentle entrance for a block/card on mount
  fadeUp: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DUR.base, ease: EASE },
  },
  // transition between sections (pages): a noticeable lift with a slight scale —
  // the section glides in like an instrument panel instead of just blinking into view
  pageEnter: {
    initial: { opacity: 0, y: 22, scale: 0.988 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -14, scale: 0.992 },
    transition: { duration: 0.36, ease: EASE },
  },
  // Mobile section transition: opacity ONLY — no transform on the whole page
  // (that makes the browser repaint a long section underneath the blurred tab
  // bar every frame → stutter). The exit is nearly instant so that when tabs are
  // switched quickly the new section shows up at once, with no lag.
  pageFade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0, transition: { duration: 0.1, ease: EASE } },
    transition: { duration: 0.22, ease: EASE },
  },
}

// Microinteractions (pass these as props to motion.*)
export const press = { whileTap: { scale: 0.97 } }
export const hoverLift = { whileHover: { y: -4 }, transition: SPRING.snappy }

// A single z-index ladder (fixes the 500/900/1000 mess the modals had)
export const Z = {
  base: 1,
  sidebar: 100,
  aiBar: 200,
  fab: 300,
  modal: 500,
  toast: 600,
  reading: 900,
  top: 1000,
}
