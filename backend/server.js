import app from './app.js'

// Этот файл запускается ТОЛЬКО локально (на Vercel — api/index.js без listen).
// Помечаем процесс как локальный: в демо-режиме (роль guest) дневной лимит ИИ
// снимается ТОЛЬКО здесь, на проде (где этого флага нет) лимит остаётся прежним.
process.env.LOCAL_DEV = '1'

// Локальный запуск (на Vercel используется api/index.js, без listen).
const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Backend запущен: http://localhost:${PORT}`)
})
