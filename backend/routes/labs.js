import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '../authGuard.js'
import { kvGet, kvSet, kvDel } from '../store.js'
import crypto from 'crypto'

/*
  Анализы крови из публичной папки Яндекс.Диска.
  Владелец кидает PDF/фото в свою папку (с подпапками по датам), мы:
   1) читаем публичную папку рекурсивно (без OAuth);
   2) каждый файл разбираем через Claude (vision): извлекаем показатели,
      а дату определяем из НАЗВАНИЯ ПАПКИ (даже если она кривая);
   3) кэшируем результат по пути+дате изменения, чтобы не разбирать повторно.
*/

const router = Router()
const URL_KEY = 'labs:yandex_url'
const YA = 'https://cloud-api.yandex.net/v1/disk/public/resources'

function getClient() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) }

// ВСЕ разобранные анализы лежат в ОДНОМ ключе: { [id]: { modified, report } }.
// Так на чтении не возникает «бурста» из 69 одновременных запросов к Upstash
// (из-за чего на бесплатном тарифе часть ответов терялась и файлы разбирались заново).
// id для файлов Яндекс.Диска = путь файла; для ручной загрузки = 'upload:<md5 содержимого>'.
const STORE_KEY = 'labs:store'
async function loadStore() { return (await kvGet(STORE_KEY)) || {} }
async function saveStore(s) { await kvSet(STORE_KEY, s) }
// Старый формат — по одному ключу на файл. Используем для разовой миграции, чтобы
// уже разобранные файлы не пришлось гонять через ИИ повторно.
const oldKey = (path, modified) => 'labs:parsed:' + crypto.createHash('md5').update(path + '|' + (modified || '')).digest('hex')

// Рекурсивный обход публичной папки → плоский список файлов (pdf/изображения)
async function listFiles(publicKey, path = '', depth = 0, acc = []) {
  if (depth > 3) return acc
  const u = `${YA}?public_key=${encodeURIComponent(publicKey)}${path ? `&path=${encodeURIComponent(path)}` : ''}&limit=200`
  const r = await fetch(u)
  if (!r.ok) return acc
  const data = await r.json()
  const folderName = data.name || ''
  const items = data._embedded?.items || []
  for (const it of items) {
    if (it.type === 'dir') {
      await listFiles(publicKey, it.path, depth + 1, acc)
    } else if (it.type === 'file') {
      const mime = it.mime_type || ''
      const isDoc = /pdf/i.test(mime) || /image\//i.test(mime) || /\.(pdf|jpe?g|png|heic)$/i.test(it.name)
      if (isDoc) acc.push({ name: it.name, path: it.path, folder: folderName, modified: it.modified || it.created || '', mime, size: it.size || 0 })
    }
  }
  return acc
}

// Получить ссылку на скачивание файла из публичной папки
async function downloadHref(publicKey, path) {
  const r = await fetch(`${YA}/download?public_key=${encodeURIComponent(publicKey)}&path=${encodeURIComponent(path)}`)
  if (!r.ok) return null
  return (await r.json()).href || null
}

const EXTRACT_TOOL = [{
  name: 'save_labs',
  description: 'Сохранить извлечённые показатели анализа крови.',
  input_schema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'Дата анализа в формате YYYY-MM-DD. Определи её по НАЗВАНИЮ ПАПКИ (может быть кривым: «28.04-5.05», «анализы март» и т.п.) или по дате внутри документа. Если диапазон — возьми конечную дату.' },
      lab: { type: 'string', description: 'Название лаборатории/клиники, если видно (иначе пустая строка).' },
      kind: { type: 'string', description: 'Краткий тип исследования: общий анализ, биохимия, гормоны, витамины и т.п.' },
      values: {
        type: 'object',
        description: 'Показатели: ключ — стандартное русское название показателя. Значение — объект {v, unit, min, max}: v — число (результат), unit — единицы измерения, min/max — границы нормы ИЗ ДОКУМЕНТА (если указаны; иначе не заполняй). Бери только реально присутствующие числовые показатели. Если это не анализ — пустой объект.',
        additionalProperties: {
          type: 'object',
          properties: {
            v: { type: 'number', description: 'Результат (число)' },
            unit: { type: 'string', description: 'Единицы измерения' },
            min: { type: 'number', description: 'Нижняя граница нормы из документа' },
            max: { type: 'number', description: 'Верхняя граница нормы из документа' }
          },
          required: ['v']
        }
      }
    },
    required: ['date', 'values']
  }
}]

