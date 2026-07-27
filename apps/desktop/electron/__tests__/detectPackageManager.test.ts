import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { detectPackageManager, workspaceFilterArgs } = await import(
  '../services/DependencyService'
)
type PackageManager = Awaited<ReturnType<typeof detectPackageManager>>

/**
 * Regression cover for the EUNSUPPORTEDPROTOCOL failure.
 *
 * SuiSui used to hardcode `npm install` in the opened workspace. Opening a
 * pnpm-workspace member (a monorepo's `e2e/` package, say) then failed with:
 *
 *   npm error code EUNSUPPORTEDPROTOCOL
 *   npm error Unsupported URL Type "workspace:": workspace:^
 *
 * because npm cannot parse pnpm's `workspace:` protocol. Detection has to walk
 * UP from the workspace: the lockfile lives at the repo root, and pnpm/yarn
 * refuse to install from inside a sub-package.
 */
describe('detectPackageManager', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'suisui-pm-'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  const write = (relative: string, contents = '') => {
    const target = path.join(root, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, contents)
  }

  it('should detect npm for a standalone project with a package-lock', () => {
    write('package-lock.json', '{}')

    const pm = detectPackageManager(root)

    expect(pm.name).toBe('npm')
    expect(pm.dir).toBe(root)
    expect(pm.isMonorepoRoot).toBe(false)
  })

  it('should default to npm when no lockfile exists at all', () => {
    write('package.json', '{}')

    const pm = detectPackageManager(root)

    expect(pm.name).toBe('npm')
    expect(pm.dir).toBe(root)
  })

  it('should detect pnpm from a lockfile in the workspace itself', () => {
    write('pnpm-lock.yaml')

    const pm = detectPackageManager(root)

    expect(pm.name).toBe('pnpm')
    expect(pm.isMonorepoRoot).toBe(false)
  })

  it('should detect yarn from a lockfile in the workspace itself', () => {
    write('yarn.lock')

    expect(detectPackageManager(root).name).toBe('yarn')
  })

  // The case that produced the original bug report.
  it('should walk up to the monorepo root when a sub-package is opened', () => {
    write('pnpm-lock.yaml')
    write('pnpm-workspace.yaml', "packages:\n  - 'e2e'\n")
    write('e2e/package.json', '{"dependencies":{"@x/shared":"workspace:^"}}')

    const pm = detectPackageManager(path.join(root, 'e2e'))

    expect(pm.name).toBe('pnpm')
    expect(pm.dir).toBe(root)
    expect(pm.isMonorepoRoot).toBe(true)
  })

  it('should walk up for a yarn workspace member too', () => {
    write('yarn.lock')
    write('packages/app/package.json', '{}')

    const pm = detectPackageManager(path.join(root, 'packages/app'))

    expect(pm.name).toBe('yarn')
    expect(pm.dir).toBe(root)
    expect(pm.isMonorepoRoot).toBe(true)
  })

  it("should prefer the sub-package's own lockfile over an ancestor's", () => {
    write('pnpm-lock.yaml')
    write('standalone/package-lock.json', '{}')

    const pm = detectPackageManager(path.join(root, 'standalone'))

    expect(pm.name).toBe('npm')
    expect(pm.isMonorepoRoot).toBe(false)
  })

  // pnpm-workspace.yaml is checked before pnpm-lock.yaml, so a freshly cloned
  // monorepo with no lockfile yet is still detected as pnpm rather than npm.
  it('should detect pnpm from the workspace manifest with no lockfile present', () => {
    write('pnpm-workspace.yaml', "packages:\n  - 'e2e'\n")
    write('e2e/package.json', '{}')

    const pm = detectPackageManager(path.join(root, 'e2e'))

    expect(pm.name).toBe('pnpm')
    expect(pm.dir).toBe(root)
  })
})

/**
 * Opening `repo/e2e` means wanting to run that project's tests. The install
 * must still run from the repo root, but pulling in every sibling's
 * dependencies (and their postinstall scripts) is wasted work.
 */
describe('workspaceFilterArgs', () => {
  const member = (name: PackageManager['name']): PackageManager => ({
    name,
    dir: '/repo',
    isMonorepoRoot: true,
  })
  const standalone = (name: PackageManager['name']): PackageManager => ({
    name,
    dir: '/repo',
    isMonorepoRoot: false,
  })

  it('scopes a pnpm install to the package and its workspace dependencies', () => {
    // The trailing "..." is load-bearing: it keeps `workspace:` links resolvable.
    expect(workspaceFilterArgs(member('pnpm'), '@autoriz/e2e', false)).toEqual([
      '--filter',
      '@autoriz/e2e...',
    ])
  })

  it('scopes an npm install with --workspace', () => {
    expect(workspaceFilterArgs(member('npm'), '@autoriz/e2e', false)).toEqual([
      '--workspace',
      '@autoriz/e2e',
    ])
  })

  it('does not scope yarn, which has no dependable per-workspace install', () => {
    expect(workspaceFilterArgs(member('yarn'), '@autoriz/e2e', false)).toEqual([])
  })

  it('does not scope when the opened workspace is itself the install root', () => {
    expect(workspaceFilterArgs(standalone('pnpm'), '@autoriz/e2e', false)).toEqual([])
  })

  it('falls back to a full install when the package has no name to filter on', () => {
    expect(workspaceFilterArgs(member('pnpm'), null, false)).toEqual([])
  })

  // Regression: a root "postinstall" that builds sibling packages
  // (`pnpm --filter @autoriz/shared run build && ...`) reaches outside the
  // opened package's closure. Scoping prunes those siblings' dependencies and
  // then runs a script that needs them — the build dies on a missing module and
  // leaves a dangling symlink behind.
  it('does not scope when the install root has lifecycle scripts', () => {
    expect(workspaceFilterArgs(member('pnpm'), '@autoriz/e2e', true)).toEqual([])
    expect(workspaceFilterArgs(member('npm'), '@autoriz/e2e', true)).toEqual([])
  })
})
