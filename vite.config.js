import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/finance-tracker/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs:  ['pdfjs-dist'],
          charts: ['chart.js', 'react-chartjs-2'],
          vendor: ['react', 'react-dom', 'zustand'],
        },
      },
    },
  },
})
