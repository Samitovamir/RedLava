import { Router } from 'express'

const router = Router()

router.get('/recovery', async (req, res) => {
  if (!process.env.WHOOP_CLIENT_ID) {
    return res.json({ recovery: null, message: 'Whoop не настроен' })
  }
  res.json({ recovery: null })
})

router.get('/sleep', async (req, res) => {
  if (!process.env.WHOOP_CLIENT_ID) {
    return res.json({ sleep: null, message: 'Whoop не настроен' })
  }
  res.json({ sleep: null })
})

router.get('/metrics', async (req, res) => {
  if (!process.env.WHOOP_CLIENT_ID) {
    return res.json({ metrics: null, message: 'Whoop не настроен' })
  }
  res.json({ metrics: null })
})

export default router
