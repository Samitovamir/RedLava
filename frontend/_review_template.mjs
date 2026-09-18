/* ШАБЛОН для визуальной проверки. Скопируй под своим именем, поменяй CONFIG.
   Запускать ИЗ ПАПКИ frontend:  node _review_<твоё>.mjs
   Дев-сервер уже поднят: http://localhost:5173 (vite сам проксирует /api на :3001). */
import puppeteer from 'puppeteer'

const CONFIG = {
  account: { name: 'Ревизор1', password: 'reviewpass123' },  // свой из выданных
  outDir: './temp_screenshots/review',
  prefix: 'agent1',
  lang: 'ru',                       // 'ru' | 'en'
  viewport: { width: 390, height: 844 },   // iPhone 14. Для десктопа: 1440x900
}

const browser = await puppeteer.launch({ headless: 'new' })
const ctx = await browser.createBrowserContext()      // изоляция: свой localStorage
const page = await ctx.newPage()
await page.setViewport({ ...CONFIG.viewport, deviceScaleFactor: 2 })

const problems = []
page.on('pageerror', e => problems.push('JS-ОШИБКА: ' + String(e.message).slice(0, 200)))
page.on('console', m => { if (m.type() === 'error') problems.push('CONSOLE: ' + m.text().slice(0, 200)) })

// ВАЖНО: домcontentloaded + пауза. networkidle0 ЗАВИСАЕТ — приложение постоянно опрашивает API.
const go = async (path, waitMs = 2500) => {
  await page.goto('http://localhost:5173' + path, { waitUntil: 'domcontentloaded' })
  await new Promise(r => setTimeout(r, waitMs))
}
const shot = async (name) => {
  const p = `${CONFIG.outDir}/${CONFIG.prefix}-${name}.png`
  await page.screenshot({ path: p })
  console.log('СКРИНШОТ:', p)
  return p
}

// вход
await go('/', 1500)
const inputs = await page.$$('.auth-input')
if (inputs.length) {
  await inputs[0].type(CONFIG.account.name)
  await inputs[1].type(CONFIG.account.password)
  await page.click('.auth-btn')
  await new Promise(r => setTimeout(r, 3000))
}
// язык (приложение берёт из локали браузера, поэтому выставляем явно)
await page.evaluate((l) => localStorage.setItem('redlava-lang', l), CONFIG.lang)
await go('/', 2500)

// --- дальше твои экраны ---
await shot('home')

// Полезные приёмы:
//   текст страницы:      await page.evaluate(() => document.body.innerText)
//   не влез ли контент:  await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
//   «undefined» в UI:    (await page.evaluate(() => document.body.innerText)).includes('undefined')
//   обрезка текста:      проверь элементы с text-overflow/ellipsis на длинных значениях
//   полная страница:     await page.screenshot({ path, fullPage: true })

console.log('\nПРОБЛЕМЫ:', problems.length ? problems : 'нет')
await browser.close()
