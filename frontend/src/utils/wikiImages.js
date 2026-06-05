// Поиск иллюстраций в Wikipedia по запросу — без ключей, с CORS (origin=*).
// Берём картинку первой подходящей статьи. Сначала англ. вики (там больше фото),
// если пусто — пробуем русскую.

async function fromWiki(lang, query) {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
    `&prop=pageimages&piprop=original|thumbnail&pithumbsize=800` +
    `&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const pages = data?.query?.pages
  if (!pages) return null
  const page = Object.values(pages)[0]
  const src = page?.original?.source || page?.thumbnail?.source
  if (!src) return null
  return { src, title: page.title, caption: query }
}

// Вернуть массив картинок (по одной на запрос), пропуская те, что не нашлись.
export async function fetchImagesForQueries(queries = []) {
  const out = []
  const seen = new Set()
  for (const q of queries) {
    try {
      let img = await fromWiki('en', q)
      if (!img) img = await fromWiki('ru', q)
      if (img && !seen.has(img.src)) { seen.add(img.src); out.push(img) }
    } catch { /* пропускаем неудачные */ }
  }
  return out
}