const MARKER_HINT =
  'Стандартизуй названия: Гемоглобин, Эритроциты, Лейкоциты, Тромбоциты, СОЭ, Гематокрит,' +
  'Глюкоза, Холестерин общий, ЛПНП, ЛПВП, Триглицериды, Креатинин, Мочевина, АЛТ, АСТ, Билирубин общий, ' +
  'Витамин D, Витамин B12, Фолиевая кислота, Ферритин, Железо, ТТГ, Т4 свободный, Тестостерон, Кортизол, СРБ, Калий, Натрий, Магний.'

// Разобрать буфер файла через Claude (vision) — общая логика для Яндекс.Диска и ручной загрузки
async function parseBuffer(buf, { name = '', mime = '', folder = '' }) {
  if (buf.length > 9_000_000) return null   // слишком большой — пропускаем
  const b64 = buf.toString('base64')
  const isPdf = /pdf/i.test(mime) || /\.pdf$/i.test(name)
  const media = isPdf ? 'application/pdf'
    : /png/i.test(mime) ? 'image/png'
    : 'image/jpeg'
  const docBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: media, data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: media, data: b64 } }

  const client = getClient()
  const resp = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    tools: EXTRACT_TOOL,
    tool_choice: { type: 'tool', name: 'save_labs' },
    messages: [{
      role: 'user',
      content: [
        docBlock,
        { type: 'text', text:
          `Это файл анализа крови владельца.${folder ? ` Папка называется: «${folder}».` : ''} ` +
          `Имя файла: «${name}». ` +
          `Извлеки числовые показатели и определи дату. ${MARKER_HINT} ` +
          `Не выдумывай показатели, бери только те, что реально есть в документе. Вызови save_labs.` }
      ]
    }]
  })
  const block = resp.content.find(b => b.type === 'tool_use')
  return block?.input || null
}

// Разобрать один файл из Яндекс.Диска
async function parseFile(file, publicKey) {
  const href = await downloadHref(publicKey, file.path)
  if (!href) return null
  const fr = await fetch(href)
  if (!fr.ok) return null
  const buf = Buffer.from(await fr.arrayBuffer())
  return parseBuffer(buf, { name: file.name, mime: file.mime, folder: file.folder })
}

router.use(requireAuth)

// Подключить/обновить ссылку на публичную папку
router.post('/connect', async (req, res) => {
  const { url } = req.body || {}
  if (!url || !/disk\.yandex/i.test(url)) return res.status(400).json({ ok: false, message: 'Дайте ссылку на публичную папку Яндекс.Диска' })
  await kvSet(URL_KEY, url)
  res.json({ ok: true })
})

router.get('/status', async (_req, res) => {
  const url = await kvGet(URL_KEY)
  res.json({ connected: !!url, url: url || null })
})

router.post('/disconnect', async (_req, res) => {
  await kvDel(URL_KEY)
  res.json({ ok: true })
})

// Список файлов + признак, разобран ли уже (для прогресса на фронте).
// Одно чтение единого хранилища — никаких массовых параллельных запросов.
router.get('/files', async (_req, res) => {
  const url = await kvGet(URL_KEY)
  if (!url) return res.json({ connected: false, files: [] })
  try {
    const files = await listFiles(url)
    const store = await loadStore()
    const withCache = files.map(f => ({ ...f, parsed: store[f.path]?.modified === f.modified }))
    res.json({ connected: true, files: withCache })
  } catch (e) {
    res.json({ connected: true, files: [], error: String(e?.message || e).slice(0, 150) })
  }
})

