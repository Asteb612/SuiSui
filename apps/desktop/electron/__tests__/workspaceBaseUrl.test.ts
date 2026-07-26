import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WorkspaceService } from '../services/WorkspaceService'

/**
 * getConfiguredBaseUrl extracts a sensible default Base URL from the workspace's
 * Playwright config (used by the recorder/runner when no global Base URL is set).
 * Uses real temp files since the method reads the config with node:fs.
 */
describe('WorkspaceService.getConfiguredBaseUrl', () => {
  let dir: string
  const svc = new WorkspaceService()

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-baseurl-'))
  })
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const write = (content: string) =>
    fs.writeFileSync(path.join(dir, 'playwright.config.ts'), content, 'utf-8')

  it('prefers webServer.url (the demo workspace shape)', () => {
    write(`import { defineConfig } from '@playwright/test'
const baseURL = process.env.BASE_URL || 'http://localhost:9999'
export default defineConfig({
  use: { baseURL },
  webServer: { command: 'node server.mjs', url: 'http://localhost:5173', reuseExistingServer: true },
})`)
    expect(svc.getConfiguredBaseUrl(dir)).toBe('http://localhost:5173')
  })

  it('falls back to a literal baseURL when no webServer is present', () => {
    write(`export default {
  use: { baseURL: process.env.BASE_URL || 'https://staging.example.com' },
}`)
    expect(svc.getConfiguredBaseUrl(dir)).toBe('https://staging.example.com')
  })

  it('returns null when only an env-based baseURL exists (no literal)', () => {
    write(`export default { use: { baseURL: process.env.BASE_URL } }`)
    expect(svc.getConfiguredBaseUrl(dir)).toBeNull()
  })

  it('returns null when there is no Playwright config', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-empty-'))
    try {
      expect(svc.getConfiguredBaseUrl(empty)).toBeNull()
    } finally {
      fs.rmSync(empty, { recursive: true, force: true })
    }
  })
})
