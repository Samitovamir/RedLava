// Puppeteer helpers, with the lessons from doing this by hand baked in.
//
//  • networkidle0 hangs on this app — it polls the API continuously, so the
//    network is never idle. Every navigation is domcontentloaded plus a wait.
//  • Each "person" gets their own browser context. Tabs share localStorage, and
//    two accounts in one context is not two accounts, it is one confused one.
//  • Console errors are collected, not ignored: a page that renders while
//    throwing is a page that is broken.

import puppeteer from 'puppeteer'
import { WEB } from './env.mjs'

let browser = null

export async function launch() {
  browser = await puppeteer.launch({ headless: 'new' })
  return browser
}
export async function closeBrowser() {
  if (browser) { await browser.close(); browser = null }
}

const wait = (ms) => new Promise(r => setTimeout(r, ms))

/** One isolated person: their own storage, their own error log. */
export async function session({ lang = 'ru', width = 1280, height = 900 } = {}) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 1 })

  const errors = []
  page.on('pageerror', e => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`) })

  const go = async (path, settleMs = 2500) => {
    await page.goto(WEB + path, { waitUntil: 'domcontentloaded' })
    await wait(settleMs)
  }

  // The language is normally chosen from the browser locale on the first visit;
  // tests pin it so assertions about wording are stable.
  const setLang = async (l) => { await page.evaluate(x => localStorage.setItem('redlava-lang', x), l) }

  const text = () => page.evaluate(() => document.body.innerText)

  const fill = async (selector, index, value) => {
    // A native setter plus an input event: typing into type=number is unreliable
    // headless, and values ended up concatenated instead of replaced.
    await page.evaluate((sel, i, v) => {
      const el = document.querySelectorAll(sel)[i]
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(el, String(v))
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, selector, index, value)
  }

  const register = async (username, password = 'testpass12345') => {
    await go('/', 1500)
    await page.click('.auth-switch')
    await wait(300)
    const inputs = await page.$$('.auth-input')
    await inputs[0].type(username)
    await inputs[1].type(password)
    await page.click('.auth-btn')
    await wait(3000)
    await setLang(lang)
    return { username, password }
  }

  const signIn = async (username, password) => {
    await go('/', 1500)
    const inputs = await page.$$('.auth-input')
    await inputs[0].type(username)
    await inputs[1].type(password)
    await page.click('.auth-btn')
    await wait(3000)
    await setLang(lang)
  }

  const signedIn = () => page.evaluate(() => !!localStorage.getItem('albert-auth'))
  const onSignInScreen = () => page.evaluate(() => !!document.querySelector('.auth-screen'))

  const close = async () => { await ctx.close() }

  return { page, ctx, errors, go, setLang, text, fill, register, signIn, signedIn, onSignInScreen, close }
}

/** Unique per run, so a leftover store never collides with a fresh test. */
export const uniqueName = (prefix) => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`

export const SCREENS = ['/', '/schedule', '/sport', '/health', '/nutrition', '/settings']
