import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '../authGuard.js'
import { kvGetScoped, kvSetScoped, kvDelScoped, scopeOf } from '../userScope.js'
import crypto from 'crypto'
import { msg as uiMsg } from '../messages.js'

/*
  Blood tests out of a public Yandex.Disk folder.
  A person drops PDFs/photos into their own folder (with subfolders per date), and we:
   1) read the public folder recursively (no OAuth);
   2) parse each file with Claude (vision): pull out the markers, while taking
      the date from the FOLDER NAME (however mangled that name is);
   3) cache the result by path + modification date, so nothing is parsed twice.
*/

const router = Router()
const URL_KEY = 'labs:yandex_url'
const YA = 'https://cloud-api.yandex.net/v1/disk/public/resources'

// The blood-test folder is PER PERSON, and it is supplied through the interface (/connect).
// The owner's actual link used to be hard-coded here, and that was a leak: a public
// Yandex.Disk share of somebody's blood tests, sitting in an open repository. No links
// in the code and nothing inherited — only what the person entered themselves.
async function getUrl(userId) {
  if (!userId) return null
  return (await kvGetScoped(URL_KEY, userId)) || null
}

function getClient() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) }

// ALL parsed blood tests live under ONE key: { [id]: { modified, report } }.
// That keeps a read from bursting into 69 simultaneous requests to Upstash (on the free
// tier some of those responses were dropped, and the files got parsed all over again).
// The id for Yandex.Disk files is the file path; for a manual upload, 'upload:<md5 of the contents>'.
const STORE_KEY = 'labs:store'
async function loadStore(userId) { return (await kvGetScoped(STORE_KEY, userId)) || {} }
async function saveStore(userId, s) { await kvSetScoped(STORE_KEY, userId, s) }
// The old format used one key per file. Kept for a one-off migration, so that files
// already parsed don't have to be run through the AI a second time.

// Walk the public folder recursively → a flat list of files (pdf/images)
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

// Get a download link for a file inside the public folder
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
      date: { type: 'string', description: 'Дата анализа в формате YYYY-MM-DD. ГЛАВНЫЙ источник — реальная дата ВЗЯТИЯ биоматериала из самого документа («Дата взятия биоматериала», «Дата взятия», иначе «Дата» / дата выполнения). Имя папки («28.04-5.05», «анализы март» и т.п.) — лишь ЗАПАСНОЙ ориентир, если в документе даты нет вообще; только тогда для диапазона бери конечную дату. НЕ подменяй реальную дату документа датой из имени папки — иначе один забор разъедется на разные даты.' },
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

// Parse a file buffer with Claude (vision) — the logic shared by Yandex.Disk and manual uploads
async function parseBuffer(buf, { name = '', mime = '', folder = '' }) {
  if (buf.length > 9_000_000) return null   // too large — skip it
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
          `Это файл анализа крови пользователя.${folder ? ` Папка называется: «${folder}».` : ''} ` +
          `Имя файла: «${name}». ` +
          `Извлеки числовые показатели и определи дату. Дату бери из САМОГО документа (дата взятия биоматериала); имя папки — только запасной ориентир, если даты в документе нет. ${MARKER_HINT} ` +
          `Не выдумывай показатели, бери только те, что реально есть в документе. Вызови save_labs.` }
      ]
    }]
  })
  const block = resp.content.find(b => b.type === 'tool_use')
  return block?.input || null
}

// Parse a single file from Yandex.Disk
async function parseFile(file, publicKey) {
  const href = await downloadHref(publicKey, file.path)
  if (!href) return null
  const fr = await fetch(href)
  if (!fr.ok) return null
  const buf = Buffer.from(await fr.arrayBuffer())
  return parseBuffer(buf, { name: file.name, mime: file.mime, folder: file.folder })
}

router.use(requireAuth)

// Connect or update the link to the public folder
router.post('/connect', async (req, res) => {
  const { url } = req.body || {}
  if (!url || !/disk\.yandex/i.test(url)) return res.status(400).json({ ok: false, message: uiMsg(req, 'labsBadUrl') })
  await kvSetScoped(URL_KEY, scopeOf(req), url)
  res.json({ ok: true })
})

router.get('/status', async (req, res) => {
  const url = await getUrl(scopeOf(req))
  res.json({ connected: !!url, url: url || null })
})

