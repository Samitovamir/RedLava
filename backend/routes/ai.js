import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { kvGet, kvSet } from '../store.js'

const router = Router()

// --- Дневной лимит ИИ для гостей (демо-режим) ---
// Гость может попробовать ассистента, но не «писать сочинения». владелец — без этого лимита.
const GUEST_DAILY_LIMIT = Number(process.env.AI_GUEST_DAILY_LIMIT) || 15

// Текущая дата по Москве (YYYY-MM-DD) — счётчик сбрасывается каждый день в полночь МСК.
function mskDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
}

// Идентификатор устройства гостя: чтобы лимит был ПО УСТРОЙСТВУ, а не общий на всех.
// Берём заголовок X-Device-Id (его шлёт фронт), фолбэк — IP.
function guestDeviceId(req) {
  const raw = String(req.headers['x-device-id'] || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
  if (raw) return raw
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'noip'
  return 'ip-' + ip.replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 45)
}

// Проверяет и инкрементирует дневной счётчик гостя ДЛЯ ЕГО УСТРОЙСТВА.
// Возвращает true, если лимит на сегодня уже исчерпан (запрос НЕ нужно выполнять).
// Для не-гостей (albert) всегда false.
async function guestOverDailyLimit(req) {
  if (req.role !== 'guest') return false
  // Локально (npm-дев через server.js) демо-лимит снят — чтобы свободно тестировать ИИ.
  // На проде (Vercel, api/index.js) флаг LOCAL_DEV не выставлен → лимит работает как прежде.
  if (process.env.LOCAL_DEV === '1') return false
  const key = `ai:guest:limit:${guestDeviceId(req)}:${mskDateKey()}`
  const used = Number(await kvGet(key)) || 0
  if (used >= GUEST_DAILY_LIMIT) return true
  await kvSet(key, used + 1)
  return false
}

const GUEST_LIMIT_MSG = 'Дневной лимит ИИ в демо-режиме исчерпан. Зайдите завтра или войдите в основной аккаунт.'

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

// --- Яндекс.Карты: адрес → координаты, и время в пути (для вопросов «во сколько выезжать») ---
const YA_GEO_KEY = () => process.env.YANDEX_GEOCODER_KEY || process.env.YANDEX_MAPS_API_KEY || ''
const YA_ROUTER_KEY = () => process.env.YANDEX_ROUTER_KEY || process.env.YANDEX_MAPS_API_KEY || ''

async function yaGeocode(address) {
  const key = YA_GEO_KEY(); if (!key || !address) return null
  try {
    const u = `https://geocode-maps.yandex.ru/1.x/?apikey=${key}&format=json&results=1&lang=ru_RU&geocode=${encodeURIComponent(address)}`
    const r = await fetch(u); if (!r.ok) return null
    const d = await r.json()
    const obj = d?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject
    if (!obj) return null
    const [lon, lat] = obj.Point.pos.split(' ').map(Number)
    return { lat, lon, name: obj.metaDataProperty?.GeocoderMetaData?.text || address }
  } catch { return null }
}

