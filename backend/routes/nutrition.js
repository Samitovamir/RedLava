import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { kvGet, kvSet } from '../store.js'

/*
  Питание: ИИ подбирает блюда под целевое КБЖУ и вкусы владельца, и пишет рецепты
  с ингредиентами (для недельного списка покупок). Цель КБЖУ считается на фронте
  по профилю + активности; здесь — генерация блюд и рецептов.
*/

const router = Router()
function getClient() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) }

// Кухня владельца и стиль блюд — общие ограничения для подбора и рецептов
const KITCHEN = 'Важно: у владельца НЕТ духовки — есть конвектомат (пароконвектомат) и обычная плита со сковородой/кастрюлей. ' +
  'Если нужно запекание — пиши «конвектомат» (НЕ «духовка»). Блюда и рецепты — простые, домашние, привычные; ' +
  'без высокой/ресторанной кухни, без редких или дорогих экзотических ингредиентов.'

// Собираем вкусовые предпочтения в текст для промпта (со здравым смыслом!)
function prefsBrief(p) {
  if (!p || typeof p !== 'object') return ''
  const parts = []
  const no = []
  if (p.pork === false) no.push('свинину')
  if (p.beef === false) no.push('говядину')
  if (p.chicken === false) no.push('курицу')
  if (p.fish === false) no.push('рыбу')
  if (p.seafood === false) no.push('морепродукты')
  if (p.dairy === false) no.push('молочные продукты')
  if (p.eggs === false) no.push('яйца')
  if (p.mushrooms === false) no.push('грибы')
  if (no.length) parts.push(`НЕ ест (полностью исключи): ${no.join(', ')}.`)
  if (typeof p.spicy === 'number') {
    const lvl = p.spicy <= 2 ? 'почти не острое' : p.spicy >= 7 ? 'любит острое' : 'умеренно острое'
    parts.push(`Острота: ${p.spicy}/10 (${lvl}). ВАЖНО: не делай острым КАЖДОЕ блюдо — добавляй остроту только там, где это уместно по кухне и в разумной мере.`)
  }
  if (typeof p.sweet === 'number' && p.sweet >= 7) parts.push('Любит сладкое — на завтрак/перекус допустимы полезные сладкие варианты.')
  if (Array.isArray(p.cuisines) && p.cuisines.length) parts.push(`Любимые кухни: ${p.cuisines.join(', ')} (но разнообразь).`)
  if (p.cookTime === 'fast') parts.push('Блюда простые и быстрые (до ~30 минут).')
  if (p.allergies) parts.push(`АЛЛЕРГИЯ — строго исключить: ${p.allergies}.`)
  if (p.avoid) parts.push(`Не любит: ${p.avoid}.`)
  const habits = []
  if (p.coffee && p.coffee !== 'no') habits.push(`кофе (${p.coffee === 'black' ? 'чёрный' : p.coffee === 'milk' ? 'с молоком' : 'с молоком и сахаром'})${p.coffeeCups ? ` ~${p.coffeeCups} чашки/день` : ''}`)
  if (p.proteinBar) habits.push('протеиновые батончики')
  if (p.proteinShake) habits.push('протеиновые коктейли')
  if (habits.length) parts.push(`Регулярно употребляет (это уже в его дне): ${habits.join(', ')}.`)
  if (Array.isArray(p.likes) && p.likes.length) parts.push(`Понравившиеся ранее блюда (ориентируйся на стиль): ${p.likes.slice(-12).join(', ')}.`)
  if (Array.isArray(p.dislikes) && p.dislikes.length) parts.push(`Не понравились ранее (избегай похожего): ${p.dislikes.slice(-12).join(', ')}.`)
  return parts.join(' ')
}

