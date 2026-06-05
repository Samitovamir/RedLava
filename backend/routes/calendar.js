import { Router } from 'express'

const router = Router()

router.get('/events', async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.json({ events: [], message: 'Google Calendar не настроен' })
  }
  res.json({ events: [] })
})

router.post('/create', async (req, res) => {
  res.json({ success: false, message: 'Google Calendar не настроен' })
})

router.get('/callback', async (req, res) => {
  res.send('Google OAuth callback — в разработке')
})

export default router