function haversineKm(a, b) {
  const R = 6371, toR = x => x * Math.PI / 180
  const dLat = toR(b.lat - a.lat), dLon = toR(b.lon - a.lon)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

async function yaRouteEta(fromAddr, toAddr) {
  if (!YA_GEO_KEY()) return { ok: false, reason: 'no_key' }
  const from = await yaGeocode(fromAddr), to = await yaGeocode(toAddr)
  if (!from || !to) return { ok: false, reason: 'geocode' }
  const rkey = YA_ROUTER_KEY()
  if (rkey) {
    try {
      const u = `https://api.routing.yandex.net/v2/distancematrix?apikey=${rkey}&origins=${from.lat},${from.lon}&destinations=${to.lat},${to.lon}&mode=driving&departure_time=now`
      const r = await fetch(u)
      if (r.ok) {
        const cell = (await r.json())?.rows?.[0]?.elements?.[0]
        const sec = cell?.duration?.value ?? cell?.duration
        const dist = cell?.distance?.value
        if (sec) return { ok: true, etaMin: Math.round(sec / 60), distanceKm: dist ? Math.round(dist / 1000) : Math.round(haversineKm(from, to)), traffic: true, from: from.name, to: to.name }
      }
    } catch { /* ignore — упадём в оценку */ }
  }
  // Фолбэк без ключа маршрутизатора: оценка по прямой
  const km = haversineKm(from, to) * 1.35
  return { ok: true, etaMin: Math.round(km / 42 * 60), distanceKm: Math.round(km), traffic: false, approx: true, from: from.name, to: to.name }
}

// --- Предохранитель: лимиты, чтобы случайно не потратить все токены ---
// ВАЖНО: дашборд на ОДНОЙ загрузке штатно шлёт ~10–15 ИИ-карточек (сводка дня, питание,
// спорт, здоровье, советник…). Прежние 15/мин срабатывали уже на первой загрузке и отдавали
// заглушку «слишком много запросов» вместо реального ответа (а фронт её ещё и кэшировал).
// Поднимаем до значений, при которых обычная навигация не режется, но настоящий разгон
// (зацикленный вызов) по-прежнему ловится.
const LIMITS = {
  perMin: Number(process.env.AI_LIMIT_PER_MIN) || 60,
  perHour: Number(process.env.AI_LIMIT_PER_HOUR) || 300,
  perDay: Number(process.env.AI_LIMIT_PER_DAY) || 1000,
  maxMessageChars: Number(process.env.AI_MAX_MESSAGE_CHARS) || 4000
}
let aiHits = [] // метки времени запросов (мс)

// Ответ-заглушка во всех форматах, которые ждут разные окна интерфейса
function softBlock(message) {
  return { reply: message, text: message, summary: message, result: message, actions: [], images: [], limited: true }
}

function aiRateLimit(req, res, next) {
  const now = Date.now()
  aiHits = aiHits.filter(t => now - t < 24 * 60 * 60 * 1000)
  const inMin = aiHits.filter(t => now - t < 60 * 1000).length
  const inHour = aiHits.filter(t => now - t < 60 * 60 * 1000).length
  const inDay = aiHits.length

  // Слишком длинный запрос — частая причина случайного перерасхода
  const msg = req.body?.message
  if (typeof msg === 'string' && msg.length > LIMITS.maxMessageChars) {
    return res.status(200).json(softBlock('Запрос слишком длинный. Сократите его, пожалуйста, и попробуйте снова.'))
  }
  if (inMin >= LIMITS.perMin) {
    return res.status(200).json(softBlock('Слишком много запросов подряд. Давайте сделаем паузу на минуту и попробуем снова.'))
  }
  if (inHour >= LIMITS.perHour) {
    return res.status(200).json(softBlock('Помощник сегодня поработал очень активно. Давайте продолжим через часок.'))
  }
  if (inDay >= LIMITS.perDay) {
    return res.status(200).json(softBlock('На сегодня помощник уже сделал очень много. Давайте вернёмся к этому завтра.'))
  }
  aiHits.push(now)
  next()
}

router.use(aiRateLimit)

// Единый стиль ответа для всех окон ассистента (добавляется к любому system-промпту).
const STYLE_RULE =
  '\n\nСТИЛЬ ОТВЕТА (обязательно):\n' +
  '• Пиши на русском чисто, тепло и уважительно, как личное сообщение пожилому человеку.\n' +
  '• НИКАКОГО markdown: не используй звёздочки **, символы *, решётки #, подчёркивания _ и обратные кавычки `. Не выделяй жирным/курсивом.\n' +
  '• Предложения КОРОТКИЕ и простые. Одна мысль — одно предложение. Без воды, без вводных оборотов и канцелярита.\n' +
  '• ПОЧТИ НЕ ИСПОЛЬЗУЙ тире «—». Не склеивай им части предложения и не начинай им пункты. Лучше точка и новая строка.\n' +
  '• Разбивай ответ на АБЗАЦЫ ПО СМЫСЛУ: каждая новая мысль или тема — отдельный абзац, между абзацами пустая строка.\n' +
  '• Если перечисляешь — каждый пункт с НОВОЙ СТРОКИ (перенос строки), а не подряд в одну строку. Можно начинать пункт с «• ».\n' +
  '• НЕ используй смайлики и эмодзи.'

router.post('/chat', async (req, res) => {
  const { message, context, history, snapshot, maxTokens } = req.body
  if (!message) return res.status(400).json({ error: 'message required' })
  // Обычный чат — короткие ответы (1024). Длинные форматы (расшифровка анализов и т.п.)
  // могут запросить больший лимит, но не выше потолка, чтобы ответ не обрывался на полуслове.
  const outTokens = Math.min(Math.max(Number(maxTokens) || 1024, 256), 8192)
  if (await guestOverDailyLimit(req)) return res.status(200).json(softBlock(GUEST_LIMIT_MSG))
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ reply: 'Добавьте ANTHROPIC_API_KEY в .env файл для работы ИИ.' })
  }
  try {
    const client = getClient()
    const prior = Array.isArray(history)
      ? history.filter(m => m && m.text).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))
      : []
    // Весь системный промпт (контекст + снимок данных + стиль) — одним КЭШИРУЕМЫМ блоком.
    // В рамках одного диалога он не меняется, поэтому каждое следующее сообщение
    // переиспользует кэш и стоит на ~90% дешевле по входным токенам.
    const base = (context || 'Ты помощник владельца. Краткие дельные ответы на русском.')
    const full = base + (snapshot ? `\n\nДАННЫЕ ВЛАДЕЛЬЦА (общий снимок дашборда):\n${snapshot}` : '') + STYLE_RULE
    const system = [{ type: 'text', text: full, cache_control: { type: 'ephemeral' } }]
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: outTokens,
      system,
      messages: [...prior, { role: 'user', content: message }]
    })
    if (process.env.AI_DEBUG) console.log('[chat usage]', JSON.stringify(response.usage))
    res.json({ reply: response.content[0].text })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Инструменты ассистента (tool use) ---
