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
            kcal: { type: 'number', description: 'Калории порции' },
            protein: { type: 'number', description: 'Белки, г' },
            fat: { type: 'number', description: 'Жиры, г' },
            carb: { type: 'number', description: 'Углеводы, г' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Метки: «высокий белок», «быстро», «веган» и т.п.' }
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
  const { target = {}, mealType = 'обед', prefs = null, likes = [], dislikes = [], count = 5, note = '', exclude = [] } = req.body || {}
  try {
    const client = getClient()
    const brief = prefsBrief(prefs)
    const prompt =
      `Подбери ${count} блюд для приёма пищи «${mealType}» для владельца (взрослый мужчина, триатлет). ` +
      `Целевые ориентиры на этот приём: ~${target.kcal ?? '?'} ккал, белки ~${target.protein ?? '?'} г, жиры ~${target.fat ?? '?'} г, углеводы ~${target.carb ?? '?'} г. ` +
      (brief ? `Вкусовые предпочтения: ${brief} ` : '') +
      (likes.length ? `Также любит: ${likes.join(', ')}. ` : '') +
      (dislikes.length ? `Также исключить: ${dislikes.join(', ')}. ` : '') +
      (note ? `Доп. пожелание на сейчас: ${note}. ` : '') +
      (exclude.length ? `НЕ повторяй уже предложенные блюда: ${exclude.slice(-40).join(', ')}. Дай ДРУГИЕ варианты. ` : '') +
      `Блюда реальные, доступные в России, разнообразные, вкусные и полезные для спортсмена. ` +
      KITCHEN + ' ' +
      `Указывай реалистичные КБЖУ порции. Вызови suggest_meals.`
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 1500,
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

export default router
