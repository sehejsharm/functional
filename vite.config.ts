import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], motion: ['framer-motion'], forms: ['react-hook-form', 'zod', '@hookform/resolvers'] } },
    },
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