const EVENT_TOOLS = [
  {
    name: 'create_event',
    description: 'Создать новое событие в расписании владельца. Даты строго в формате YYYY-MM-DD, время в HH:MM (24 часа).',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Краткое понятное название события' },
        date: { type: 'string', description: 'Дата в формате YYYY-MM-DD' },
        start: { type: 'string', description: 'Время начала HH:MM' },
        end: { type: 'string', description: 'Время окончания HH:MM' },
        who: { type: 'string', description: 'С кем / участники (необязательно)' },
        priority: { type: 'integer', description: '1 — неотложный, 2 — важный, 3 — обычный (по умолчанию 3)' },
        type: { type: 'string', enum: ['call', 'meeting', 'email', 'calendar', 'workout'], description: 'Тип: call — звонок, meeting — встреча/личное, email — письмо/задача, calendar — прочее, workout — тренировка' }
      },
      required: ['title', 'date', 'start', 'end']
    }
  },
  {
    name: 'move_event',
    description: 'Перенести существующее событие (находится по названию, даже неточному) на новую дату/время.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Название события, которое нужно перенести (как у пользователя)' },
        new_date: { type: 'string', description: 'Новая дата YYYY-MM-DD (если меняется)' },
        new_start: { type: 'string', description: 'Новое время начала HH:MM (если меняется)' },
        new_end: { type: 'string', description: 'Новое время окончания HH:MM (если меняется)' }
      },
      required: ['title']
    }
  },
  {
    name: 'delete_event',
    description: 'Удалить событие из расписания по названию (даже неточному).',
    input_schema: {
      type: 'object',
      properties: { title: { type: 'string', description: 'Название события для удаления' } },
      required: ['title']
    }
  },
  {
    name: 'remember_fact',
    description: 'Запомнить НАДОЛГО устойчивый факт об владельце, чтобы со временем узнавать его всё лучше. Вызывай САМ, не спрашивая разрешения, всякий раз когда в разговоре всплывает что-то постоянное: контакт человека («email контакта — ivan@example.com», «сын — сын»), привычка/расписание («тренируется по утрам ~06:30»), предпочтение (еда, язык, спорт), здоровье/цель («цель — похудеть»), адрес/место. Можно вызвать несколько раз за ответ. НЕ запоминай разовое («сегодня устал», «купи молоко на сегодня») и НЕ дублируй то, что уже есть в разделе ПАМЯТЬ снимка.',
    input_schema: {
      type: 'object',
      properties: { fact: { type: 'string', description: 'Короткая однозначная формулировка факта по-русски, от третьего лица про владельца. Напр.: «email контакта — ivan@example.com».' } },
      required: ['fact']
    }
  }
]

