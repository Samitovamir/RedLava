import { Router } from 'express'

const router = Router()

const events = []

router.get('/', (req, res) => {
  const { type } = req.query
  const filtered = type && type !== 'all'
    ? events.filter(e => e.type === type)
    : events
  res.json({ events: filtered })
})

router.post('/', (req, res) => {
  const event = { ...req.body, id: Date.now(), timestamp: new Date().toISOString() }
  events.unshift(event)
  res.json({ success: true, event })
})

export default router
