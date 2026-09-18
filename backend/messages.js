/*
  Messages the backend sends to a person, in the language they are using.

  The problem this solves: the server used to answer in Russian always, so an
  English interface showed things like "Добавьте ANTHROPIC_API_KEY в .env" —
  the first browser smoke test caught exactly that on the schedule screen.
  Translating the strings to English would only move the problem onto the
  Russian half, so the server has to know the language instead.

  How it knows: the frontend already wraps every /api call to attach the auth
  token and the device id (see api/authFetch.js), so it attaches X-Lang there
  too. Nothing at the call sites had to change.

  What does NOT belong here: prompts and tool descriptions for the AI. Those are
  written in Russian on purpose — they steer the model, they are not shown to
  anyone, and the answer's language is set separately by each caller's context.
*/

export const langOf = (req) => (String(req?.headers?.['x-lang'] || '').toLowerCase() === 'en' ? 'en' : 'ru')

const M = {
  // ── AI: configuration and spend guards ──────────────────────────────────
  noAiKey: {
    ru: 'Добавьте ANTHROPIC_API_KEY в .env файл для работы ИИ.',
    en: 'Add ANTHROPIC_API_KEY to your .env file to switch the assistant on.',
  },
  noAiKeyActions: {
    ru: 'Добавьте ANTHROPIC_API_KEY в .env — и я смогу реально выполнять задачи (создавать события, готовить письма).',
    en: 'Add ANTHROPIC_API_KEY to your .env and I can actually do things — create events, draft emails.',
  },
  noAiKeyArticle: {
    ru: 'Добавьте ANTHROPIC_API_KEY в .env, и я подробно всё расскажу с картинками.',
    en: 'Add ANTHROPIC_API_KEY to your .env and I will tell you the whole story, with pictures.',
  },
  noAiKeySummary: {
    ru: 'Добавьте ANTHROPIC_API_KEY в .env для получения сводки.',
    en: 'Add ANTHROPIC_API_KEY to your .env to get the summary.',
  },
  guestLimit: {
    ru: 'Дневной лимит ИИ в демо-режиме исчерпан. Зайдите завтра или войдите в основной аккаунт.',
    en: 'The demo has used up its AI requests for today. Come back tomorrow, or sign in to your own account.',
  },
  tooLong: {
    ru: 'Запрос слишком длинный. Сократите его, пожалуйста, и попробуйте снова.',
    en: 'That request is too long. Please shorten it and try again.',
  },
  tooFast: {
    ru: 'Слишком много запросов подряд. Давайте сделаем паузу на минуту и попробуем снова.',
    en: 'That is a lot of requests in a row. Let us pause for a minute and try again.',
  },
  tooManyHour: {
    ru: 'Помощник сегодня поработал очень активно. Давайте продолжим через часок.',
    en: 'The assistant has been busy. Let us pick this up again in an hour.',
  },
  tooManyDay: {
    ru: 'На сегодня помощник уже сделал очень много. Давайте вернёмся к этому завтра.',
    en: 'The assistant has done a great deal today. Let us come back to this tomorrow.',
  },
  filesSoon: {
    ru: 'Анализ файлов — в разработке',
    en: 'File analysis is not built yet',
  },
  // ── AI: routes ──────────────────────────────────────────────────────────
  noMapsKey: {
    ru: 'Маршруты пока недоступны: на сервере не задан ключ Яндекс.Карт.',
    en: 'Routes are unavailable: the server has no Yandex Maps key configured.',
  },
  addressUnknown: {
    ru: 'Не удалось определить адрес. Попроси уточнить адрес.',
    en: 'Could not resolve that address. Ask for a more precise one.',
  },

  // ── Garmin ──────────────────────────────────────────────────────────────
  garminCreds: {
    ru: 'Введите email и пароль',
    en: 'Enter your email and password',
  },
  garminMfa: {
    ru: 'Аккаунт требует код двухфакторной проверки — в приложении пока нет экрана для его ввода.',
    en: 'This account asks for a two-factor code, and there is no screen for entering one yet.',
  },
  garminFailed: {
    ru: 'Не удалось войти в Garmin. Проверьте логин и пароль. ',
    en: 'Could not sign in to Garmin. Check the username and password. ',
  },

  // ── Gmail ───────────────────────────────────────────────────────────────
  mailBadTo: {
    ru: 'Укажите корректный email получателя.',
    en: 'Enter a valid recipient email.',
  },
  mailEmpty: {
    ru: 'Пустое письмо — добавьте текст.',
    en: 'The message is empty — add some text.',
  },
  mailNoGoogle: {
    ru: 'Google не подключён. Подключите Google в разделе «Подключения».',
    en: 'Google is not connected. Connect it in Settings.',
  },
  mailNoScope: {
    ru: 'Нет доступа к отправке писем. Переподключите Google в «Подключениях».',
    en: 'No permission to send mail. Reconnect Google in Settings.',
  },
  mailFailed: {
    ru: 'Не удалось отправить письмо. Попробуйте ещё раз.',
    en: 'Could not send the message. Please try again.',
  },
  mailNetwork: {
    ru: 'Ошибка отправки. Проверьте соединение.',
    en: 'Sending failed. Check your connection.',
  },

  // ── Blood tests ─────────────────────────────────────────────────────────
  labsBadUrl: {
    ru: 'Дайте ссылку на публичную папку Яндекс.Диска',
    en: 'Give a link to a public Yandex.Disk folder',
  },
  labsNoFile: {
    ru: 'Файл не найден',
    en: 'File not found',
  },
  labsUnparsed: {
    ru: 'Не удалось разобрать файл',
    en: 'Could not read that file',
  },
  labsNoUpload: {
    ru: 'Нет файла',
    en: 'No file was sent',
  },
  labsNoMarkers: {
    ru: 'Не удалось распознать показатели в этом файле',
    en: 'Could not find any markers in that file',
  },

  // ── Nutrition ───────────────────────────────────────────────────────────
  nutNoAiKey: {
    ru: 'Нет ключа ИИ',
    en: 'No AI key configured',
  },
  nutNeedPhoto: {
    ru: 'Нужно фото (png/jpg/webp)',
    en: 'A photo is required (png/jpg/webp)',
  },
}

/** msg(req, 'key') → the string in the caller's language. */
export function msg(req, key) {
  const entry = M[key]
  if (!entry) throw new Error(`unknown message key: ${key}`)
  return entry[langOf(req)]
}
