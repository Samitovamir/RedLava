import { categoryColor } from './categoryColor.js'

/*
  Общий словарь СОБЫТИЙ для AddEventModal + DaySchedule (и любых будущих мест):
  типы, цвета (токены тем через categoryColor) и осмысленная категория/иконка.
  Данные событий хранят type-строку, цвет и иконка выводятся отсюда — без
  дублирования словарей и инлайн-SVG по компонентам.
*/

export const EVENT_TYPES = [
  { value: 'call', ru: 'Звонок', en: 'Call', colorKey: 'event-call' },
  { value: 'calendar', ru: 'Событие', en: 'Event', colorKey: 'event-calendar' },
  { value: 'email', ru: 'Письмо', en: 'Email', colorKey: 'event-email' },
  { value: 'meeting', ru: 'Встреча', en: 'Meeting', colorKey: 'event-meeting' },
]

export const eventTypeColor = (type) =>
  categoryColor((EVENT_TYPES.find((t) => t.value === type) || EVENT_TYPES[1]).colorKey)

// Осмысленная категория по СМЫСЛУ события, а не по «техническому» типу:
// тренировка / личное / письмо / звонок / встреча / дело. Тип события узковат
// (call/calendar/email/meeting), поэтому тренировки и личное ловим по ключевым словам.
const WORKOUT_RE = /трениров|бассейн|плаван|заплыв|пробежк|\bбег\b|\bзал\b|спорт|йог|велосипед|\bвелик\b|кросс|кардио|растяжк|gym|run|swim|workout|ride|\bbike\b|yoga/i
const PERSONAL_RE = /личное|семья|\bдом\b|врач|family|personal|doctor/i

export function eventCategory(e) {
  const txt = `${e.title || ''} ${e.who || ''}`
  if (WORKOUT_RE.test(txt)) return 'workout'
  if (e.type === 'email') return 'mail'
  if (e.type === 'call') return 'call'
  if (PERSONAL_RE.test(txt)) return 'personal'
  if (e.type === 'meeting') return 'meeting'
  return 'event'
}

// Категория → ключ iconMap (рендер через ui/Icon)
const CATEGORY_ICON_KEY = {
  workout: 'sport-run',
  personal: 'event-personal',
  mail: 'event-email',
  call: 'event-call',
  meeting: 'event-meeting',
  event: 'event-calendar',
}

export const eventIconKey = (e) => CATEGORY_ICON_KEY[eventCategory(e)] || 'event-calendar'
