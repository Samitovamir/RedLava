// A category's color via a theme CSS variable, rather than a hex hardcoded in JS.
// The data stores a colorKey string ('sport-run', 'lab-blood', 'meal-breakfast',
// 'event-call', 'pri-1') and the actual color comes from --cat-<key>, which each of the
// 4 themes defines (index.css). That way the category palette switches with the theme.
//
// For example: <span style={{ color: categoryColor(item.colorKey) }} />
// or, for a tinted background: tint(item.colorKey, 0.14)

export const categoryColor = (key) =>
  key ? `var(--cat-${key}, var(--text-muted))` : 'var(--text-muted)'

// A translucent backing in the same color (for category tiles and chips).
// Uses color-mix, which modern browsers support (our Vite/React target).
export const categoryTint = (key, amount = 0.14) =>
  key
    ? `color-mix(in srgb, var(--cat-${key}, var(--text-muted)) ${Math.round(amount * 100)}%, transparent)`
    : 'transparent'