// Разобрать ОДИН файл (фронт вызывает по очереди — не упираемся в таймаут).
// Результат сохраняется в единое хранилище и больше не теряется при перезапуске.
router.post('/parse', async (req, res) => {
  const url = await kvGet(URL_KEY)
  if (!url) return res.json({ ok: false, connected: false })
  const { path, modified } = req.body || {}
  if (!path) return res.status(400).json({ ok: false, message: 'path required' })
  const store = await loadStore()
  if (store[path]?.modified === modified) return res.json({ ok: true, report: store[path].report, cached: true })
  // Разовая миграция из старого формата (отдельный ключ на файл) — без повторного ИИ
  const migrated = await kvGet(oldKey(path, modified))
  if (migrated) {
    store[path] = { modified, report: migrated }
    await saveStore(store)
    return res.json({ ok: true, report: migrated, cached: true })
  }
  try {
    const files = await listFiles(url)
    const file = files.find(f => f.path === path)
    if (!file) return res.json({ ok: false, message: 'файл не найден' })
    const parsed = await parseFile(file, url)
    if (!parsed) return res.json({ ok: false, message: 'не удалось разобрать' })   // реальный сбой — не кэшируем, можно повторить
    const report = { id: path, date: parsed.date, lab: parsed.lab || '', kind: parsed.kind || '', fileName: file.name, folder: file.folder, values: parsed.values || {} }
    // Сохраняем даже с пустыми показателями (файл не анализ / нет цифр) — чтобы не гонять ИИ повторно
    store[path] = { modified, report }
    await saveStore(store)
    res.json({ ok: true, report })
  } catch (e) {
    res.json({ ok: false, message: String(e?.message || e).slice(0, 150) })
  }
})

// Ручная загрузка файла напрямую (перетащил PDF/фото в окно) — разбираем тем же ИИ,
// без выдумывания. Файл приходит base64. Результат кэшируем по содержимому.
router.post('/upload', async (req, res) => {
  const { name, mime, data } = req.body || {}
  if (!data) return res.status(400).json({ ok: false, message: 'нет файла' })
  try {
    const buf = Buffer.from(data, 'base64')
    const id = 'upload:' + crypto.createHash('md5').update(buf).digest('hex')
    const store = await loadStore()
    if (store[id]) return res.json({ ok: true, report: store[id].report, cached: true })
    const parsed = await parseBuffer(buf, { name: name || 'файл', mime: mime || '' })
    if (!parsed || !Object.keys(parsed.values || {}).length) {
      return res.json({ ok: false, message: 'Не удалось распознать показатели в этом файле' })
    }
    const report = { id, date: parsed.date, lab: parsed.lab || '', kind: parsed.kind || '', fileName: name || 'Загруженный файл', values: parsed.values }
    store[id] = { modified: id, report }
    await saveStore(store)
    res.json({ ok: true, report })
  } catch (e) {
    res.json({ ok: false, message: String(e?.message || e).slice(0, 150) })
  }
})

// Все разобранные отчёты, объединённые по дате (формат фронта: {date, values}).
// Берём из единого хранилища — и Яндекс.Диск, и ручные загрузки.
router.get('/reports', async (_req, res) => {
  const url = await kvGet(URL_KEY)
  try {
    const store = await loadStore()
    const entries = Object.values(store).map(e => e.report).filter(r => r && r.date && Object.keys(r.values || {}).length)
    // Объединяем по дате: значения из всех файлов одной даты в один отчёт
    const byDate = {}
    entries.forEach(r => {
      byDate[r.date] ||= { id: r.date, date: r.date, fileName: r.fileName, values: {} }
      Object.assign(byDate[r.date].values, r.values)
    })
    const reports = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
    res.json({ connected: !!url, reports, parsed: entries.length })
  } catch (e) {
    res.json({ connected: !!url, reports: [], error: String(e?.message || e).slice(0, 150) })
  }
})

export default router