// Подготовка письма (клиентское действие): письмо НЕ отправляется сразу — владелец подтверждает в предпросмотре.
const SEND_EMAIL_TOOL = {
  name: 'send_email',
  description: 'Подготовить письмо (email) от имени владельца. ВАЖНО: письмо НЕ отправляется сразу — владелец увидит предпросмотр и сам нажмёт «Отправить». Используй, когда он просит написать/отправить кому-то письмо. Если email получателя неизвестен — НЕ выдумывай: попроси сказать адрес один раз и запомни его через remember_fact (например «email контакта: ivan@example.com»), затем подготовь письмо. Если адрес уже есть в ПАМЯТИ — подставь его сам.',
  input_schema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Email получателя, например ivan@example.com. Бери из памяти, если он там есть.' },
      subject: { type: 'string', description: 'Короткая понятная тема письма' },
      body: { type: 'string', description: 'Текст письма по-русски — тёплый и вежливый, от лица владельца, с приветствием и подписью, если уместно.' }
    },
    required: ['to', 'subject', 'body']
  }
}

// Обновление/забывание устаревшего факта в памяти (клиентское действие).
const UPDATE_FACT_TOOL = {
  name: 'update_fact',
  description: 'Обновить или убрать УСТАРЕВШИЙ факт в памяти, когда устойчивая реальность изменилась и старая запись больше не верна (например раньше «тренируется 1 раз в день», а теперь стабильно 3 раза и тело справляется). Передай old — текст устаревшего факта как он записан в разделе ПАМЯТЬ снимка, и new — обновлённую формулировку (или пусто, чтобы просто забыть). Если факт просто новый и ничего не заменяет — используй remember_fact, а не это.',
  input_schema: {
    type: 'object',
    properties: {
      old: { type: 'string', description: 'Текст устаревшего факта из раздела ПАМЯТЬ (как можно ближе к оригиналу).' },
      new: { type: 'string', description: 'Обновлённая формулировка факта. Пусто — если факт нужно просто удалить.' }
    },
    required: ['old']
  }
}

// Серверный инструмент: время в пути (выполняется на бэкенде, результат уходит обратно модели)
const ROUTE_TOOL = {
  name: 'route_eta',
  description: 'Узнать время в пути на автомобиле между двумя адресами/местами в России с учётом пробок. Используй для вопросов «во сколько выезжать», «сколько ехать», «успею ли». Адреса можно словами («Внуково», «Шереметьево», домашний адрес владельца из памяти).',
  input_schema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Откуда. Если не названо — домашний адрес владельца из ПАМЯТИ (если он там есть).' },
      to: { type: 'string', description: 'Куда (адрес или место).' }
    },
    required: ['from', 'to']
  }
}

