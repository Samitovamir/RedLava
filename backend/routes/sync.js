import { Router } from 'express'
import { kvGetScoped, kvSetScoped, kvDelScoped, scopeOf } from '../userScope.js'

/*
  Синхронизация данных между устройствами ОДНОГО человека: расписание, память
  ассистента, анализы, профиль питания, дневник и список покупок.
  У каждого аккаунта свой блоб (ключ с его id) — раньше он был один на всё
  приложение, и два человека затирали бы данные друг друга.
  Last-write-wins по updatedAt (без сложного мёржа). Гость не синхронизируется.
*/

const router = Router()
const KEY = 'sync:state'

router.get('/state', async (req, res) => {
  const userId = scopeOf(req)
  if (!userId) return res.json({ ok: true, state: null, updatedAt: 0 })   // гость
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

// Стереть общий блок (кнопка «Сбросить все данные» в Settings). Раньше сброс чистил только
// localStorage браузера — сам блоб на сервере переживал, и pullSync() при следующей загрузке
// тихо восстанавливал «стёртые» данные обратно. Примечание: если в этот момент другое открытое
// устройство сделает фоновый push со старым состоянием, блоб может воскреснуть — редкий случай
// при однопользовательском сценарии, не решаем здесь отдельным механизмом блокировки.
router.delete('/state', async (req, res) => {
  const userId = scopeOf(req)
  if (!userId) return res.json({ ok: true, skipped: 'guest' })
  try { await kvDelScoped(KEY, userId); res.json({ ok: true }) } catch (e) { res.json({ ok: false, message: String(e?.message || e).slice(0, 120) }) }
})

export default router
