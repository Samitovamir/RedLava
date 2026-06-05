// Сайт всегда живёт по московскому времени: владелец в Москве, а тестируем из других зон.
// mskNow() возвращает Date, у которого локальные поля (часы/дата/день недели)
// соответствуют московскому времени — поэтому его можно использовать вместо new Date()
// везде, где нужно «сейчас» или «сегодня».
export function mskNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
}

// Ключ даты YYYY-MM-DD по московскому времени
export function mskDateKey() {
  const d = mskNow()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
