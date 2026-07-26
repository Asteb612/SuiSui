import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    // Transform the linked workspace packages instead of externalizing them: their
    // built ESM uses bundler-style (extensionless) imports that Node's ESM loader
    // can't resolve. Inlining lets Vite handle resolution (as it does in the app).
    server: {
      deps: {
        inline: [/@suisui\//],
      },
    },
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
      exclude: [
        // Real browser adapter — driven by a manual/opt-in harness, never exercised
        // in CI (Constitution III: tests never launch a real browser).
        'electron/services/recorder/PlaywrightRecorderAdapter.ts',
        // Interface / type-only modules — no executable logic to cover.
        'electron/services/recorder/IRecorderAdapter.ts',
        'electron/services/recorder/types.ts',
        'electron/services/ai/IAIProvider.ts',
      ],
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
