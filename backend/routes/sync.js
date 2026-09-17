import { Router } from 'express'
import { kvGet, kvSet, kvDel } from '../store.js'

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

// Стереть общий блок (кнопка «Сбросить все данные» в Settings). Раньше сброс чистил только
// localStorage браузера — сам блоб на сервере переживал, и pullSync() при следующей загрузке
// тихо восстанавливал «стёртые» данные обратно. Примечание: если в этот момент другое открытое
// устройство сделает фоновый push со старым состоянием, блоб может воскреснуть — редкий случай
// при однопользовательском сценарии, не решаем здесь отдельным механизмом блокировки.
router.delete('/state', async (req, res) => {
  if (req.role !== 'owner') return res.json({ ok: true, skipped: 'guest' })
  try { await kvDel(KEY); res.json({ ok: true }) } catch (e) { res.json({ ok: false, message: String(e?.message || e).slice(0, 120) }) }
})

export default router
