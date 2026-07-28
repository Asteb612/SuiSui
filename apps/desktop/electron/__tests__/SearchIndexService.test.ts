import { describe, it, expect, beforeEach, vi } from 'vitest'
import { vol } from 'memfs'
import { SearchIndexService } from '../services/SearchIndexService'
import type { IWorkspaceLocator } from '../services/SearchIndexService'
import { FakeFileWatcher } from './fakes/FakeFileWatcher'

vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs')
  return { default: memfs.vol.promises }
})

const WORKSPACE = '/ws'

function locator(path: string | null = WORKSPACE): IWorkspaceLocator {
  return {
    getPath: () => path,
    getFeaturesDir: async () => 'features',
  }
}

const LOGIN = `@auth
Feature: User login

  @smoke
  Scenario: Successful login
    Given I am on the "/login" page

  Scenario: Failed login
    Given I am on the "/login" page
`

const CHECKOUT = `Feature: Checkout

  @smoke
  Scenario: Successful login
    Given a step

  Scenario Outline: Pay with <method>
    Given a step
    Examples:
      | method |
      | card   |
`

function seed(files: Record<string, string> = { 'features/login.feature': LOGIN }) {
  vol.reset()
  vol.fromJSON(files, WORKSPACE)
}

async function build(files?: Record<string, string>, workspacePath: string | null = WORKSPACE) {
  seed(files)
  const watcher = new FakeFileWatcher()
  const service = new SearchIndexService(watcher, locator(workspacePath))
  await service.rebuild()
  return { service, watcher }
}

