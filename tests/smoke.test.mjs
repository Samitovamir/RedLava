// Does the app stand up at all, for a person who has just arrived.
//
// This is the cheapest test there is and it would have caught two of the four
// regressions from the September rewrite on its own: a page that crashed on a
// reference to a deleted variable, and a login that silently stopped being
// stored. Neither showed up in a build.

import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { startApp } from './helpers/env.mjs'
import { launch, closeBrowser, session, uniqueName, SCREENS } from './helpers/browser.mjs'

let app
before(async () => { app = await startApp(); await launch() }, { timeout: 120000 })
after(async () => { await closeBrowser(); await app?.stop() })

describe('a new account', { timeout: 180000 }, () => {
  test('can register, and every screen renders without errors', async () => {
    const s = await session({ lang: 'ru' })
    try {
      const name = uniqueName('smoke')
      await s.register(name)
      assert.ok(await s.signedIn(), 'registration did not leave a token behind')

      // The login has to survive the trip through localStorage. It silently did
      // not once, because the imported setter was shadowed by a local one.
      const stored = await s.page.evaluate(() => localStorage.getItem('albert-username'))
      assert.equal(stored, name, 'the username was not stored in the browser')

      for (const route of SCREENS) {
        await s.go(route, 3000)
        const body = await s.text()
        assert.ok(body.trim().length > 40, `${route} rendered almost nothing`)
        assert.ok(!body.includes('undefined'), `${route} shows the word undefined`)
        assert.ok(!body.includes('NaN'), `${route} shows NaN`)
        const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
        assert.ok(!overflow, `${route} scrolls sideways`)
      }
      assert.deepEqual(s.errors, [], 'the browser reported errors')
    } finally { await s.close() }
  })

  test('is asked for its own numbers before the diary shows a calorie target', async () => {
    const s = await session({ lang: 'ru' })
    try {
      await s.register(uniqueName('survey'))
      await s.go('/nutrition', 3000)

      const hasSurvey = await s.page.evaluate(() => !!document.querySelector('.ns-card'))
      assert.ok(hasSurvey, 'a brand new account was not asked for its profile')

      // Absurd values used to pass, show a confident target and save.
      await s.fill('.ns-field input', 0, 5)
      await s.fill('.ns-field input', 1, 300)
      await s.fill('.ns-field input', 2, 40)
      const bad = await s.page.evaluate(() => ({
        disabled: document.querySelector('.ns-card button[type="submit"]')?.disabled,
        preview: document.querySelector('.ns-preview')?.innerText || '',
      }))
      assert.equal(bad.disabled, true, 'a 5-year-old 300cm profile could be submitted')
      assert.ok(!/\d{4}/.test(bad.preview), 'a calorie target was shown for impossible numbers')

      await s.fill('.ns-field input', 0, 34)
      await s.fill('.ns-field input', 1, 178)
      await s.fill('.ns-field input', 2, 74)
      const ok = await s.page.evaluate(() => document.querySelector('.ns-card button[type="submit"]')?.disabled)
      assert.equal(ok, false, 'a perfectly ordinary profile was rejected')

      await s.page.click('.ns-card button[type="submit"]')
      await new Promise(r => setTimeout(r, 2000))
      const gone = await s.page.evaluate(() => !document.querySelector('.ns-card'))
      assert.ok(gone, 'the survey stayed on screen after being filled in')
    } finally { await s.close() }
  })
})

describe('both languages', { timeout: 180000 }, () => {
  test('the English UI has no Russian left in it, and the Russian UI is still Russian', async () => {
    const cyrillic = /[А-Яа-яЁё]/
    for (const lang of ['en', 'ru']) {
      const s = await session({ lang })
      try {
        await s.register(uniqueName(`lang${lang}`))
        for (const route of SCREENS) {
          await s.go(route, 3000)
          let body = await s.text()
          // "Русский" is the name of a language in the switcher; it belongs there.
          body = body.replace(/Русский/g, '')
          const found = cyrillic.test(body)
          if (lang === 'en') assert.ok(!found, `${route} still shows Russian in the English UI`)
          else assert.ok(found, `${route} lost its Russian text`)
        }
        assert.deepEqual(s.errors, [], `errors in the ${lang} UI`)
      } finally { await s.close() }
    }
  })
})
