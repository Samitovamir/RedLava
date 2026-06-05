import app from './app.js'

// Локальный запуск (на Vercel используется api/index.js, без listen).
const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Backend запущен: http://localhost:${PORT}`)
})
