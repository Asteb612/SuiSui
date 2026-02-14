import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.features-gen',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  },
})
