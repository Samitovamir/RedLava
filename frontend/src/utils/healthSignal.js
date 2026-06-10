// Сигнал «Здоровье» для Главной.
// По умолчанию — СПОКОЙНЫЙ статус (восстановление/готовность/сон), без выискивания
// отклонений. Тревожный (warning) вид — ТОЛЬКО под действие, которое реально пора
// совершить сегодня: пересдать анализ. Сами медицинские отклонения на Главную как
// тревога не выносятся — они спокойно лежат в разделе «Здоровье».

import { buildHistory, markerStatus, resolveMarker } from './labs.js'
import { mskNow } from './time.js'

// Группы показателей, которые при отклонении имеет смысл ПЕРЕСДАТЬ через интервал:
// они корректируются приёмом/лечением, и важна динамика. Значение — через сколько
// дней после последней сдачи разумно проверить повторно. Группы — из labs.js.
const RETEST_DAYS = {
  vitamins: 90,      // витамин D, B12 — контроль приёма через ~3 мес
  iron: 90,          // железо, ферритин — после терапии
  lipids: 90,        // холестерин, ЛПНП — после диеты/статинов
  metabolic: 90,     // глюкоза, гликированный гемоглобин
  thyroid: 60,       // ТТГ — после коррекции дозы
  liver: 60,         // АЛТ, АСТ — контроль
  inflammation: 30   // СРБ — быстрый контроль воспаления
}

// Сколько целых дней прошло с даты сдачи (по московскому «сегодня»).
function daysSince(iso, now) {
  const [y, m, d] = iso.split('-').map(Number)
  const then = Date.UTC(y, m - 1, d)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((today - then) / 86400000)
}

// Показатели, по которым РЕАЛЬНО пора пересдать: вне нормы, относятся к
// «пересдаваемой» группе и с момента последней сдачи прошёл срок контроля.
// Это и есть действие, которое сигнал выносит на Главную.
export function dueRetests(reports, now = mskNow()) {
  if (!Array.isArray(reports) || !reports.length) return []
  const hist = buildHistory(reports)
  const due = []
  Object.keys(hist).forEach(name => {
    const h = hist[name]
    const last = h[h.length - 1]
    const def = resolveMarker(name, last)
    const interval = RETEST_DAYS[def.group]
    if (!interval) return
    const st = markerStatus(last.value, def.min, def.max)
    if (st !== 'low' && st !== 'high') return
    const days = daysSince(last.date, now)
    if (days >= interval) due.push({ name: def.name, date: last.date, daysAgo: days, status: st })
  })
  // Дольше всех «висящие» — выше: их пора пересдать в первую очередь.
  return due.sort((a, b) => b.daysAgo - a.daysAgo)
}

// Спокойный статус готовности по утреннему баллу восстановления Whoop.
// tone: 'good' | 'mid' | 'low' — задаёт цвет и подбадривающий текст (НЕ тревога).
export function readinessTone(recovery) {
  if (recovery == null) return null
  if (recovery >= 67) return 'good'
  if (recovery >= 34) return 'mid'
  return 'low'
}
