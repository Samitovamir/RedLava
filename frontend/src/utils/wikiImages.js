// Searching Wikipedia for illustrations by query — no API keys, CORS-friendly (origin=*).
// We take the image from the first matching article. English Wikipedia first (it has more
// photos); if that comes back empty, we try the Russian one.

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

// Return an array of images (one per query), skipping the queries that found nothing.
export async function fetchImagesForQueries(queries = []) {
  const out = []
  const seen = new Set()
  for (const q of queries) {
    try {
      let img = await fromWiki('en', q)
      if (!img) img = await fromWiki('ru', q)
      if (img && !seen.has(img.src)) { seen.add(img.src); out.push(img) }
    } catch { /* skip the ones that failed */ }
  }
  return out
}
