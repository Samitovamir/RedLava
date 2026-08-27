import { Router } from 'express'
import { kvGet, kvSet } from '../store.js'

/*
  Синхронизация пользовательских данных между устройствами пользователя.
  Модель — ОДНОПОЛЬЗОВАТЕЛЬСКАЯ: один общий блоб в KV (`sync:albert:state`), чтобы все
  устройства видели одно и то же. Last-write-wins по updatedAt (без сложного мёржа).
  Гость на демо-данных не синхронизируется.
*/

const router = Router()
const KEY = 'sync:albert:state'

router.get('/state', async (req, res) => {
  if (req.role !== 'owner') return res.json({ ok: true, state: null, updatedAt: 0 })
  try {
    const blob = await kvGet(KEY)
    res.json({ ok: true, state: blob?.state || null, updatedAt: blob?.updatedAt || 0 })
  } catch (e) {
    res.json({ ok: false, state: null, updatedAt: 0, message: String(e?.message || e).slice(0, 120) })
  }
})

router.put('/state', async (req, res) => {
  if (req.role !== 'owner') return res.json({ ok: true, skipped: 'guest' })
  const { state, updatedAt } = req.body || {}
  if (!state || typeof state !== 'object') return res.status(400).json({ ok: false, message: 'state required' })
  try {
    await kvSet(KEY, { state, updatedAt: updatedAt || 0 })
    res.json({ ok: true })
  } catch (e) {
    res.json({ ok: false, message: String(e?.message || e).slice(0, 120) })
  }
})

export default router
