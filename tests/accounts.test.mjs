// The promises that must never quietly stop being true once real people use this:
// one account cannot see another's data, one person's sign-out does not touch
// anyone else, and the demo account can look but not touch.
//
// These are the invariants the whole September migration was for. Everything else
// in the app can regress and be fixed next week; these cannot.

import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { startApp, API } from './helpers/env.mjs'
import { launch, closeBrowser, session, uniqueName } from './helpers/browser.mjs'

let app
before(async () => { app = await startApp(); await launch() }, { timeout: 120000 })
after(async () => { await closeBrowser(); await app?.stop() })

const post = (path, body, token) => fetch(API + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
})
const get = (path, token) => fetch(API + path, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
})

async function makeAccount(username, password = 'testpass12345') {
  const r = await post('/api/auth/register', { username, password })
  assert.equal(r.status, 200, `registration failed for ${username}`)
  const d = await r.json()
  return { ...d, username, password }
}

describe('logins', { timeout: 60000 }, () => {
  test('a username is taken regardless of case and stray spaces', async () => {
    const name = uniqueName('Dup')
    await makeAccount(name)
    const again = await post('/api/auth/register', { username: `  ${name.toUpperCase()}  `, password: 'otherpass12345' })
    assert.equal(again.status, 409, 'a second account with the same name was created')
    assert.equal((await again.json()).error, 'name_taken')

    // And the original still signs in when typed in a different case.
    const back = await post('/api/auth/login', { username: name.toLowerCase(), password: 'testpass12345' })
    assert.equal(back.status, 200, 'the owner of the name could not sign back in')
  })

  test('the demo account works and carries no account of its own', async () => {
    const r = await post('/api/auth/login', { username: 'guest', password: '123' })
    assert.equal(r.status, 200)
    const d = await r.json()
    assert.equal(d.role, 'guest')
    assert.ok(!d.user, 'the guest was handed an account record')
  })

  test('a wrong password is refused', async () => {
    const a = await makeAccount(uniqueName('wrong'))
    const r = await post('/api/auth/login', { username: a.username, password: 'not-the-password' })
    assert.equal(r.status, 401)
  })
})

describe('isolation', { timeout: 60000 }, () => {
  test('private endpoints refuse an anonymous caller', async () => {
    for (const path of ['/api/garmin/status', '/api/whoop/status', '/api/calendar/status', '/api/sync/state', '/api/auth/verify']) {
      const r = await get(path)
      assert.equal(r.status, 401, `${path} answered ${r.status} without a token`)
    }
  })

  test('one account cannot read another account through the sync blob', async () => {
    const a = await makeAccount(uniqueName('alice'))
    const b = await makeAccount(uniqueName('bob'))

    const secret = { 'albert-events': JSON.stringify([{ id: 'x', title: 'ALICE ONLY' }]) }
    const put = await fetch(API + '/api/sync/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` },
      body: JSON.stringify({ state: secret, updatedAt: Date.now() }),
    })
    assert.equal(put.status, 200)

    const mine = await (await get('/api/sync/state', a.token)).json()
    assert.match(JSON.stringify(mine.state), /ALICE ONLY/, 'the account could not read back its own data')

    const theirs = await (await get('/api/sync/state', b.token)).json()
    assert.ok(!JSON.stringify(theirs.state || {}).includes('ALICE ONLY'), 'another account could read it')
  })

  test('the guest is handed demo stubs, and disconnecting does nothing real', async () => {
    const g = await (await post('/api/auth/login', { username: 'guest', password: '123' })).json()
    const status = await (await get('/api/garmin/status', g.token)).json()
    assert.equal(status.demo, true, 'the guest reached a real integration endpoint')

    const off = await (await post('/api/calendar/disconnect', {}, g.token)).json()
    assert.equal(off.demo, true, 'the guest performed a real disconnect')
  })
})

describe('session revocation', { timeout: 60000 }, () => {
  test('signing out other devices ends this account\'s sessions and nobody else\'s', async () => {
    const a = await makeAccount(uniqueName('revoke'))
    const other = await makeAccount(uniqueName('bystander'))

    // The same person on a second device.
    const second = await (await post('/api/auth/login', { username: a.username, password: a.password })).json()
    assert.equal((await get('/api/auth/verify', second.token)).status, 200)

    const out = await (await post('/api/auth/logout-all', {}, a.token)).json()
    assert.ok(out.ok)
    assert.ok(out.token, 'no fresh token came back, so the device pressing the button is locked out')

    assert.equal((await get('/api/auth/verify', second.token)).status, 401, 'the other device kept working')
    assert.equal((await get('/api/auth/verify', out.token)).status, 200, 'the pressing device was signed out too')
    assert.equal((await get('/api/auth/verify', other.token)).status, 200, 'an unrelated account was signed out')
  })

  test('two accounts on one device do not mix their data', async () => {
    const first = uniqueName('first')
    const second = uniqueName('second')
    const s = await session({ lang: 'ru' })
    try {
      await s.register(first)
      await s.page.evaluate(() => localStorage.setItem('albert-events', JSON.stringify([{ id: 'p', title: 'PRIVATE ONE' }])))

      // Same browser, different person.
      await s.page.evaluate(() => { localStorage.removeItem('albert-auth'); localStorage.removeItem('albert-role') })
      await s.register(second)

      const events = await s.page.evaluate(() => localStorage.getItem('albert-events') || '')
      assert.ok(!events.includes('PRIVATE ONE'), 'the first account\'s data was still in the browser')
      const who = await s.page.evaluate(() => localStorage.getItem('albert-username'))
      assert.equal(who, second, 'the stored username belongs to the wrong account')
    } finally { await s.close() }
  })
})