describe('SearchIndexService', () => {
  beforeEach(() => {
    vol.reset()
  })

  describe('build', () => {
    it('indexes features and scenarios from a workspace scan', async () => {
      const { service } = await build()
      const status = service.getStatus()
      expect(status.state).toBe('ready')
      expect(status.fileCount).toBe(1)
      expect(status.scenarioCount).toBe(2)
    })

    it('scans nested directories', async () => {
      const { service } = await build({
        'features/a.feature': LOGIN,
        'features/nested/deep/b.feature': CHECKOUT,
      })
      expect(service.getStatus().fileCount).toBe(2)
      expect(service.getStatus().scenarioCount).toBe(4)
    })

    it('ignores non-feature files', async () => {
      const { service } = await build({
        'features/a.feature': LOGIN,
        'features/steps/generic.steps.ts': 'export const x = 1',
        'features/README.md': '# hi',
      })
      expect(service.getStatus().fileCount).toBe(1)
    })

    it('starts watching the features directory', async () => {
      const { watcher } = await build()
      expect(watcher.isWatching).toBe(true)
      expect(watcher.watchedDir).toContain('features')
    })

    it('reports state idle with no workspace open', async () => {
      const { service } = await build({}, null)
      const response = service.search(1, 'login')
      expect(response.status.state).toBe('idle')
      expect(response.results).toEqual([])
      expect(response.totalMatches).toBe(0)
    })

    it('records files that could not be parsed but keeps them name-matchable', async () => {
      const { service } = await build({
        'features/good.feature': LOGIN,
        'features/broken.feature': '@@@\nFeature\n  Scenario\n ???',
      })
      expect(service.getStatus().unparsedFiles).toEqual(['broken.feature'])

      // The other file is unaffected.
      expect(service.search(1, 'login').results.length).toBeGreaterThan(0)

      // The broken file is still findable by its file name.
      const byName = service.search(2, 'broken')
      expect(byName.results.map((r) => r.relativePath)).toContain('broken.feature')
    })

    it('indexes a workspace that only becomes available AFTER startup', async () => {
      // The real startup order: the app boots with no workspace resolved yet
      // (getPath() is null until the renderer calls workspace.get()), so the
      // first rebuild finds nothing. ensureBuilt must pick it up afterwards —
      // without this the index stayed empty for the whole session and every
      // search wrongly reported "no results".
      seed()
      let workspacePath: string | null = null
      const service = new SearchIndexService(new FakeFileWatcher(), {
        getPath: () => workspacePath,
        getFeaturesDir: async () => 'features',
      })

      await service.rebuild()
      expect(service.getStatus().state).toBe('idle')
      expect(service.search(1, 'login').results).toEqual([])

      workspacePath = WORKSPACE
      await service.ensureBuilt()

      expect(service.getStatus().state).toBe('ready')
      expect(service.search(2, 'login').results.length).toBeGreaterThan(0)
    })

    it('ensureBuilt does not rebuild when the workspace is already indexed', async () => {
      const { service } = await build()
      const before = service.getStatus()
      await service.ensureBuilt()
      expect(service.getStatus()).toEqual(before)
    })

    it('ensureBuilt rebuilds when the workspace changed', async () => {
      seed()
      let workspacePath = WORKSPACE
      const service = new SearchIndexService(new FakeFileWatcher(), {
        getPath: () => workspacePath,
        getFeaturesDir: async () => 'features',
      })
      await service.rebuild()
      expect(service.search(1, 'login').results.length).toBeGreaterThan(0)

      vol.reset()
      vol.fromJSON({ 'features/other.feature': 'Feature: Other\n  Scenario: Elsewhere' }, '/ws2')
      workspacePath = '/ws2'
      await service.ensureBuilt()

      expect(service.search(2, 'login').results).toEqual([])
      expect(service.search(3, 'elsewhere').results.length).toBeGreaterThan(0)
    })

    it('clears state when the workspace is closed', async () => {
      const { service } = await build()
      service.clear()
      expect(service.getStatus()).toMatchObject({ state: 'idle', fileCount: 0, scenarioCount: 0 })
    })
  })

  describe('search', () => {
    it('echoes the requestId', async () => {
      const { service } = await build()
      expect(service.search(42, 'login').requestId).toBe(42)
    })

    it('returns nothing for an empty or whitespace-only query', async () => {
      const { service } = await build()
      expect(service.search(1, '').results).toEqual([])
      expect(service.search(2, '   ').results).toEqual([])
      expect(service.search(3, '   ').totalMatches).toBe(0)
    })

    it('finds scenarios by name across multiple files', async () => {
      const { service } = await build({
        'features/login.feature': LOGIN,
        'features/checkout.feature': CHECKOUT,
      })
      const results = service.search(1, 'successful login').results
      const scenarios = results.filter((r) => r.type === 'scenario')
      expect(scenarios).toHaveLength(2)
      expect(new Set(scenarios.map((r) => r.relativePath))).toEqual(
        new Set(['login.feature', 'checkout.feature'])
      )
    })

    it('lists duplicate scenario names separately with disambiguating context', async () => {
      const { service } = await build({
        'features/login.feature': LOGIN,
        'features/checkout.feature': CHECKOUT,
      })
      const scenarios = service.search(1, 'successful login').results.filter((r) => r.type === 'scenario')
      expect(scenarios.map((r) => r.featureName).sort()).toEqual(['Checkout', 'User login'])
      expect(new Set(scenarios.map((r) => r.id)).size).toBe(2)
    })

    it('finds features by name', async () => {
      const { service } = await build()
      const features = service.search(1, 'user login').results.filter((r) => r.type === 'feature')
      expect(features).toHaveLength(1)
      expect(features[0]!.relativePath).toBe('login.feature')
    })

    it('returns a Scenario Outline as exactly one result', async () => {
      const { service } = await build({ 'features/checkout.feature': CHECKOUT })
      const results = service.search(1, 'pay with').results
      expect(results.filter((r) => r.type === 'scenario')).toHaveLength(1)
    })

    it('never returns Examples row values as results', async () => {
      const { service } = await build({ 'features/checkout.feature': CHECKOUT })
      expect(service.search(1, 'card').results).toEqual([])
    })

    it('carries scenarioIndex so the renderer can select the right scenario', async () => {
      const { service } = await build()
      const failed = service.search(1, 'failed login').results.find((r) => r.type === 'scenario')
      expect(failed!.scenarioIndex).toBe(1)
    })

    it('weights features above equally-scoring scenarios', async () => {
      const { service } = await build({ 'features/login.feature': 'Feature: Alpha\n  Scenario: Alpha' })
      const results = service.search(1, 'alpha').results
      expect(results[0]!.type).toBe('feature')
    })

    it('sorts by score descending', async () => {
      const { service } = await build({
        'features/a.feature': 'Feature: A\n  Scenario: Login\n  Scenario: The login page\n  Scenario: Relogin flow',
      })
      const scores = service.search(1, 'login').results.map((r) => r.score)
      expect(scores).toEqual([...scores].sort((a, b) => b - a))
    })

    it('breaks ties deterministically', async () => {
      const files = {
        'features/b.feature': 'Feature: B\n  Scenario: Same name',
        'features/a.feature': 'Feature: A\n  Scenario: Same name',
      }
      const first = (await build(files)).service.search(1, 'same name').results.map((r) => r.id)
      const second = (await build(files)).service.search(1, 'same name').results.map((r) => r.id)
      expect(first).toEqual(second)
    })

    it('truncates at 100 results while reporting the true total', async () => {
      const scenarios = Array.from({ length: 150 }, (_, i) => `  Scenario: Match ${i}`).join('\n')
      const { service } = await build({ 'features/many.feature': `Feature: Many\n${scenarios}` })
      const response = service.search(1, 'match')
      expect(response.results).toHaveLength(100)
      expect(response.totalMatches).toBe(150)
      expect(response.truncated).toBe(true)
    })

    it('does not flag truncation when everything fits', async () => {
      const { service } = await build()
      const response = service.search(1, 'login')
      expect(response.truncated).toBe(false)
      expect(response.totalMatches).toBe(response.results.length)
    })

    it('returns one result per row even when name and tag both match', async () => {
      const { service } = await build({ 'features/a.feature': 'Feature: F\n  @login\n  Scenario: Login' })
      const scenarios = service.search(1, 'login').results.filter((r) => r.type === 'scenario')
      expect(scenarios).toHaveLength(1)
      expect(scenarios[0]!.matchedField).toBe('name')
    })

    it('matches tags, reporting the matched tag', async () => {
      const { service } = await build()
      const result = service.search(1, 'smoke').results.find((r) => r.type === 'scenario')
      expect(result).toBeDefined()
      expect(result!.matchedField).toBe('tag')
      expect(result!.matchedTag).toBe('smoke')
    })

    it('matches tags with or without a leading @', async () => {
      const { service } = await build()
      const withAt = service.search(1, '@smoke').results.map((r) => r.id)
      const withoutAt = service.search(2, 'smoke').results.map((r) => r.id)
      expect(withAt).toEqual(withoutAt)
      expect(withAt.length).toBeGreaterThan(0)
    })

    it('keeps a scenario with an empty name tag-matchable but not name-matchable', async () => {
      const { service } = await build({
        'features/a.feature': 'Feature: F\n  @orphan\n  Scenario:\n    Given a step',
      })
      const byTag = service.search(1, 'orphan').results.filter((r) => r.type === 'scenario')
      expect(byTag).toHaveLength(1)
      expect(byTag[0]!.text).toBe('')
    })

    it('is accent- and case-insensitive', async () => {
      const { service } = await build({ 'features/a.feature': 'Feature: F\n  Scenario: Page de Connexion' })
      expect(service.search(1, 'connexion').results.length).toBeGreaterThan(0)
      expect(service.search(2, 'CONNEXION').results.length).toBeGreaterThan(0)
    })

    it('treats the query as literal text', async () => {
      const { service } = await build()
      expect(() => service.search(1, '.*')).not.toThrow()
      expect(service.search(2, '.*').results).toEqual([])
    })

    it('reports building state while the index is not ready', async () => {
      seed()
      const service = new SearchIndexService(new FakeFileWatcher(), locator())
      const pending = service.rebuild()
      expect(service.getStatus().state).toBe('building')
      await pending
      expect(service.getStatus().state).toBe('ready')
    })
  })

  describe('freshness', () => {
    it('reflects a file changed on disk', async () => {
      const { service, watcher } = await build()
      expect(service.search(1, 'brand new').results).toEqual([])

      vol.fromJSON({ 'features/login.feature': 'Feature: L\n  Scenario: Brand new' }, WORKSPACE)
      watcher.emitChange('login.feature')
      await vi.waitFor(() => expect(service.search(2, 'brand new').results.length).toBeGreaterThan(0))
    })

    it('reflects a file added on disk', async () => {
      const { service, watcher } = await build()
      vol.fromJSON({ 'features/extra.feature': 'Feature: Extra\n  Scenario: Added later' }, WORKSPACE)
      watcher.emitChange('extra.feature')
      await vi.waitFor(() => expect(service.getStatus().fileCount).toBe(2))
      expect(service.search(1, 'added later').results.length).toBeGreaterThan(0)
    })

    it('reflects a file deleted on disk', async () => {
      const { service, watcher } = await build()
      vol.reset()
      vol.fromJSON({ 'features/.keep': '' }, WORKSPACE)
      watcher.emitChange('login.feature')
      await vi.waitFor(() => expect(service.getStatus().fileCount).toBe(0))
      expect(service.search(1, 'login').results).toEqual([])
    })

    it('updates only the changed file, leaving others intact', async () => {
      const { service, watcher } = await build({
        'features/login.feature': LOGIN,
        'features/checkout.feature': CHECKOUT,
      })
      vol.fromJSON({ 'features/login.feature': 'Feature: L\n  Scenario: Rewritten' }, WORKSPACE)
      watcher.emitChange('login.feature')
      await vi.waitFor(() => expect(service.search(1, 'rewritten').results.length).toBeGreaterThan(0))
      expect(service.search(2, 'pay with').results.length).toBeGreaterThan(0)
    })

    it('falls back to a full rescan when the watcher errors', async () => {
      const { service, watcher } = await build()
      vol.fromJSON({ 'features/recovered.feature': 'Feature: R\n  Scenario: Recovered' }, WORKSPACE)
      watcher.emitError()
      await vi.waitFor(() => expect(service.search(1, 'recovered').results.length).toBeGreaterThan(0))
    })

    it('does not loop when the watcher can never be established', async () => {
      // A directory that cannot be watched (permissions, network FS, missing dir)
      // used to error -> rebuild -> re-watch -> error, spinning forever.
      seed()
      const watcher = new FakeFileWatcher()
      let watchAttempts = 0
      const original = watcher.watch.bind(watcher)
      watcher.watch = (dir, onChange, onError) => {
        watchAttempts++
        original(dir, onChange, onError)
        onError(new Error('EPERM'))
      }

      const service = new SearchIndexService(watcher, locator())
      await service.rebuild()
      await vi.waitFor(() => expect(service.getStatus().state).toBe('ready'))

      expect(watchAttempts).toBe(1)
      // The index is still correct, it just stops auto-updating.
      expect(service.search(1, 'login').results.length).toBeGreaterThan(0)
    })

    it('handles a repeated watcher error without re-watching', async () => {
      const { service, watcher } = await build()
      watcher.emitError()
      watcher.emitError()
      watcher.emitError()
      await vi.waitFor(() => expect(service.getStatus().state).toBe('ready'))
      expect(service.search(1, 'login').results.length).toBeGreaterThan(0)
    })

    it('does not flip back to building during an incremental update', async () => {
      const { service, watcher } = await build()
      watcher.emitChange('login.feature')
      expect(service.getStatus().state).toBe('ready')
    })
  })
})
