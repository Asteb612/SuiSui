import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  retries: 0,
  maxFailures: 1,
  reporter: [['html', { open: 'never' }]],
  use: {
    screenshot: 'only-on-failure',
    trace: 'off',
  },
})
