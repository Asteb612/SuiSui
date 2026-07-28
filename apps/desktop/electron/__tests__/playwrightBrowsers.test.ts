import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  browsersRoot,
  requiredBrowsers,
  checkBrowsers,
  describeMissingBrowsers,
} from '../services/playwrightBrowsers'

let workspace: string
let cache: string

/** Write a workspace-local playwright-core manifest pinning `revision`. */
function givenPlaywright(revision: string): void {
  const dir = path.join(workspace, 'node_modules', 'playwright-core')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'browsers.json'),
    JSON.stringify({
      browsers: [
        { name: 'chromium', revision },
        { name: 'chromium-headless-shell', revision },
        // Opt-in channels a plain `playwright install` never downloads.
        { name: 'chromium-tip-of-tree', revision: '9999' },
        { name: 'firefox', revision: '1500' },
      ],
    }),
  )
}

/**
 * Pretend a browser build has been downloaded, using Playwright's REAL on-disk
 * naming: dashes in the browser name become underscores in the directory.
 */
function givenInstalled(name: string, revision: string): void {
  fs.mkdirSync(path.join(cache, `${name.replace(/-/g, '_')}-${revision}`), { recursive: true })
}

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'suisui-ws-'))
  cache = fs.mkdtempSync(path.join(os.tmpdir(), 'suisui-browsers-'))
})

afterEach(() => {
  fs.rmSync(workspace, { recursive: true, force: true })
  fs.rmSync(cache, { recursive: true, force: true })
})

describe('browsersRoot', () => {
  it('honours an explicit PLAYWRIGHT_BROWSERS_PATH', () => {
    expect(browsersRoot({ PLAYWRIGHT_BROWSERS_PATH: '/custom/path' })).toBe('/custom/path')
  })

  it('declines to guess when Playwright manages the layout itself', () => {
    // `0` means "next to the package"; reporting a false "missing" would be
    // worse than not checking at all.
    expect(browsersRoot({ PLAYWRIGHT_BROWSERS_PATH: '0' })).toBeNull()
  })

  it('falls back to a per-platform default', () => {
    expect(browsersRoot({})).toContain('ms-playwright')
  })
})

describe('requiredBrowsers', () => {
  it('reads the pinned revision from the workspace’s own playwright-core', () => {
    givenPlaywright('1223')

    const required = requiredBrowsers(workspace, cache)!
    expect(required.map((b) => b.name).sort()).toEqual(['chromium', 'chromium-headless-shell'])
    expect(required[0]!.revision).toBe('1223')
    expect(required[0]!.directory).toBe(path.join(cache, 'chromium-1223'))

    // Playwright stores this one with UNDERSCORES. Matching the manifest name
    // instead would report it missing forever and re-download it every run.
    const shell = required.find((b) => b.name === 'chromium-headless-shell')!
    expect(shell.directory).toBe(path.join(cache, 'chromium_headless_shell-1223'))
  })

  it('ignores tip-of-tree and other channels a plain install never downloads', () => {
    // Treating them as missing would demand an install that never satisfies it.
    givenPlaywright('1223')

    const names = requiredBrowsers(workspace, cache)!.map((b) => b.name)
    expect(names).not.toContain('chromium-tip-of-tree')
    expect(names).not.toContain('firefox')
  })

  it('returns null when the workspace has no Playwright', () => {
    expect(requiredBrowsers(workspace, cache)).toBeNull()
  })

  it('returns null rather than throwing on a corrupt manifest', () => {
    const dir = path.join(workspace, 'node_modules', 'playwright-core')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'browsers.json'), '{ not json')

    expect(requiredBrowsers(workspace, cache)).toBeNull()
  })

  it('accepts a numeric revision, which is how Playwright writes it', () => {
    const dir = path.join(workspace, 'node_modules', 'playwright-core')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'browsers.json'),
      JSON.stringify({ browsers: [{ name: 'chromium', revision: 1223 }] }),
    )

    expect(requiredBrowsers(workspace, cache)![0]!.revision).toBe('1223')
  })
})

describe('checkBrowsers', () => {
  const env = () => ({ PLAYWRIGHT_BROWSERS_PATH: cache })

  it('reports nothing missing when every pinned build is present', () => {
    givenPlaywright('1223')
    givenInstalled('chromium', '1223')
    givenInstalled('chromium-headless-shell', '1223')

    expect(checkBrowsers(workspace, env())).toEqual({ needsInstall: false, missing: [] })
  })

  it('detects a browser that was never installed', () => {
    givenPlaywright('1223')

    const status = checkBrowsers(workspace, env())
    expect(status.needsInstall).toBe(true)
    expect(status.missing.map((b) => b.name).sort()).toEqual([
      'chromium',
      'chromium-headless-shell',
    ])
  })

  it('detects the upgrade case: browsers installed, but for the OLD revision', () => {
    // This is the failure users actually hit — bumping Playwright silently
    // invalidates the builds already on disk, because each version pins one.
    givenPlaywright('1228')
    givenInstalled('chromium', '1223')
    givenInstalled('chromium-headless-shell', '1223')

    const status = checkBrowsers(workspace, env())
    expect(status.needsInstall).toBe(true)
    expect(status.missing[0]!.revision).toBe('1228')
  })

  it('reports a partial install', () => {
    givenPlaywright('1223')
    givenInstalled('chromium', '1223')

    const status = checkBrowsers(workspace, env())
    expect(status.needsInstall).toBe(true)
    expect(status.missing.map((b) => b.name)).toEqual(['chromium-headless-shell'])
  })

  it('never blocks a run when it cannot tell — no Playwright in the workspace', () => {
    const status = checkBrowsers(workspace, env())
    expect(status.needsInstall).toBe(false)
    expect(status.undetectable).toBeTruthy()
  })

  it('never blocks a run when Playwright manages the browser path itself', () => {
    givenPlaywright('1223')

    const status = checkBrowsers(workspace, { PLAYWRIGHT_BROWSERS_PATH: '0' })
    expect(status.needsInstall).toBe(false)
    expect(status.undetectable).toBeTruthy()
  })
})

describe('describeMissingBrowsers', () => {
  it('names the builds so the message is actionable', () => {
    givenPlaywright('1223')

    const message = describeMissingBrowsers(checkBrowsers(workspace, { PLAYWRIGHT_BROWSERS_PATH: cache }))
    expect(message).toContain('chromium (build 1223)')
  })

  it('is empty when there is nothing to install', () => {
    expect(describeMissingBrowsers({ needsInstall: false, missing: [] })).toBe('')
  })
})
