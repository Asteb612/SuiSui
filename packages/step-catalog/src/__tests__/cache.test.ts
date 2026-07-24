import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildFingerprint,
  fingerprintsMatch,
  isCacheValid,
  readCache,
  writeCache,
  clearCache,
  cachePath,
  ENGINE_VERSION,
} from '../cache'
import { toPosix } from '../discovery'
import { generateCatalog } from '../catalog'
import type { CacheEnvelope } from '../internal-types'

let ws: string

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), 'suisui-cache-'))
  mkdirSync(join(ws, 'tests', 'steps'), { recursive: true })
  writeFileSync(join(ws, 'package.json'), '{"name":"x"}')
  writeFileSync(
    join(ws, 'tests', 'steps', 'a.steps.ts'),
    `import { createBdd } from 'playwright-bdd'\nconst { Given } = createBdd(test)\nGiven('I am logged in', async ({ page }) => {})\n`,
  )
})
afterEach(() => rmSync(ws, { recursive: true, force: true }))

describe('cache fingerprint (US5)', () => {
  it('matches for identical inputs and busts on content change', () => {
    const fp1 = buildFingerprint({ workspacePath: ws, files: ['tests/steps/a.steps.ts'] })
    const fp2 = buildFingerprint({ workspacePath: ws, files: ['tests/steps/a.steps.ts'] })
    expect(fingerprintsMatch(fp1, fp2)).toBe(true)

    writeFileSync(join(ws, 'tests', 'steps', 'a.steps.ts'), 'changed content')
    const fp3 = buildFingerprint({ workspacePath: ws, files: ['tests/steps/a.steps.ts'] })
    expect(fingerprintsMatch(fp1, fp3)).toBe(false)
  })

  it('busts when the file set changes', () => {
    const fp1 = buildFingerprint({ workspacePath: ws, files: ['tests/steps/a.steps.ts'] })
    const fp2 = buildFingerprint({ workspacePath: ws, files: ['tests/steps/a.steps.ts', 'tests/steps/b.steps.ts'] })
    expect(fingerprintsMatch(fp1, fp2)).toBe(false)
  })

  it('busts when the Playwright config changes', () => {
    writeFileSync(join(ws, 'playwright.config.ts'), 'export default {}')
    const fp1 = buildFingerprint({ workspacePath: ws, files: [], configPath: 'playwright.config.ts' })
    writeFileSync(join(ws, 'playwright.config.ts'), 'export default { workers: 2 }')
    const fp2 = buildFingerprint({ workspacePath: ws, files: [], configPath: 'playwright.config.ts' })
    expect(fingerprintsMatch(fp1, fp2)).toBe(false)
  })

  it('invalidates on schema-version and engine-version mismatch', () => {
    const fp = buildFingerprint({ workspacePath: ws, files: ['tests/steps/a.steps.ts'] })
    const envelope: CacheEnvelope = {
      schemaVersion: 1,
      fingerprint: fp,
      result: {
        schemaVersion: 1,
        steps: [],
        diagnostics: [],
        generatedAt: '2026-01-01T00:00:00.000Z',
        workspacePath: ws,
        analyzedFiles: 1,
        durationMs: 0,
      },
    }
    expect(isCacheValid(envelope, fp, 1)).toBe(true)
    expect(isCacheValid(envelope, fp, 2)).toBe(false)
    const staleEngine = { ...fp, engineVersion: `${ENGINE_VERSION}-old` }
    expect(isCacheValid(envelope, staleEngine, 1)).toBe(false)
  })

  it('normalizes Windows-style paths to POSIX', () => {
    expect(toPosix('tests\\steps\\a.steps.ts')).toBe('tests/steps/a.steps.ts')
  })
})

describe('cache read/write + generate integration (US5)', () => {
  it('writes and re-reads the cache, and guards .app with .gitignore', () => {
    const fp = buildFingerprint({ workspacePath: ws, files: ['tests/steps/a.steps.ts'] })
    writeCache(ws, {
      schemaVersion: 1,
      steps: [],
      diagnostics: [],
      generatedAt: '2026-01-01T00:00:00.000Z',
      workspacePath: ws,
      analyzedFiles: 1,
      durationMs: 0,
    }, fp)
    expect(existsSync(cachePath(ws))).toBe(true)
    expect(readFileSync(join(ws, '.app', '.gitignore'), 'utf8')).toContain('*')
    expect(readCache(ws)?.fingerprint.engineVersion).toBe(ENGINE_VERSION)
    clearCache(ws)
    expect(existsSync(cachePath(ws))).toBe(false)
  })

  it('returns cached result on an unchanged second generate', async () => {
    const first = await generateCatalog({ workspacePath: ws })
    expect(first.steps.length).toBe(1)
    expect(existsSync(cachePath(ws))).toBe(true)

    // Second run with no changes hits the cache: same generatedAt.
    const second = await generateCatalog({ workspacePath: ws })
    expect(second.generatedAt).toBe(first.generatedAt)

    // Editing a file busts the cache (bump mtime + content).
    const f = join(ws, 'tests', 'steps', 'a.steps.ts')
    writeFileSync(
      f,
      `import { createBdd } from 'playwright-bdd'\nconst { Given } = createBdd(test)\nGiven('I am logged out', async ({ page }) => {})\n`,
    )
    const future = new Date(Date.now() + 5000)
    utimesSync(f, future, future)
    const third = await generateCatalog({ workspacePath: ws })
    expect(third.steps[0]?.pattern.source).toBe('I am logged out')
  })
})
