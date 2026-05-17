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
      reporter: ['text', 'text-summary', 'html', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      reportOnFailure: true,
      include: ['electron/services/**/*.ts', 'app/utils/**/*.ts'],
      // Baseline guardrails (set just below current coverage) so PRs
      // can't silently regress. Ratchet these up as coverage improves.
      thresholds: {
        statements: 70,
        branches: 78,
        functions: 85,
        lines: 70,
      },
    },
    alias: {
      '~': resolve(__dirname, './app'),
      '@': resolve(__dirname, './app'),
    },
  },
})
