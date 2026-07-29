// Auto-managed by SuiSui — do not edit manually
import { defineConfig } from '@playwright/test'
import { defineBddConfig } from 'playwright-bdd'

const testDir = defineBddConfig({
  paths: ['features/**/*.feature'],
  require: ['features/steps/*.ts'],
  missingSteps: 'fail-on-run',
  verbose: true,
})

const rawBaseUrl = process.env.BASE_URL
const baseURL = rawBaseUrl && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawBaseUrl)
  ? `https://${rawBaseUrl}`
  : rawBaseUrl

export default defineConfig({
  testDir,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
})
