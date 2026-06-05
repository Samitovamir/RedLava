// Журнал действий. Копит и то, что сделал ИИ-помощник (письма, события, поиск),
// и то, что владелец сделал сам (добавил событие, отметил тренировку).
// actor: 'ai' — сделал помощник, 'user' — сделал сам.

export const ACTION_TYPES = {
  email:    { label: 'Письмо',      color: '#818cf8', icon: 'mail' },
  event:    { label: 'Событие',     color: '#22c55e', icon: 'calendar' },
  search:   { label: 'Поиск',       color: '#f59e0b', icon: 'search' },
  task:     { label: 'Задача',      color: '#38bdf8', icon: 'check' },
  reminder: { label: 'Напоминание', color: '#f97316', icon: 'bell' },
  workout:  { label: 'Тренировка',  color: '#ef4444', icon: 'activity' }
}

export const STATUS_INFO = {
  done:    { label: 'выполнено',  color: 'var(--green)' },
  pending: { label: 'в процессе', color: 'var(--yellow)' },
  failed:  { label: 'ошибка',     color: 'var(--red)' }
}

export const ACTOR_INFO = {
  ai:   { label: 'ИИ',      color: 'var(--primary)' },
  user: { label: 'владелец', color: 'var(--muted-foreground)' }
}

// datetime в формате 'YYYY-MM-DD HH:MM' (сегодня — 2026-06-04)
// Журнал начинается пустым — наполняется реальными действиями (демо-данные убраны)
export const INITIAL_HISTORY = []
const _DEMO_HISTORY = [
  { id: 1,  actor: 'ai',   type: 'email',    status: 'done',    datetime: '2026-06-04 09:24', title: 'Письмо Ивану отправлено',           detail: 'Ответ по встрече в четверг — подтвердил время 14:00.' },
  { id: 2,  actor: 'ai',   type: 'event',    status: 'done',    datetime: '2026-06-04 09:25', title: 'Создано событие «Звонок с врачом»', detail: 'Сегодня 15:00–15:30, добавлено в расписание.' },
  { id: 3,  actor: 'user', type: 'workout',  status: 'done',    datetime: '2026-06-04 07:40', title: 'Отметил тренировку «Бег 8.2 км»',   detail: '42 мин, средний пульс 133. Данные подтянулись из Garmin.' },
  { id: 4,  actor: 'ai',   type: 'reminder', status: 'done',    datetime: '2026-06-04 08:00', title: 'Напоминание о приёме лекарств',     detail: 'Ежедневно в 20:00.' },
  { id: 5,  actor: 'ai',   type: 'search',   status: 'done',    datetime: '2026-06-04 11:02', title: 'Поиск: рейсы Москва–Сочи',          detail: 'Найдено 6 вариантов, дешевле — 7 900 ₽ (Аэрофлот, 12 июня).' },
  { id: 6,  actor: 'user', type: 'event',    status: 'done',    datetime: '2026-06-04 10:15', title: 'Добавил событие «Обед с помощником»',  detail: 'Сегодня 13:00–14:00.' },
  { id: 7,  actor: 'ai',   type: 'task',     status: 'pending', datetime: '2026-06-04 11:40', title: 'Готовлю сводку по анализам',        detail: 'Жду загрузки последнего файла с гормонами.' },

  { id: 8,  actor: 'ai',   type: 'email',    status: 'done',    datetime: '2026-06-03 18:10', title: 'Письмо в управляющую компанию',     detail: 'Запрос акта сверки за май.' },
  { id: 9,  actor: 'user', type: 'event',    status: 'done',    datetime: '2026-06-03 16:30', title: 'Перенёс тренировку',                detail: 'С 18:00 на 19:30 вручную.' },
  { id: 10, actor: 'ai',   type: 'search',   status: 'done',    datetime: '2026-06-03 13:15', title: 'Поиск: ресторан на годовщину',     detail: '3 варианта рядом, забронировал «Веранду» на 19:00.' },

  { id: 11, actor: 'ai',   type: 'email',    status: 'done',    datetime: '2026-06-02 10:05', title: 'Поздравление коллеге отправлено',   detail: 'С днём рождения, тёплый текст по случаю.' },
  { id: 12, actor: 'user', type: 'workout',  status: 'done',    datetime: '2026-06-02 19:20', title: 'Отметил силовую тренировку',        detail: '55 мин, зал. Хорошее восстановление после.' },
  { id: 13, actor: 'ai',   type: 'search',   status: 'done',    datetime: '2026-06-02 08:30', title: 'Поиск: погода на выходные',         detail: 'Сб +24°, Вс +22°, без осадков.' },

  { id: 14, actor: 'user', type: 'event',    status: 'done',    datetime: '2026-06-01 20:14', title: 'Добавил «День рождения внука»',     detail: '14 июня, напоминание за 2 дня.' },
  { id: 15, actor: 'ai',   type: 'email',    status: 'failed',  datetime: '2026-06-01 19:50', title: 'Письмо риелтору не отправлено',     detail: 'Не удалось приложить документ — нужно прикрепить файл вручную.' }
]

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const TODAY = '2026-06-04'

// Метка группы по дате: Сегодня / Вчера / 1 июня
export function dayLabel(dateStr) {
  if (dateStr === TODAY) return 'Сегодня'
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(TODAY + 'T00:00:00')
  const diff = Math.round((today - d) / 86400000)
  if (diff === 1) return 'Вчера'
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function timeOf(datetime) { return datetime.split(' ')[1] }
export function dateOf(datetime) { return datetime.split(' ')[0] }

// Текущий момент в формате журнала
export function nowStamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
