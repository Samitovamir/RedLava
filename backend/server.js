import app from './app.js'

// This file runs ONLY locally (on Vercel it is api/index.js, with no listen).
// Mark the process as local: the daily AI limit in demo mode (the guest role) is
// lifted ONLY here; in production, where this flag is absent, the limit still applies.
process.env.LOCAL_DEV = '1'

// Local startup (on Vercel api/index.js is used instead, with no listen).
const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Backend running: http://localhost:${PORT}`)
})