// Disconnects YOUR OWN integration: the key carries the data owner's id, so nobody else's can be touched.
// A guest has no business here (they have no slot of their own) — app.js turns them away as well.
router.post('/disconnect', async (req, res) => {
  if (!scopeOf(req)) return res.status(403).json({ error: 'forbidden' })
  await kvDelScoped(URL_KEY, scopeOf(req))
  res.json({ ok: true })
})

// The list of files plus a flag for whether each is already parsed (feeds the frontend's progress).
// One read of the single store — no swarm of parallel requests.
router.get('/files', async (req, res) => {
  const userId = scopeOf(req)
  const url = await getUrl(userId)
  if (!url) return res.json({ connected: false, files: [] })
  try {
    const files = await listFiles(url)
    const store = await loadStore(userId)
    const withCache = files.map(f => ({ ...f, parsed: store[f.path]?.modified === f.modified }))
    res.json({ connected: true, files: withCache })
  } catch (e) {
    res.json({ connected: true, files: [], error: String(e?.message || e).slice(0, 150) })
  }
})

// Parse ONE file (the frontend calls this one at a time, so we never run into the timeout).
// The result is saved into the single store and is no longer lost across a restart.
router.post('/parse', async (req, res) => {
  const userId = scopeOf(req)
  const url = await getUrl(userId)
  if (!url) return res.json({ ok: false, connected: false })
  const { path, modified } = req.body || {}
  if (!path) return res.status(400).json({ ok: false, message: 'path required' })
  const store = await loadStore(userId)
  if (store[path]?.modified === modified) return res.json({ ok: true, report: store[path].report, cached: true })
  try {
    const files = await listFiles(url)
    const file = files.find(f => f.path === path)
    if (!file) return res.json({ ok: false, message: uiMsg(req, 'labsNoFile') })
    const parsed = await parseFile(file, url)
    if (!parsed) return res.json({ ok: false, message: uiMsg(req, 'labsUnparsed') })   // a real failure — don't cache it, a retry is possible
    const report = { id: path, date: parsed.date, lab: parsed.lab || '', kind: parsed.kind || '', fileName: file.name, folder: file.folder, values: parsed.values || {} }
    // Save it even with no markers (the file isn't a blood test / has no numbers) — so the AI isn't run again
    store[path] = { modified, report }
    await saveStore(userId, store)
    res.json({ ok: true, report })
  } catch (e) {
    res.json({ ok: false, message: String(e?.message || e).slice(0, 150) })
  }
})

// A file uploaded by hand (a PDF/photo dragged into the window) — parsed by the same AI,
// with nothing invented. The file arrives as base64. The result is cached by its contents.
router.post('/upload', async (req, res) => {
  const { name, mime, data } = req.body || {}
  if (!data) return res.status(400).json({ ok: false, message: uiMsg(req, 'labsNoUpload') })
  const userId = scopeOf(req)
  try {
    const buf = Buffer.from(data, 'base64')
    const id = 'upload:' + crypto.createHash('md5').update(buf).digest('hex')
    const store = await loadStore(userId)
    if (store[id]) return res.json({ ok: true, report: store[id].report, cached: true })
    const parsed = await parseBuffer(buf, { name: name || 'файл', mime: mime || '' })
    if (!parsed || !Object.keys(parsed.values || {}).length) {
      return res.json({ ok: false, message: 'Не удалось распознать показатели в этом файле' })
    }
    const report = { id, date: parsed.date, lab: parsed.lab || '', kind: parsed.kind || '', fileName: name || 'Загруженный файл', values: parsed.values }
    store[id] = { modified: id, report }
    await saveStore(userId, store)
    res.json({ ok: true, report })
  } catch (e) {
    res.json({ ok: false, message: String(e?.message || e).slice(0, 150) })
  }
})

// Every parsed report, merged by date (the frontend's format: {date, values}).
// Taken from the single store — both Yandex.Disk and manual uploads.
router.get('/reports', async (req, res) => {
  const userId = scopeOf(req)
  const url = await getUrl(userId)
  try {
    const store = await loadStore(userId)
    const entries = Object.values(store).map(e => e.report).filter(r => r && r.date && Object.keys(r.values || {}).length)
    // Merge by date: the values from every file sharing a date go into one report
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
