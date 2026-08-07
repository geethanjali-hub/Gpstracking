import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Set base dynamically: '/' for Vercel root deployments, '/gps-app/' for DigitalOcean subpath
export default defineConfig({
  base: process.env.VITE_BASE || '/gps-app/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