// Ассистент с инструментами: умеет реально создавать/переносить/удалять события.
// События живут на клиенте, поэтому backend собирает список действий и возвращает их фронту.
router.post('/agent', async (req, res) => {
  const { message, snapshot, history, context } = req.body
  if (!message) return res.status(400).json({ error: 'message required' })
  if (await guestOverDailyLimit(req)) return res.status(200).json(softBlock(GUEST_LIMIT_MSG))
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ reply: 'Добавьте ANTHROPIC_API_KEY в .env — и я смогу реально выполнять задачи (создавать события и т.д.).', actions: [] })
  }

  // Большой статичный блок (правила + снимок данных) — КЭШИРУЕМЫЙ и одинаковый для всех окон,
  // которые ходят в /agent (командная строка, сводка дня). Контекст страницы — отдельным блоком,
  // чтобы не ломать общий кэш. Так повторные запросы стоят на ~90% дешевле по входным токенам.
  const cachedBody =
    `Ты — личный ассистент владельца, пожилого русскоязычного человека. Ты РЕАЛЬНО выполняешь задачи, а не только советуешь.\n` +
    `Ты видишь ВСЮ картину по нему — расписание, спорт, здоровье, анализы, память о нём — и отвечаешь связно по любым данным.\n\n` +
    `ЧТО ТЫ УМЕЕШЬ (инструменты):\n` +
    `• Создавать события (create_event) — встречи, звонки, дела, напоминания, тренировки.\n` +
    `• Переносить события (move_event) и удалять (delete_event).\n` +
    `• Запоминать факты о нём надолго (remember_fact) — когда он сообщает устойчивое предпочтение или домашний адрес.\n` +
    `• Узнавать время в пути на машине с пробками (route_eta) — между адресами/местами в России.\n` +
    `• Готовить письма по email (send_email) — пишешь текст, владелец проверяет в предпросмотре и сам отправляет.\n` +
    `Если просят то, чего пока нет (WhatsApp, поиск в интернете) — вежливо скажи, что появится скоро, и предложи, что можешь сейчас.\n\n` +
    `ПИСЬМА (email): когда просят кому-то написать/отправить письмо — используй send_email. Письмо НЕ уходит сразу: владелец видит предпросмотр и сам нажимает «Отправить», поэтому НЕ говори «отправил», говори «подготовил письмо, проверьте и отправьте». Если адреса получателя нет ни в просьбе, ни в памяти — спроси адрес один раз и запомни его через remember_fact, чтобы в следующий раз писать по имени.\n\n` +
    `ПОЕЗДКИ И АЭРОПОРТ: когда спрашивают во сколько выезжать (например в аэропорт):\n` +
    `• Узнай время в пути через route_eta. Откуда — домашний адрес владельца из ПАМЯТИ; если адреса в памяти нет, попроси сказать его один раз (и предложи запомнить).\n` +
    `• Заложи запас на аэропорт: внутренний рейс ~1.5 часа до вылета, международный ~2.5 часа.\n` +
    `• Время выезда = время вылета − запас на аэропорт − время в пути − резерв 15 минут.\n` +
    `• Дай конкретное время выезда. Опирайся на текущее время по Москве из снимка.\n\n` +
    `ИСТОЧНИК ИСТИНЫ: существующие события бери ТОЛЬКО из раздела РАСПИСАНИЕ снимка. Раздел ЖУРНАЛ ДЕЙСТВИЙ — это история, НЕ текущее расписание; не считай событие существующим и время занятым, если этого события нет в РАСПИСАНИИ. Никогда не выдумывай событий, которых нет в РАСПИСАНИИ.\n\n` +
    `КАК ПОНИМАТЬ ВЛАДЕЛЬЦА:\n` +
    `• Он пишет по-русски, простыми и разными словами, может делать ОПЕЧАТКИ — всё равно пойми смысл и выполни.\n` +
    `• «поставь / запиши / закинь / добавь / напомни / назначь» — создать событие; «перенеси / сдвинь / передвинь» — перенести; «убери / удали / отмени» — удалить.\n` +
    `• Находи событие по смыслу, даже если названо неточно.\n` +
    `• Относительные даты («завтра», «в среду», «через неделю») переводи в YYYY-MM-DD относительно сегодня (см. снимок).\n` +
    `• «утром» ≈ 09:00, «днём» ≈ 13:00, «вечером» ≈ 19:00, если время не названо. Длительность по умолчанию — 1 час.\n` +
    `• ТРЕНИРОВКИ: владелец любит тренироваться УТРОМ, около 06:30. Когда планируешь тренировку и время не задано — ставь приоритетно на ~06:30, учитывай её длительность и НЕ накладывай на другие события дня. Если 06:30 занято — выбери ближайшее свободное утреннее время. Тип события для тренировок — meeting.\n` +
    `• Учитывай память и предпочтения (например, не ставить дела после 21:00).\n` +
    `• Если просьба неясна — уточни одним коротким вопросом, не выдумывай.\n\n` +
    `ПАМЯТЬ — УЗНАВАЙ ВЛАДЕЛЬЦА (важно): тихо, не отвлекаясь от ответа, ЗАПОМИНАЙ через remember_fact каждый устойчивый факт о нём, который всплывает в разговоре, чтобы со временем знать его всё лучше. Что стоит запоминать:\n` +
    `• Контакты и люди: «email контакта — ivan@example.com», «жена — супруга», «сын — сын», тренер, врач — кто кому кем приходится и их адреса/телефоны.\n` +
    `• Привычки и расписание: «тренируется по утрам ~06:30», «по воскресеньям бассейн», «не любит дела после 21:00».\n` +
    `• Предпочтения: еда (что любит / что не ест), язык, как обращаться, вид спорта.\n` +
    `• Здоровье и цели: цель («похудеть»), ограничения, что регулярно принимает.\n` +
    `• Адреса и места: домашний адрес, привычные маршруты.\n` +
    `Правила памяти: запоминай САМ, без вопросов, и продолжай выполнять исходную просьбу. НЕ дублируй то, что уже есть в разделе ПАМЯТЬ снимка; если факт изменился (новый email) — сохрани обновлённый. Разовое и сиюминутное НЕ запоминай. Не сообщай каждый раз «я запомнил» — делай это незаметно (можно коротко упомянуть, только если это уместно).\n\n` +
    `НАБЛЮДЕНИЕ, ОБНОВЛЕНИЕ И РЕАКЦИЯ НА ИЗМЕНЕНИЯ:\n` +
    `• Запоминай не только слова, но и наблюдаемые ЗАКОНОМЕРНОСТИ из данных: ритм встреч, частоту и тип тренировок, динамику здоровья (вес, восстановление/HRV, давление, анализы). Это базовые «нормы» владельца.\n` +
    `• Если новый устойчивый факт ПРОТИВОРЕЧИТ записи в разделе ПАМЯТЬ (раньше «1 тренировка в день», теперь стабильно 3) — ОБЯЗАТЕЛЬНО вызови update_fact со старым текстом и новым, а НЕ remember_fact. Иначе в памяти окажутся две противоречащие записи. remember_fact — только для совсем нового факта, который ничего не заменяет.\n` +
    `• ПОДСТРАИВАЙСЯ под то, что у него РЕАЛЬНО работает, а не под общие нормы. Если он, например, делает по 3 тренировки в день и тело справляется (восстановление/HRV держатся, он продолжает) — это его норма; НЕ советуй «возьми одну», уважай режим. Снижать нагрузку проси только при настоящих тревожных признаках.\n` +
    `• РЕАГИРУЙ на ДОЛГОСРОЧНЫЕ сдвиги, а не на шум. Если устойчивый многонедельный паттерн начинает выбиваться (восстановление давно держалось 70–80%, а теперь стабильно падает несколько недель; вес надолго перестал снижаться; давление поползло) — СНАЧАЛА мягко, без паники, СПРОСИ, что изменилось (нагрузка, сон, стресс, питание, самочувствие, болезнь), и только потом, поняв причину, советуй. Если он не отвечает или сам не знает — не дави, делай разумные выводы и аккуратно подстройся сам.\n` +
    `• НЕ ПАНИКУЙ из-за разовых колебаний. Один-два-три дня хуже восстановление, скакнул вес, плохо поспал — это норма жизни, не повод тревожиться и не повод менять память. Реагируй только когда из ряда выбивается именно ДЛИННЫЙ тренд.\n` +
    `После выполнения кратко, тепло и понятно подтверди на русском, что именно сделал.\n` +
    `ВАЖНО: подтверждай выполнение ТОЛЬКО если реально вызвал инструмент. Если по какой-то причине не вызвал — не пиши «готово», а честно скажи, что нужно уточнить.\n` +
    STYLE_RULE +
    `\n\nДАННЫЕ ВЛАДЕЛЬЦА (актуальный снимок всего дашборда):\n${snapshot || 'нет данных'}`

  const system = [{ type: 'text', text: cachedBody, cache_control: { type: 'ephemeral' } }]
  if (context) system.push({ type: 'text', text: `Контекст текущей страницы: ${context}` })

  try {
    const client = getClient()
    const prior = Array.isArray(history)
      ? history.filter(m => m && m.text).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))
      : []
    const messages = [...prior, { role: 'user', content: message }]
    const actions = []
    let reply = ''

    for (let step = 0; step < 5; step++) {
      const resp = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system,
        tools: [...EVENT_TOOLS, ROUTE_TOOL, SEND_EMAIL_TOOL, UPDATE_FACT_TOOL],
        messages
      })
      const textPart = resp.content.filter(b => b.type === 'text').map(b => b.text).join(' ').trim()

      if (resp.stop_reason === 'tool_use') {
        const toolResults = []
        for (const block of resp.content) {
          if (block.type === 'tool_use') {
            if (block.name === 'route_eta') {
              // Серверный инструмент: считаем здесь и возвращаем результат модели
              const eta = await yaRouteEta(block.input?.from, block.input?.to)
              let content
              if (!eta.ok && eta.reason === 'no_key') content = 'Маршруты пока недоступны: на сервере не задан ключ Яндекс.Карт.'
              else if (!eta.ok) content = 'Не удалось определить адрес. Попроси уточнить адрес.'
              else content = `Время в пути примерно ${eta.etaMin} мин (~${eta.distanceKm} км)` +
                (eta.traffic ? ' с учётом пробок' : eta.approx ? ' (грубая оценка без точных пробок)' : '') +
                `. Откуда: ${eta.from}. Куда: ${eta.to}.`
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content })
            } else if (block.name === 'send_email') {
              // Клиентское действие с подтверждением: письмо лишь подготовлено, не отправлено
              actions.push({ name: block.name, input: block.input })
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Письмо подготовлено и показано владельцу для подтверждения — он сам нажмёт «Отправить». НЕ утверждай, что письмо уже отправлено; скажи, что подготовил черновик и нужно проверить и отправить.' })
            } else {
              actions.push({ name: block.name, input: block.input })
              toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Выполнено успешно.' })
            }
          }
        }
        messages.push({ role: 'assistant', content: resp.content })
        messages.push({ role: 'user', content: toolResults })
        continue
      }
      reply = textPart
      break
    }

    res.json({ reply: reply || 'Готово.', actions })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Режим чтения: развёрнутый увлекательный ответ + запросы для картинок ---
