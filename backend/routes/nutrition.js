import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'

/*
  Питание: ИИ подбирает блюда под целевое КБЖУ и вкусы владельца, и пишет рецепты
  с ингредиентами (для недельного списка покупок). Цель КБЖУ считается на фронте
  по профилю + активности; здесь — генерация блюд и рецептов.
*/

const router = Router()
function getClient() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) }

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
  try {
    const client = getClient()
    const brief = prefsBrief(prefs)
    const prompt =
      `Дай подробный рецепт блюда «${dish}» на ${servings} порц. для домашнего приготовления (Россия). ` +
      `Ингредиенты с количествами (число + единица), шаги по порядку простыми словами. ` +
      (brief ? `Учитывай предпочтения: ${brief} ` : '') +
      `Укажи КБЖУ на порцию. Вызови save_recipe.`
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 1500,
      tools: RECIPE_TOOL, tool_choice: { type: 'tool', name: 'save_recipe' },
      messages: [{ role: 'user', content: prompt }]
    })
    const block = resp.content.find(b => b.type === 'tool_use')
    res.json({ ok: true, recipe: block?.input || null })
  } catch (e) {
    res.json({ ok: false, message: String(e?.message || e).slice(0, 150) })
  }
})

export default router