const MEALS_TOOL = [{
  name: 'suggest_meals',
  description: 'Предложить блюда под целевые калории и БЖУ, с учётом вкусов.',
  input_schema: {
    type: 'object',
    properties: {
      meals: {
        type: 'array',
        description: 'Список блюд (3–6 штук).',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Короткое название блюда на русском' },
            short: { type: 'string', description: 'Очень краткое описание (1 строка)' },
            imageQuery: { type: 'string', description: 'Поисковый запрос для фото блюда НА АНГЛИЙСКОМ, 2-4 слова (например "oatmeal banana honey", "buckwheat porridge milk")' },
            kcal: { type: 'number', description: 'Калории всего варианта (сумма частей)' },
            protein: { type: 'number', description: 'Белки, г (всего)' },
            fat: { type: 'number', description: 'Жиры, г (всего)' },
            carb: { type: 'number', description: 'Углеводы, г (всего)' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Метки: «высокий белок», «быстро», «веган» и т.п.' },
            parts: {
              type: 'array',
              description: 'Если в варианте несколько блюд (например салат + основное) — по одному элементу на блюдо. Если блюдо одно — один элемент или пусто.',
              items: {
                type: 'object',
                properties: {
                  component: { type: 'string', description: 'Тип: Суп / Салат / Основное / Гарнир / Напиток / Десерт' },
                  name: { type: 'string', description: 'Название блюда на русском' },
                  kcal: { type: 'number' }, protein: { type: 'number' }, fat: { type: 'number' }, carb: { type: 'number' }
                },
                required: ['component', 'name', 'kcal']
              }
            }
          },
          required: ['name', 'kcal', 'protein', 'fat', 'carb']
        }
      }
    },
    required: ['meals']
  }
}]

const RECIPE_TOOL = [{
  name: 'save_recipe',
  description: 'Подробный рецепт блюда с ингредиентами и шагами.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      servings: { type: 'number', description: 'Число порций' },
      kcal: { type: 'number' }, protein: { type: 'number' }, fat: { type: 'number' }, carb: { type: 'number' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Ингредиент на русском' },
            qty: { type: 'number', description: 'Количество (число)' },
            unit: { type: 'string', description: 'Единица: г, мл, шт, ст.л., ч.л. и т.п.' }
          },
          required: ['name']
        }
      },
      steps: { type: 'array', items: { type: 'string' }, description: 'Шаги приготовления по порядку' }
    },
    required: ['name', 'ingredients', 'steps']
  }
}]

// Подобрать блюда под цель
router.post('/meals', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.json({ ok: false, message: 'Нет ключа ИИ', meals: [] })
  const { target = {}, mealType = 'обед', prefs = null, likes = [], dislikes = [], count = 5, note = '', exclude = [], components = [], health = '' } = req.body || {}
  try {
    const client = getClient()
    const brief = prefsBrief(prefs)
    const comps = Array.isArray(components) ? components.filter(Boolean) : []
    const compText = comps.length > 1
      ? `Каждый вариант — это НАБОР из нескольких блюд: ${comps.join(' + ')}. По одному блюду на каждый пункт. ` +
        `Заполни parts[] (для каждого блюда: component, название, КБЖУ). В name дай короткое общее название набора. ` +
        `kcal/protein/fat/carb варианта = СУММА частей и должна примерно попадать в цель приёма. `
      : comps.length === 1
        ? `Тип блюда: ${comps[0]}. Одно блюдо на вариант (parts можно из одного элемента). `
        : ''
    const prompt =
      `Подбери ${count} вариантов для приёма пищи «${mealType}» для владельца (взрослый мужчина, триатлет). ` +
      `Целевые ориентиры на этот приём: ~${target.kcal ?? '?'} ккал, белки ~${target.protein ?? '?'} г, жиры ~${target.fat ?? '?'} г, углеводы ~${target.carb ?? '?'} г. ` +
      compText +
      (brief ? `Вкусовые предпочтения: ${brief} ` : '') +
      (likes.length ? `Также любит: ${likes.join(', ')}. ` : '') +
      (dislikes.length ? `Также исключить: ${dislikes.join(', ')}. ` : '') +
      (note ? `Доп. пожелание на сейчас: ${note}. ` : '') +
      (health ? `ТЕКУЩЕЕ СОСТОЯНИЕ ВЛАДЕЛЬЦА (обязательно учти при выборе блюд): ${health} ` : '') +
      (exclude.length ? `НЕ повторяй уже предложенные блюда: ${exclude.slice(-40).join(', ')}. Дай ДРУГИЕ варианты. ` : '') +
      `Блюда реальные, доступные в России, разнообразные, вкусные и полезные для спортсмена. ` +
      KITCHEN + ' ' +
      `Указывай реалистичные КБЖУ порции. Вызови suggest_meals.`
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 4000,
      tools: MEALS_TOOL, tool_choice: { type: 'tool', name: 'suggest_meals' },
      messages: [{ role: 'user', content: prompt }]
    })
    const block = resp.content.find(b => b.type === 'tool_use')
    res.json({ ok: true, meals: block?.input?.meals || [] })
  } catch (e) {
    res.json({ ok: false, message: String(e?.message || e).slice(0, 150), meals: [] })
  }
})

