import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    'process.env.CDN_STATIC_URL': JSON.stringify(''),
  },
  plugins: [react()],
})
