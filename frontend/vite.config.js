import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Both are overridable so the test suite can run its own pair of servers
    // alongside the ones you already have open, instead of fighting for ports.
    port: Number(process.env.VITE_PORT) || 5173,
    proxy: {
      '/api': process.env.VITE_API_TARGET || 'http://localhost:3001'
    }
  }
})
