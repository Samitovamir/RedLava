// Цвет категории через CSS-переменную темы (а не хардкод hex в JS).
// Данные хранят colorKey-строку ('sport-run', 'lab-blood', 'meal-breakfast',
// 'event-call', 'pri-1'), а реальный цвет берётся из --cat-<key>, заданного
// в каждой из 4 тем (index.css). Так палитра категорий переключается с темой.
//
// Пример: <span style={{ color: categoryColor(item.colorKey) }} />
// или для фона-тинта: tint(item.colorKey, 0.14)

export const categoryColor = (key) =>
  key ? `var(--cat-${key}, var(--text-muted))` : 'var(--text-muted)'

// Полупрозрачная подложка того же цвета (для плашек/чипов категории).
// Использует color-mix — поддержан современными браузерами (таргет Vite/React).
export const categoryTint = (key, amount = 0.14) =>
  key
    ? `color-mix(in srgb, var(--cat-${key}, var(--text-muted)) ${Math.round(amount * 100)}%, transparent)`
    : 'transparent'
