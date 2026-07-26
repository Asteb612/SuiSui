import { defineConfig } from '@playwright/test'
import { defineBddConfig } from 'playwright-bdd'

const testDir = defineBddConfig({
  paths: ['features/'],
  require: ['features/steps/*.ts'],
  missingSteps: 'fail-on-run',
})

// SuiSui passes the workspace Base URL via BASE_URL; fall back to the local
// demo site so `npm test` works standalone too.
const rawBaseUrl = process.env.BASE_URL || 'http://localhost:5173'
const baseURL = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawBaseUrl)
  ? rawBaseUrl
  : `https://${rawBaseUrl}`

export default defineConfig({
  testDir,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  // Auto-start the demo site for test runs. Reused if it's already running
  // (e.g. you started `npm run serve` for the Recorder).
  webServer: {
    command: 'node server.mjs',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
