import { describe, it, expect, beforeEach, vi } from 'vitest'
import { vol } from 'memfs'
import { TagService } from '../services/TagService'
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

  Background:
    Given I am on the "/login" page

  @smoke
  Scenario: Successful login
    Given a step

  Scenario: Failed login
    Given a step
`

const CHECKOUT = `@billing @smoke
Feature: Checkout

  @smoke
  Scenario: Pay by card
    Given a step

  Scenario: Pay by transfer
    Given a step
`

function seed(files: Record<string, string> = { 'features/login.feature': LOGIN }) {
  vol.reset()
  vol.fromJSON(files, WORKSPACE)
}

async function build(files?: Record<string, string>, workspacePath: string | null = WORKSPACE) {
  seed(files)
  const watcher = new FakeFileWatcher()
  const service = new TagService(watcher, locator(workspacePath))
  await service.rebuild()
  return { service, watcher }
}

function tag(service: TagService, name: string) {
  return service.getIndex().tags.find((t) => t.name === name)
}

describe('TagService — index lifecycle', () => {
  beforeEach(() => vol.reset())

  it('builds an index from a workspace scan', async () => {
    const { service } = await build()
    const index = service.getIndex()
    expect(index.state).toBe('ready')
    expect(index.fileCount).toBe(1)
    expect(index.scenarioCount).toBe(2)
  })

  it('scans nested directories', async () => {
    const { service } = await build({
      'features/a.feature': LOGIN,
      'features/nested/deep/b.feature': CHECKOUT,
    })
    expect(service.getIndex().fileCount).toBe(2)
    expect(service.getIndex().scenarioCount).toBe(4)
  })

  it('ignores non-feature files', async () => {
    const { service } = await build({
      'features/a.feature': LOGIN,
      'features/steps/generic.steps.ts': 'export const x = 1',
      'features/README.md': '# hi',
    })
    expect(service.getIndex().fileCount).toBe(1)
  })

  it('reports idle with no workspace open', async () => {
    const { service } = await build({}, null)
    const index = service.getIndex()
    expect(index.state).toBe('idle')
    expect(index.tags).toEqual([])
    expect(index.usages).toEqual({})
  })

  it('reports building while the scan is in flight', async () => {
    seed()
    const service = new TagService(new FakeFileWatcher(), locator())
    const pending = service.rebuild()
    expect(service.getIndex().state).toBe('building')
    await pending
    expect(service.getIndex().state).toBe('ready')
  })

  it('watches the features directory', async () => {
    const { watcher } = await build()
    expect(watcher.isWatching).toBe(true)
    expect(watcher.watchedDir).toContain('features')
  })

  it('clears state when the workspace closes', async () => {
    const { service } = await build()
    service.clear()
    expect(service.getIndex()).toMatchObject({ state: 'idle', fileCount: 0, scenarioCount: 0 })
  })

  it('indexes a workspace that only becomes available AFTER startup', async () => {
    // The restore-from-settings path: getPath() is null at boot, so the first
    // build finds nothing. ensureBuilt must pick it up once it appears.
    seed()
    let workspacePath: string | null = null
    const service = new TagService(new FakeFileWatcher(), {
      getPath: () => workspacePath,
      getFeaturesDir: async () => 'features',
    })

    await service.rebuild()
    expect(service.getIndex().state).toBe('idle')

    workspacePath = WORKSPACE
    await service.ensureBuilt()
    expect(service.getIndex().state).toBe('ready')
    expect(tag(service, 'smoke')).toBeDefined()
  })
})

describe('TagService — freshness', () => {
  beforeEach(() => vol.reset())

  it('reflects a file changed on disk', async () => {
    const { service, watcher } = await build()
    expect(tag(service, 'brandnew')).toBeUndefined()

    vol.fromJSON({ 'features/login.feature': '@brandnew\nFeature: L\n  Scenario: S' }, WORKSPACE)
    watcher.emitChange('login.feature')
    await vi.waitFor(() => expect(tag(service, 'brandnew')).toBeDefined())
  })

  it('reflects a file added on disk', async () => {
    const { service, watcher } = await build()
    vol.fromJSON({ 'features/extra.feature': '@added\nFeature: E\n  Scenario: S' }, WORKSPACE)
    watcher.emitChange('extra.feature')
    await vi.waitFor(() => expect(service.getIndex().fileCount).toBe(2))
    expect(tag(service, 'added')).toBeDefined()
  })

  it('reflects a file deleted on disk', async () => {
    const { service, watcher } = await build()
    vol.reset()
    vol.fromJSON({ 'features/.keep': '' }, WORKSPACE)
    watcher.emitChange('login.feature')
    await vi.waitFor(() => expect(service.getIndex().fileCount).toBe(0))
    expect(tag(service, 'smoke')).toBeUndefined()
  })

  it('falls back to a single rescan when the watcher errors', async () => {
    const { service, watcher } = await build()
    vol.fromJSON({ 'features/recovered.feature': '@recovered\nFeature: R\n  Scenario: S' }, WORKSPACE)
    watcher.emitError()
    await vi.waitFor(() => expect(tag(service, 'recovered')).toBeDefined())
  })

  it('does not loop when the watcher can never be established', async () => {
    seed()
    const watcher = new FakeFileWatcher()
    let attempts = 0
    const original = watcher.watch.bind(watcher)
    watcher.watch = (dir, onChange, onError) => {
      attempts++
      original(dir, onChange, onError)
      onError(new Error('EPERM'))
    }

    const service = new TagService(watcher, locator())
    await service.rebuild()
    await vi.waitFor(() => expect(service.getIndex().state).toBe('ready'))

    expect(attempts).toBe(1)
    expect(tag(service, 'smoke')).toBeDefined()
  })

  it('notifies subscribers when the index changes', async () => {
    const { service, watcher } = await build()
    const seen: string[] = []
    const unsubscribe = service.onIndexChanged((index) => seen.push(index.state))

    vol.fromJSON({ 'features/login.feature': '@x\nFeature: L\n  Scenario: S' }, WORKSPACE)
    watcher.emitChange('login.feature')
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0))

    unsubscribe()
  })
})

describe('TagService — tag aggregation (US1)', () => {
  beforeEach(() => vol.reset())

  it('counts a feature-level tag for every scenario in that feature', async () => {
    const { service } = await build()
    // login.feature: @auth at feature level, 2 scenarios.
    expect(tag(service, 'auth')).toMatchObject({
      scenarioCount: 2,
      usedAtFeatureLevel: true,
      usedAtScenarioLevel: false,
    })
  })

  it('counts a scenario-level tag only for the scenarios carrying it', async () => {
    const { service } = await build()
    expect(tag(service, 'smoke')).toMatchObject({
      scenarioCount: 1,
      usedAtFeatureLevel: false,
      usedAtScenarioLevel: true,
    })
  })

  it('counts a scenario ONCE when it carries a tag both directly and by inheritance', async () => {
    // checkout.feature declares @smoke at feature level AND on one scenario.
    const { service } = await build({ 'features/checkout.feature': CHECKOUT })
    const smoke = tag(service, 'smoke')!
    expect(smoke.scenarioCount).toBe(2) // both scenarios, not 3
    expect(smoke.usedAtFeatureLevel).toBe(true)
    expect(smoke.usedAtScenarioLevel).toBe(true)

    const usages = service.getIndex().usages['smoke']!
    expect(usages).toHaveLength(2)
    // Direct wins over inherited — it is the removable one.
    expect(usages.find((u) => u.scenarioIndex === 0)!.origin).toBe('direct')
    expect(usages.find((u) => u.scenarioIndex === 1)!.origin).toBe('inherited')
  })

  it('marks a tag on a feature with zero scenarios as orphaned with a count of 0', async () => {
    const { service } = await build({ 'features/empty.feature': '@lonely\nFeature: Nothing here' })
    expect(tag(service, 'lonely')).toMatchObject({ scenarioCount: 0, orphaned: true })
  })

  it('does not mark a used tag as orphaned', async () => {
    const { service } = await build()
    expect(tag(service, 'smoke')!.orphaned).toBe(false)
  })

  it('treats tags differing only by case as distinct', async () => {
    const { service } = await build({
      'features/a.feature': 'Feature: A\n  @Smoke\n  Scenario: One\n  @smoke\n  Scenario: Two',
    })
    expect(tag(service, 'Smoke')!.scenarioCount).toBe(1)
    expect(tag(service, 'smoke')!.scenarioCount).toBe(1)
  })

  it('aggregates the same tag across multiple files', async () => {
    const { service } = await build({
      'features/login.feature': LOGIN,
      'features/checkout.feature': CHECKOUT,
    })
    // login: 1 scenario tagged @smoke; checkout: both scenarios.
    expect(tag(service, 'smoke')!.scenarioCount).toBe(3)
  })

  it('exposes usages with the owning feature, path, and scenario name', async () => {
    const { service } = await build()
    const [usage] = service.getIndex().usages['smoke']!
    expect(usage).toMatchObject({
      relativePath: 'login.feature',
      featureName: 'User login',
      scenarioIndex: 0,
      scenarioName: 'Successful login',
      origin: 'direct',
      id: 'login.feature#0',
    })
  })

  it('includes scenarios with an empty name', async () => {
    const { service } = await build({
      'features/a.feature': 'Feature: F\n  @orphan\n  Scenario:\n    Given a step',
    })
    const usages = service.getIndex().usages['orphan']!
    expect(usages).toHaveLength(1)
    expect(usages[0]!.scenarioName).toBe('')
  })

  it('falls back to the file name when the feature has no Feature: line', async () => {
    const { service } = await build({ 'features/nameless.feature': '  @t\n  Scenario: S' })
    expect(service.getIndex().usages['t']![0]!.featureName).toBe('nameless')
  })

  it('records a file that could not be parsed without losing other files', async () => {
    const { service } = await build({
      'features/good.feature': LOGIN,
      'features/broken.feature': '@@@\nFeature\n  Scenario\n ???',
    })
    expect(service.getIndex().unparsedFiles).toEqual(['broken.feature'])
    expect(tag(service, 'smoke')).toBeDefined()
  })

  it('returns tags sorted deterministically', async () => {
    const files = { 'features/login.feature': LOGIN, 'features/checkout.feature': CHECKOUT }
    const first = (await build(files)).service.getIndex().tags.map((t) => t.name)
    const second = (await build(files)).service.getIndex().tags.map((t) => t.name)
    expect(first).toEqual(second)
  })
})
