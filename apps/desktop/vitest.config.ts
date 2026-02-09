import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    include: [
      'electron/__tests__/**/*.test.ts',
      'app/__tests__/**/*.test.ts',
    ],
    environment: 'node',
    environmentMatchGlobs: [
      ['app/__tests__/**', 'jsdom'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['electron/services/**/*.ts', 'app/utils/**/*.ts'],
    },
    alias: {
      '~': resolve(__dirname, './app'),
      '@': resolve(__dirname, './app'),
    },
  },
})
