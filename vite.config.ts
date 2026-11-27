import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Rutas relativas: funciona en GitHub Pages (/lector-pdf/) y en cualquier hosting
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
})