const ARTICLE_TOOL = [{
  name: 'present_article',
  description: 'Показать владельцу развёрнутый, увлекательный ответ-статью с иллюстрациями.',
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description:
          'Подробный, живой и интересный текст ответа на русском. Предложения КОРОТКИЕ и простые, одна мысль на предложение. ' +
          'Почти без тире «—». БЕЗ смайликов и эмодзи. ' +
          'Разбивай на абзацы ПО СМЫСЛУ: каждая новая мысль или тема — отдельный абзац, между абзацами пустая строка. ' +
          'Разделы можно озаглавить обычной короткой строкой (без markdown, без звёздочек и решёток). По делу, без воды.'
      },
      image_queries: {
        type: 'array',
        items: { type: 'string' },
        description:
          'НЕОБЯЗАТЕЛЬНО. Добавляй картинки ТОЛЬКО когда тема реально визуальная и иллюстрация помогает понять: ' +
          'конкретные места, природа, животные, предметы, известные люди, исторические события, наука. ' +
          'Тогда дай 1–3 коротких КОНКРЕТНЫХ запроса на АНГЛИЙСКОМ (то, что точно есть в помощникапедии), например "Lake Baikal", "Trans-Siberian Railway". ' +
          'Если тема НЕ визуальная (приветствие, болтовня, мнение, совет, абстрактное или личное) — верни ПУСТОЙ массив. Не придумывай картинки ради картинок.'
      }
    },
    required: ['text']
  }
}]

