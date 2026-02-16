import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/demos',
  testMatch: '*.demo.ts',
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    screenshot: 'off',
    trace: 'off',
  },
})
