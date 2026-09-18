/* TEMPLATE for a visual review. Copy it under your own name and edit CONFIG.
   Run it FROM THE frontend FOLDER:  node _review_<yours>.mjs
   The dev server is already up: http://localhost:5173 (vite proxies /api to :3001 itself). */
import puppeteer from 'puppeteer'

const CONFIG = {
  account: { name: 'Ревизор1', password: 'reviewpass123' },  // one of the accounts you were given
  outDir: './temp_screenshots/review',
  prefix: 'agent1',
  lang: 'ru',                       // 'ru' | 'en'
  viewport: { width: 390, height: 844 },   // iPhone 14. For desktop: 1440x900
}

const browser = await puppeteer.launch({ headless: 'new' })
const ctx = await browser.createBrowserContext()      // isolated: its own localStorage
const page = await ctx.newPage()
await page.setViewport({ ...CONFIG.viewport, deviceScaleFactor: 2 })

const problems = []
page.on('pageerror', e => problems.push('JS ERROR: ' + String(e.message).slice(0, 200)))
page.on('console', m => { if (m.type() === 'error') problems.push('CONSOLE: ' + m.text().slice(0, 200)) })

// IMPORTANT: domcontentloaded + a pause. networkidle0 HANGS — the app polls the API constantly.
const go = async (path, waitMs = 2500) => {
  await page.goto('http://localhost:5173' + path, { waitUntil: 'domcontentloaded' })
  await new Promise(r => setTimeout(r, waitMs))
}
const shot = async (name) => {
  const p = `${CONFIG.outDir}/${CONFIG.prefix}-${name}.png`
  await page.screenshot({ path: p })
  console.log('SCREENSHOT:', p)
  return p
}

// sign in
await go('/', 1500)
const inputs = await page.$$('.auth-input')
if (inputs.length) {
  await inputs[0].type(CONFIG.account.name)
  await inputs[1].type(CONFIG.account.password)
  await page.click('.auth-btn')
  await new Promise(r => setTimeout(r, 3000))
}
// language (the app takes it from the browser locale, so set it explicitly)
await page.evaluate((l) => localStorage.setItem('redlava-lang', l), CONFIG.lang)
await go('/', 2500)

// --- your own screens go below ---
await shot('home')

// Handy checks:
//   page text:              await page.evaluate(() => document.body.innerText)
//   content overflowing:    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
//   "undefined" in the UI:  (await page.evaluate(() => document.body.innerText)).includes('undefined')
//   truncated text:         check elements with text-overflow/ellipsis against long values
//   full page:              await page.screenshot({ path, fullPage: true })

console.log('\nPROBLEMS:', problems.length ? problems : 'none')
await browser.close()
