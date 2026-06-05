import { Router } from 'express'

const router = Router()

router.get('/workouts', async (req, res) => {
  if (!process.env.GARMIN_EMAIL) {
    return res.json({ workouts: [], message: 'Garmin не настроен' })
  }
  res.json({ workouts: [] })
})

router.get('/stats', async (req, res) => {
  if (!process.env.GARMIN_EMAIL) {
    return res.json({ stats: null, message: 'Garmin не настроен' })
  }
  res.json({ stats: null })
})

export default router