// Рецепт блюда
router.post('/recipe', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.json({ ok: false, message: 'Нет ключа ИИ' })
  const { dish, servings = 1, prefs = null } = req.body || {}
  if (!dish) return res.status(400).json({ ok: false, message: 'dish required' })
  // Кэш рецепта по названию: один раз сгенерировали — дальше из памяти
  const rk = 'nurecipe:v1:' + String(dish).trim().toLowerCase().slice(0, 90) + '|' + servings
  try {
    const cached = await kvGet(rk)
    if (cached) return res.json({ ok: true, recipe: cached, cached: true })
    const client = getClient()
    const brief = prefsBrief(prefs)
    const prompt =
      `Дай подробный рецепт блюда «${dish}» на ${servings} порц. для домашнего приготовления (Россия). ` +
      `Ингредиенты с количествами (число + единица), шаги по порядку простыми словами. ` +
      `Названия ингредиентов — короткие и обобщённые (например «молоко», «куриное филе», «помидор»), без брендов и лишних уточнений. ` +
      KITCHEN + ' ' +
      (brief ? `Учитывай предпочтения: ${brief} ` : '') +
      `Укажи КБЖУ на порцию. Вызови save_recipe.`
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 1500,
      tools: RECIPE_TOOL, tool_choice: { type: 'tool', name: 'save_recipe' },
      messages: [{ role: 'user', content: prompt }]
    })
    const block = resp.content.find(b => b.type === 'tool_use')
    const recipe = block?.input || null
    if (recipe) await kvSet(rk, recipe)   // закрепляем рецепт за блюдом
    res.json({ ok: true, recipe })
  } catch (e) {
    res.json({ ok: false, message: String(e?.message || e).slice(0, 150) })
  }
})

// ── Фото блюд (Unsplash) с кэшем: одно блюдо — один запрос, дальше из KV ──
const UTM = 'utm_source=albert_dashboard&utm_medium=referral'
const normKey = s => 'nuimg:v1:' + String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80)

