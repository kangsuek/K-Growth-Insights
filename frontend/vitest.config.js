import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/polyfills.js', './src/test/setup.js'],
    css: true,
    // api.js는 기본 baseURL이 상대경로('/api')라 jsdom origin으로 나가는데,
    // MSW 핸들러는 http://localhost:8000/api 로 등록돼 있어 가로채지 못했다.
    // 테스트에서만 절대 URL을 주입해 두 쪽을 맞춘다.
    env: {
      VITE_API_BASE_URL: 'http://localhost:8000/api',
    },
    environmentOptions: {
      jsdom: {
        resources: 'usable',
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.config.js',
        '**/dist/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
