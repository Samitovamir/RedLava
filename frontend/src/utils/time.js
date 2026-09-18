// The site always runs on Moscow time: the owner is in Moscow, but we test from other zones.
// mskNow() returns a Date whose local fields (hours/date/weekday) match Moscow
// time — which is why it can stand in for new Date() everywhere we need
// "now" or "today".
export function mskNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
}

// YYYY-MM-DD date key in Moscow time
export function mskDateKey() {
  const d = mskNow()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
