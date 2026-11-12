import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    // 本地开发时把 Function 路由代理到 scripts/mock-function.mjs（需先启动）。
    // 生产构建不受影响；线上走真实 Sites Function。
    proxy: {
      '/functions': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
})
