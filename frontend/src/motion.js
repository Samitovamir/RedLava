// Единые токены движения для всех framer-motion анимаций.
// Цель — убрать разнобой magic-numbers (0.15/0.2/0.25/0.35/0.4 и springs вразнобой)
// и согласовать JS-анимации с CSS-токенами --dur-* / --ease из index.css.
// Премиальное движение в духе Porsche×CarPlay: спокойное, точное, без рывков.

// Длительности (секунды) = --dur-* / 1000
export const DUR = { fast: 0.15, base: 0.2, slow: 0.3, slower: 0.4 }

// Кривая = --ease: cubic-bezier(0.4, 0, 0.2, 1)
export const EASE = [0.4, 0, 0.2, 1]

// Пружины под разные задачи
export const SPRING = {
  snappy: { type: 'spring', stiffness: 420, damping: 34 }, // навигация, тогглы, мелкие элементы
  soft: { type: 'spring', stiffness: 300, damping: 30 },   // модалки
  panel: { type: 'spring', stiffness: 260, damping: 26 },  // крупные панели / reading-оверлей
}

// Готовые варианты для motion.* — переиспользовать вместо локальных initial/animate
export const variants = {
  // фон модалки
  modalBackdrop: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: DUR.base, ease: EASE },
  },
  // панель модалки
  modalPanel: {
    initial: { opacity: 0, scale: 0.96, y: 12 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.96, y: 12 },
    transition: SPRING.soft,
  },
  // мягкое появление блока/карточки при монтировании
  fadeUp: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DUR.base, ease: EASE },
  },
  // переход между разделами (страницами)
  pageEnter: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { duration: DUR.slow, ease: EASE },
  },
}

// Микроинтеракции (передавать как пропсы в motion.*)
export const press = { whileTap: { scale: 0.97 } }
export const hoverLift = { whileHover: { y: -4 }, transition: SPRING.snappy }

// Единая лестница z-index (чинит разнобой 500/900/1000 у модалок)
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
