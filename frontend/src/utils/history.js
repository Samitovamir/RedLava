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

// Сегодняшняя дата в формате 'YYYY-MM-DD' (считается каждый раз, не «замораживается»)
function todayStr() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Демо-журнал для гостя. Даты считаются от сегодняшнего дня, чтобы
// записи всегда выглядели свежими («Сегодня» / «Вчера» / последние дни).
// daysAgo — сколько дней назад, time — 'HH:MM'.
export function buildGuestHistory() {
  const stamp = (daysAgo, time) => {
    const d = new Date()
    d.setDate(d.getDate() - daysAgo)
    const p = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${time}`
  }
  const raw = [
    // Сегодня
    { actor: 'ai',   type: 'event',    status: 'done',    daysAgo: 0, time: '09:24', title: 'ИИ создал событие «Звонок с врачом»', detail: 'Сегодня 15:00–15:30, добавлено в расписание.' },
    { actor: 'ai',   type: 'email',    status: 'done',    daysAgo: 0, time: '09:40', title: 'ИИ подготовил письмо Ивану',          detail: 'Ответ по встрече в четверг — предложил время 14:00.' },
    { actor: 'user', type: 'workout',  status: 'done',    daysAgo: 0, time: '07:40', title: 'Вы отметили тренировку «Бег 8.2 км»',  detail: '42 мин, средний пульс 133. Данные из Garmin.' },
    { actor: 'ai',   type: 'task',     status: 'pending', daysAgo: 0, time: '11:35', title: 'ИИ готовит сводку по анализам',         detail: 'Жду загрузки последнего файла с гормонами.' },
    // Вчера
    { actor: 'ai',   type: 'reminder', status: 'done',    daysAgo: 1, time: '20:00', title: 'ИИ напомнил о приёме лекарств',        detail: 'Ежедневное напоминание в 20:00.' },
    { actor: 'user', type: 'event',    status: 'done',    daysAgo: 1, time: '18:10', title: 'Вы перенесли тренировку',              detail: 'С 18:00 на 19:30 вручную.' },
    { actor: 'ai',   type: 'search',   status: 'done',    daysAgo: 1, time: '13:15', title: 'ИИ нашёл ресторан на годовщину',       detail: '3 варианта рядом, забронировал «Веранду» на 19:00.' },
    // Позавчера
    { actor: 'ai',   type: 'task',     status: 'done',    daysAgo: 2, time: '10:05', title: 'ИИ запомнил факт о вас',               detail: 'Кофе пьёте только до обеда — учту при планировании дня.' },
    { actor: 'user', type: 'workout',  status: 'done',    daysAgo: 2, time: '19:20', title: 'Вы отметили силовую тренировку',       detail: '55 мин, зал. Хорошее восстановление после.' },
    { actor: 'ai',   type: 'email',    status: 'failed',  daysAgo: 3, time: '19:50', title: 'ИИ не смог отправить письмо риелтору', detail: 'Не удалось приложить документ — нужно прикрепить файл вручную.' }
  ]
  return raw.map((e, i) => ({
    id: `guest-${i}`,
    actor: e.actor,
    type: e.type,
    status: e.status,
    datetime: stamp(e.daysAgo, e.time),
    title: e.title,
    detail: e.detail
  }))
}

// Метка группы по дате: Сегодня / Вчера / 1 июня
export function dayLabel(dateStr) {
  const today = todayStr()
  if (dateStr === today) return 'Сегодня'
  const d = new Date(dateStr + 'T00:00:00')
  const t = new Date(today + 'T00:00:00')
  const diff = Math.round((t - d) / 86400000)
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