async function unsplashFor(query) {
  const KEY = process.env.UNSPLASH_ACCESS_KEY
  if (!KEY || !query) return null
  try {
    const u = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query + ' food')}&per_page=1&orientation=landscape&content_filter=high`
    const r = await fetch(u, { headers: { Authorization: `Client-ID ${KEY}`, 'Accept-Version': 'v1' } })
    if (!r.ok) return null
    const d = await r.json()
    const p = d?.results?.[0]
    if (!p) return null
    // По правилам Unsplash: дёргаем download_location (fire-and-forget)
    if (p.links?.download_location) {
      fetch(`${p.links.download_location}&client_id=${KEY}`).catch(() => {})
    }
    return {
      url: p.urls?.small || p.urls?.regular || null,
      thumb: p.urls?.thumb || null,
      author: p.user?.name || '',
      authorUrl: p.user?.links?.html ? `${p.user.links.html}?${UTM}` : '',
      unsplashUrl: p.links?.html ? `${p.links.html}?${UTM}` : 'https://unsplash.com'
    }
  } catch { return null }
}

// Получить картинки для списка блюд. body: { items: [{name, query}] } → { images: { name: {...} } }
router.post('/images', async (req, res) => {
  const { items = [] } = req.body || {}
  if (!process.env.UNSPLASH_ACCESS_KEY) return res.json({ ok: false, images: {} })
  const images = {}
  await Promise.all(items.slice(0, 12).map(async (it) => {
    const name = String(it?.name || '').trim()
    const query = String(it?.query || name).trim()
    if (!name) return
    const k = normKey(query)
    let obj = await kvGet(k)
    if (!obj) {
      obj = await unsplashFor(query)
      if (obj?.url) await kvSet(k, obj)        // закрепляем за блюдом навсегда
    }
    if (obj?.url) images[name] = obj
  }))
  res.json({ ok: true, images })
})

// ── CalAI: читаем скриншот сводки и достаём съеденное за день ──
const INTAKE_TOOL = [{
  name: 'log_intake',
  description: 'Записать оценку КБЖУ съеденного по фотографии еды (или по этикетке/скриншоту).',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Короткое название блюда/приёма (для фото реальной еды), по-русски' },
      kcal: { type: 'number', description: 'Калории: итог за приём (фото еды) или на 100 г (этикетка)' },
      protein: { type: 'number', description: 'Белки, г' },
      fat: { type: 'number', description: 'Жиры, г' },
      carb: { type: 'number', description: 'Углеводы, г' },
      items: {
        type: 'array',
        description: 'Отдельные блюда/продукты на фото с их КБЖУ',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            kcal: { type: 'number' },
            protein: { type: 'number' },
            fat: { type: 'number' },
            carb: { type: 'number' },
            guess: { type: 'boolean', description: 'true, если порция/состав оценены приблизительно' }
          }
        }
      },
      health: { type: 'number', description: 'Полезность блюда ИМЕННО для этого человека с учётом его состояния (целое 1–10), если дан контекст состояния' },
      note: { type: 'string', description: 'Короткий комментарий: что непонятно или на что обратить внимание' }
    },
    required: ['kcal']
  }
}]

// Промпты по режиму. food — фото реальной еды (основной путь, с персональной оценкой полезности
// по состоянию владельца); label — таблица пищевой ценности (числа на 100 г); calai — legacy-скриншот.
const FOOD_PROMPT = (health) =>
  'Это фотография РЕАЛЬНОЙ еды (тарелка/продукты), НЕ скриншот приложения. ' +
  'Определи блюда/продукты, оцени порции и КБЖУ по КАЖДОЙ позиции (items: name, kcal, protein, fat, carb) ' +
  'и суммарно за приём (kcal/protein/fat/carb). Дай короткое название всего приёма (name). ' +
  'Если порция или состав оценены приблизительно — ставь guess=true для такой позиции. ' +
  (health
    ? `Оцени поле health (целое 1–10) — насколько это блюдо уместно ИМЕННО для этого человека ПРЯМО СЕЙЧАС, ` +
      `опираясь на его актуальное состояние: ${health} ` +
      `(например, при высоком холестерине жирное — ниже; после тяжёлой тренировки или при низком восстановлении ` +
      `белок и сложные углеводы — выше; при высоком стрессе/позднем часе тяжёлое — ниже). В note кратко поясни оценку. `
    : '') +
  'Названия — по-русски, кратко. Вызови log_intake.'

const LABEL_PROMPT =
  'Это фотография таблицы «Пищевая ценность» с упаковки. Считай числа КБЖУ НА 100 Г ' +
  '(kcal/protein/fat/carb на 100 г). Если на упаковке только «на порцию» — верни их и отметь в note «на порцию». ' +
  'Название продукта — в поле name, если видно. Вызови log_intake.'

const CALAI_PROMPT =
  'Это скриншот из приложения подсчёта калорий (CalAI и т.п.). Извлеки итог за день: калории и БЖУ ' +
  '(и отдельные позиции, если видно). Вызови log_intake.'

router.post('/intake-image', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.json({ ok: false, message: 'Нет ключа ИИ' })
  const { image, mode = 'food', health = '' } = req.body || {}
  const m = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/.exec(String(image || ''))
  if (!m) return res.status(400).json({ ok: false, message: 'Нужно фото (png/jpg/webp)' })
  const media = m[1] === 'image/jpg' ? 'image/jpeg' : m[1]
  const prompt = mode === 'label' ? LABEL_PROMPT : mode === 'calai' ? CALAI_PROMPT : FOOD_PROMPT(health)
  try {
    const client = getClient()
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 1000,
      tools: INTAKE_TOOL, tool_choice: { type: 'tool', name: 'log_intake' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: media, data: m[3] } },
          { type: 'text', text: prompt }
        ]
      }]
    })
    const block = resp.content.find(b => b.type === 'tool_use')
    res.json({ ok: true, intake: block?.input || null })
  } catch (e) {
    res.json({ ok: false, message: String(e?.message || e).slice(0, 150) })
  }
})

export default router
