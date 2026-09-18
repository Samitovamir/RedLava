import { Router } from 'express'
import { kvGetScoped, kvSetScoped, kvDelScoped, scopeOf } from '../userScope.js'

/*
  Syncs data across the devices of ONE person: the schedule, the assistant's memory,
  blood tests, the nutrition profile, the diary and the shopping list.
  Every account has a blob of its own (the key carries its id) — there used to be a single
  blob for the whole app, which would have let two people overwrite each other's data.
  Last-write-wins on updatedAt (no elaborate merge). A guest is not synced.
*/

const router = Router()
const KEY = 'sync:state'

router.get('/state', async (req, res) => {
  const userId = scopeOf(req)
  if (!userId) return res.json({ ok: true, state: null, updatedAt: 0 })   // guest
  try {
    const blob = await kvGetScoped(KEY, userId)
    res.json({ ok: true, state: blob?.state || null, updatedAt: blob?.updatedAt || 0 })
  } catch (e) {
    res.json({ ok: false, state: null, updatedAt: 0, message: String(e?.message || e).slice(0, 120) })
  }
})

router.put('/state', async (req, res) => {
  const userId = scopeOf(req)
  if (!userId) return res.json({ ok: true, skipped: 'guest' })
  const { state, updatedAt } = req.body || {}
  if (!state || typeof state !== 'object') return res.status(400).json({ ok: false, message: 'state required' })
  try {
    await kvSetScoped(KEY, userId, { state, updatedAt: updatedAt || 0 })
    res.json({ ok: true })
  } catch (e) {
    res.json({ ok: false, message: String(e?.message || e).slice(0, 120) })
  }
})

// Wipe the whole blob (the "Reset all data" button in Settings). The reset used to clear the
// browser's localStorage only — the blob on the server survived, and on the next load
// pullSync() quietly restored the "erased" data. Note: if another open device happens to push
// its stale state in that moment, the blob can come back to life — rare enough in a
// single-user scenario that we do not add a locking mechanism for it here.
router.delete('/state', async (req, res) => {
  const userId = scopeOf(req)
  if (!userId) return res.json({ ok: true, skipped: 'guest' })
  try { await kvDelScoped(KEY, userId); res.json({ ok: true }) } catch (e) { res.json({ ok: false, message: String(e?.message || e).slice(0, 120) }) }
})

export default router
