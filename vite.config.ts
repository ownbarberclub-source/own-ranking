import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/fidelimax-api': {
        target: 'https://api.fidelimax.com.br',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/fidelimax-api/, '')
      }
    }
  }
})
