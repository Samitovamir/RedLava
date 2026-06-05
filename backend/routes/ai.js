import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'

const router = Router()

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

// --- Предохранитель: лимиты, чтобы случайно не потратить все токены ---
const LIMITS = {
  perMin: Number(process.env.AI_LIMIT_PER_MIN) || 15,
  perHour: Number(process.env.AI_LIMIT_PER_HOUR) || 120,
  perDay: Number(process.env.AI_LIMIT_PER_DAY) || 400,
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
  const { message, context, history, snapshot } = req.body
  if (!message) return res.status(400).json({ error: 'message required' })
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
      max_tokens: 1024,
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
        type: { type: 'string', enum: ['call', 'meeting', 'email', 'calendar'], description: 'Тип: call — звонок, meeting — встреча/личное, email — письмо/задача, calendar — прочее' }
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
    description: 'Запомнить НАДОЛГО важный устойчивый факт или предпочтение об владельце (например «не ставить дела после 21:00», «не любит созвоны по утрам», «аллергия на пыльцу»). Используй, когда он сообщает что-то постоянное о себе. Не запоминай разовые/сиюминутные вещи.',
    input_schema: {
      type: 'object',
      properties: { fact: { type: 'string', description: 'Короткая формулировка факта/предпочтения' } },
      required: ['fact']
    }
  }
]

// Ассистент с инструментами: умеет реально создавать/переносить/удалять события.
// События живут на клиенте, поэтому backend собирает список действий и возвращает их фронту.
router.post('/agent', async (req, res) => {
  const { message, snapshot, history, context } = req.body
  if (!message) return res.status(400).json({ error: 'message required' })
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
    `• Запоминать факты о нём надолго (remember_fact) — когда он сообщает устойчивое предпочтение.\n` +
    `Если просят то, чего пока нет (письмо, WhatsApp, поиск в интернете) — вежливо скажи, что появится скоро, и предложи, что можешь сейчас.\n\n` +
    `ИСТОЧНИК ИСТИНЫ: существующие события бери ТОЛЬКО из раздела РАСПИСАНИЕ снимка. Раздел ЖУРНАЛ ДЕЙСТВИЙ — это история, НЕ текущее расписание; не считай событие существующим и время занятым, если этого события нет в РАСПИСАНИИ. Никогда не выдумывай событий, которых нет в РАСПИСАНИИ.\n\n` +
    `КАК ПОНИМАТЬ ВЛАДЕЛЬЦА:\n` +
    `• Он пишет по-русски, простыми и разными словами, может делать ОПЕЧАТКИ — всё равно пойми смысл и выполни.\n` +
    `• «поставь / запиши / закинь / добавь / напомни / назначь» — создать событие; «перенеси / сдвинь / передвинь» — перенести; «убери / удали / отмени» — удалить.\n` +
    `• Находи событие по смыслу, даже если названо неточно.\n` +
    `• Относительные даты («завтра», «в среду», «через неделю») переводи в YYYY-MM-DD относительно сегодня (см. снимок).\n` +
    `• «утром» ≈ 09:00, «днём» ≈ 13:00, «вечером» ≈ 19:00, если время не названо. Длительность по умолчанию — 1 час.\n` +
    `• Учитывай память и предпочтения (например, не ставить дела после 21:00).\n` +
    `• Если просьба неясна — уточни одним коротким вопросом, не выдумывай.\n\n` +
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
        tools: EVENT_TOOLS,
        messages
      })
      const textPart = resp.content.filter(b => b.type === 'text').map(b => b.text).join(' ').trim()

      if (resp.stop_reason === 'tool_use') {
        const toolResults = []
        for (const block of resp.content) {
          if (block.type === 'tool_use') {
            actions.push({ name: block.name, input: block.input })
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Выполнено успешно.' })
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
          '2–4 коротких КОНКРЕТНЫХ поисковых запроса на АНГЛИЙСКОМ для иллюстраций по теме ' +
          '(конкретные места, объекты, люди, события — то, что реально есть в помощникапедии). Например: "Lake Baikal", "Trans-Siberian Railway".'
      }
    },
    required: ['text', 'image_queries']
  }
}]

router.post('/read', async (req, res) => {
  const { message, context, history } = req.body
  if (!message) return res.status(400).json({ error: 'message required' })
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ text: 'Добавьте ANTHROPIC_API_KEY в .env, и я подробно всё расскажу с картинками.', images: [] })
  }
  const system =
    'Ты — эрудированный и увлекательный рассказчик, личный помощник владельца, пожилого русскоязычного человека. ' +
    'Он спрашивает о чём-то из любопытства или просит посмотреть информацию. ' +
    'Это ПРОДОЛЖАЮЩИЙСЯ разговор: помни, о чём шла речь раньше, и понимай отсылки вроде «покажи эту формулу», «расскажи подробнее про это». ' +
    'Подготовь развёрнутый интересный ответ-статью и подбери к нему запросы для иллюстраций. ' +
    'Дай суть, контекст, любопытные факты, цифры и примеры. Без воды и канцелярита. ' +
    '\n\nПРАВДИВОСТЬ (очень важно):\n' +
    '• Пиши ТОЛЬКО то, в чём действительно уверен. НИКОГДА не выдумывай факты, людей, даты, формулы или события.\n' +
    '• Если такого понятия/темы скорее всего не существует, или ты не уверен — честно так и скажи. Лучше признать незнание, чем сочинить.\n' +
    '• Если название похоже на опечатку известного (например «Ньютен» вместо «Ньютон»), но при этом существует и реальный объект с таким именем — НЕ исправляй молча. Коротко предложи оба варианта: «Возможно, вы про X, а может, про Y» — и расскажи про наиболее вероятный. Не отбрасывай реально существующее как «ошибку».\n' +
    '• Если у термина несколько толкований — коротко назови их и расскажи про самое вероятное.\n' +
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
    res.json({ text: out.text || '', images: Array.isArray(out.image_queries) ? out.image_queries.slice(0, 4) : [] })
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