router.post('/read', async (req, res) => {
  const { message, context, history, snapshot } = req.body
  if (!message) return res.status(400).json({ error: 'message required' })
  if (await guestOverDailyLimit(req)) return res.status(200).json(softBlock(GUEST_LIMIT_MSG))
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ text: 'Добавьте ANTHROPIC_API_KEY в .env, и я подробно всё расскажу с картинками.', images: [] })
  }
  const system =
    'Ты — эрудированный и увлекательный рассказчик, личный помощник владельца, пожилого русскоязычного человека. ' +
    'Он спрашивает о чём-то из любопытства или просит посмотреть информацию. ' +
    'Это ПРОДОЛЖАЮЩИЙСЯ разговор: помни, о чём шла речь раньше, и понимай отсылки вроде «покажи эту формулу», «расскажи подробнее про это». ' +
    'Подготовь развёрнутый интересный ответ-статью и подбери к нему запросы для иллюстраций. ' +
    'Дай суть, контекст, любопытные факты, цифры и примеры. Без воды и канцелярита. ' +
    'Если вопрос пустяковый (приветствие, болтовня, короткий вопрос) — ответь коротко и БЕЗ картинок, не раздувай. ' +
    (snapshot
      ? '\n\nУ ТЕБЯ ЕСТЬ ДАННЫЕ ВЛАДЕЛЬЦА (расписание, спорт, здоровье, анализы, память). ' +
        'Если вопрос про его дела, календарь, тренировки, здоровье или анализы — отвечай ПО ЭТИМ ДАННЫМ, а не вообще. ' +
        'Бери существующие события только из раздела РАСПИСАНИЕ, ничего не выдумывай. Картинки для таких личных вопросов не нужны.\n' +
        `\nДАННЫЕ ВЛАДЕЛЬЦА:\n${snapshot}\n`
      : '') +
    '\n\nПРАВДИВОСТЬ (очень важно):\n' +
    '• Пиши ТОЛЬКО то, в чём действительно уверен. НИКОГДА не выдумывай факты, людей, даты, формулы или события.\n' +
    '• Если такого понятия/темы скорее всего не существует, или ты не уверен — честно так и скажи. Лучше признать незнание, чем сочинить.\n' +
    '• Если название похоже на опечатку известного (например «Ньютен» вместо «Ньютон»), но при этом существует и реальный объект с таким именем — НЕ исправляй молча. Коротко предложи оба варианта: «Возможно, вы про X, а может, про Y» — и расскажи про наиболее вероятный. Не отбрасывай реально существующее как «ошибку».\n' +
    '• Если у термина несколько толкований — коротко назови их и расскажи про самое вероятное.\n' +
    '\nТЫ ТОЛЬКО РАССКАЗЫВАЕШЬ И ПОКАЗЫВАЕШЬ информацию. Ты НЕ создаёшь, не переносишь и не удаляешь события и не отправляешь письма/сообщения. ' +
    'Если тебя просят ЧТО-ТО СДЕЛАТЬ («добавь событие», «перенеси встречу», «напомни», «напиши письмо») — НЕ пиши «готово» и не делай вид, что выполняешь. ' +
    'Коротко скажи: чтобы это сделать, повторите задачу в рабочей зоне и нажмите «Выполнить» — помощник создаст это сам. Не давай противоречивых ответов вроде «добавляю, но не умею».\n' +
    'Обязательно вызови инструмент present_article.' +
    (context ? `\n\nКонтекст: ${context}` : '')
  try {
    const client = getClient()
    const prior = Array.isArray(history)
      ? history.filter(m => m && m.text).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))
      : []
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system,
      tools: ARTICLE_TOOL,
      tool_choice: { type: 'tool', name: 'present_article' },
      messages: [...prior, { role: 'user', content: message }]
    })
    const block = resp.content.find(b => b.type === 'tool_use')
    const out = block?.input || {}
    res.json({ text: out.text || '', images: Array.isArray(out.image_queries) ? out.image_queries.slice(0, 3) : [] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/analyze-file', async (req, res) => {
  res.json({ result: 'Анализ файлов — в разработке' })
})

router.post('/daily-summary', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ summary: 'Добавьте ANTHROPIC_API_KEY в .env для получения сводки.' })
  }
  try {
    const client = getClient()
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: 'Ты помощник владельца. Составляй краткую мотивирующую сводку дня.',
      messages: [{ role: 'user', content: 'Составь краткую сводку на сегодня.' }]
    })
    res.json({ summary: response.content[0].text })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
