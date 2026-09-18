import { categoryColor } from './categoryColor.js'

/*
  The shared EVENT dictionary for AddEventModal + DaySchedule (and anywhere it's needed later):
  the types, the colors (theme tokens via categoryColor) and a meaningful category/icon.
  Event data stores only the type string; the color and the icon are derived here — no
  dictionaries duplicated and no inline SVG scattered across components.
*/

export const EVENT_TYPES = [
  { value: 'call', ru: 'Звонок', en: 'Call', colorKey: 'event-call' },
  { value: 'calendar', ru: 'Событие', en: 'Event', colorKey: 'event-calendar' },
  { value: 'email', ru: 'Письмо', en: 'Email', colorKey: 'event-email' },
  { value: 'meeting', ru: 'Встреча', en: 'Meeting', colorKey: 'event-meeting' },
  { value: 'workout', ru: 'Тренировка', en: 'Workout', colorKey: 'event-workout' },
]

export const eventTypeColor = (type) =>
  categoryColor((EVENT_TYPES.find((t) => t.value === type) || EVENT_TYPES[1]).colorKey)

// A category based on what the event MEANS, rather than on its "technical" type:
// workout / personal / email / call / meeting / task. The event type is too narrow
// (call/calendar/email/meeting), so workouts and personal events are caught by keyword.
const WORKOUT_RE = /трениров|бассейн|плаван|заплыв|пробежк|\bбег\b|\bзал\b|спорт|йог|велосипед|\bвелик\b|кросс|кардио|растяжк|gym|run|swim|workout|ride|\bbike\b|yoga/i
const PERSONAL_RE = /личное|семья|\bдом\b|врач|family|personal|doctor/i

export function eventCategory(e) {
  if (e.type === 'workout') return 'workout'   // an explicit "Workout" type (not just a keyword match)
  const txt = `${e.title || ''} ${e.who || ''}`
  if (WORKOUT_RE.test(txt)) return 'workout'
  if (e.type === 'email') return 'mail'
  if (e.type === 'call') return 'call'
  if (PERSONAL_RE.test(txt)) return 'personal'
  if (e.type === 'meeting') return 'meeting'
  return 'event'
}

// Category → an iconMap key (rendered through ui/Icon)
const CATEGORY_ICON_KEY = {
  workout: 'sport-run',
  personal: 'event-personal',
  mail: 'event-email',
  call: 'event-call',
  meeting: 'event-meeting',
  event: 'event-calendar',
}

export const eventIconKey = (e) => CATEGORY_ICON_KEY[eventCategory(e)] || 'event-calendar'
