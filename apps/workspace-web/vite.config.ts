import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const appDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(appDirectory, '..', '..')
const nextBaseUrl = process.env.SIM_NEXT_BASE_URL ?? 'http://127.0.0.1:3000'
const apiBaseUrl = process.env.SIM_API_BASE_URL ?? 'http://127.0.0.1:3012'
const realtimeBaseUrl = process.env.SIM_REALTIME_BASE_URL ?? 'http://127.0.0.1:3002'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: {
      allow: [repositoryRoot],
    },
    proxy: {
      '/api/workspace-bootstrap': {
        target: apiBaseUrl,
        changeOrigin: false,
      },
      '/api': {
        target: nextBaseUrl,
        changeOrigin: false,
      },
      '/ingest': {
        target: nextBaseUrl,
        changeOrigin: false,
      },
      '/socket.io': {
        target: realtimeBaseUrl,
        changeOrigin: false,
        ws: true,
      },
    },
  },
  build: {
    manifest: true,
    outDir: 'dist',
    sourcemap: true,
  },
})
