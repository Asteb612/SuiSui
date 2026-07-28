import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { TagIndex, TagSummary, TagUsage } from '@suisui/shared'
import { useTagsStore } from '../stores/tags'
import { useScenarioStore } from '../stores/scenario'

const getIndexMock = vi.fn<() => Promise<TagIndex>>()
const applyBulkMock = vi.fn()
const onIndexChangedMock = vi.fn(() => () => {})

function summary(over: Partial<TagSummary> = {}): TagSummary {
  return {
    name: 'smoke',
    scenarioCount: 2,
    usedAtFeatureLevel: false,
    usedAtScenarioLevel: true,
    orphaned: false,
    ...over,
  }
}

function usage(over: Partial<TagUsage> = {}): TagUsage {
  return {
    id: 'a.feature#0',
    relativePath: 'a.feature',
    featureName: 'Auth',
    scenarioIndex: 0,
    scenarioName: 'Successful login',
    origin: 'direct',
    ...over,
  }
}

function index(over: Partial<TagIndex> = {}): TagIndex {
  return {
    state: 'ready',
    tags: [summary()],
    usages: { smoke: [usage()] },
    unparsedFiles: [],
    fileCount: 1,
    scenarioCount: 2,
    ...over,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  getIndexMock.mockResolvedValue(index())
  vi.stubGlobal('window', {
    api: {
      tags: {
        getIndex: getIndexMock,
        applyBulk: applyBulkMock,
        onIndexChanged: onIndexChangedMock,
      },
    },
  })
})

describe('tags store — sorting and filtering', () => {
  const MANY = index({
    tags: [
      summary({ name: 'alpha', scenarioCount: 1 }),
      summary({ name: 'zulu', scenarioCount: 9 }),
      summary({ name: 'mike', scenarioCount: 5 }),
    ],
    usages: { alpha: [], zulu: [], mike: [] },
  })

  it('sorts by count descending by default', async () => {
    getIndexMock.mockResolvedValue(MANY)
    const store = useTagsStore()
    await store.init()
    expect(store.visibleTags.map((t) => t.name)).toEqual(['zulu', 'mike', 'alpha'])
  })

  it('sorts alphabetically when asked', async () => {
    getIndexMock.mockResolvedValue(MANY)
    const store = useTagsStore()
    await store.init()
    store.setSortMode('alpha')
    expect(store.visibleTags.map((t) => t.name)).toEqual(['alpha', 'mike', 'zulu'])
  })

  it('narrows the list by filter text, case-insensitively', async () => {
    getIndexMock.mockResolvedValue(MANY)
    const store = useTagsStore()
    await store.init()
    store.setTagFilter('AL')
    expect(store.visibleTags.map((t) => t.name)).toEqual(['alpha'])
  })

  it('shows an empty state only once the index is ready and truly empty', async () => {
    const store = useTagsStore()
    getIndexMock.mockResolvedValue(index({ tags: [], usages: {} }))
    await store.init()
    expect(store.showEmptyState).toBe(true)

    store.index = { ...store.index, state: 'building' }
    expect(store.showEmptyState).toBe(false)
    expect(store.isIndexing).toBe(true)
  })
})

describe('tags store — selection', () => {
  it('exposes usages for the selected tag', async () => {
    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')
    expect(store.selectedUsages).toHaveLength(1)
    expect(store.selectedSummary?.name).toBe('smoke')
  })

  it('clears scenario selection when the tag changes', async () => {
    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')
    store.toggleScenario('a.feature#0')
    expect(store.selectedScenarioIds).toEqual(['a.feature#0'])

    store.selectTag(null)
    expect(store.selectedScenarioIds).toEqual([])
  })

  it('drops a selected tag that no longer exists after a reindex', async () => {
    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')

    store.index = index({ tags: [], usages: {} })
    store.pruneSelection()
    expect(store.selectedTag).toBeNull()
  })

  it('drops selected scenarios that no longer exist after a reindex', async () => {
    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')
    store.toggleScenario('a.feature#0')

    store.index = index({ usages: { smoke: [] } })
    store.pruneSelection()
    expect(store.selectedScenarioIds).toEqual([])
  })

  it('reports only directly-carried selections as removable', async () => {
    getIndexMock.mockResolvedValue(
      index({
        usages: {
          smoke: [
            usage({ id: 'a.feature#0', origin: 'direct' }),
            usage({ id: 'a.feature#1', scenarioIndex: 1, origin: 'inherited' }),
          ],
        },
      })
    )
    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')
    store.selectAllVisibleScenarios()

    expect(store.selectedScenarioIds).toHaveLength(2)
    expect(store.removableSelection.map((u) => u.id)).toEqual(['a.feature#0'])
  })
})

describe('tags store — unsaved-edit overlay (FR-010)', () => {
  function openDirtyFeature(path = 'a.feature') {
    const scenarioStore = useScenarioStore()
    scenarioStore.currentFeaturePath = path
    scenarioStore.featureName = 'Auth'
    scenarioStore.featureTags = []
    scenarioStore.scenarios = [{ name: 'Renamed scenario', tags: ['smoke'], steps: [] }]
    scenarioStore.isDirty = true
    return scenarioStore
  }

  it('leaves indexed usages untouched when nothing is dirty', async () => {
    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')
    expect(store.selectedUsages[0]!.scenarioName).toBe('Successful login')
  })

  it('replaces the open feature usages with live state', async () => {
    openDirtyFeature()
    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')
    expect(store.selectedUsages.map((u) => u.scenarioName)).toEqual(['Renamed scenario'])
  })

  it('drops a usage whose tag was removed in the editor but not yet saved', async () => {
    const scenarioStore = openDirtyFeature()
    scenarioStore.scenarios = [{ name: 'Untagged now', tags: [], steps: [] }]

    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')
    expect(store.selectedUsages).toEqual([])
  })

  it('reflects an unsaved feature-level tag as inherited on every scenario', async () => {
    const scenarioStore = openDirtyFeature()
    scenarioStore.featureTags = ['smoke']
    scenarioStore.scenarios = [
      { name: 'One', tags: [], steps: [] },
      { name: 'Two', tags: [], steps: [] },
    ]

    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')
    expect(store.selectedUsages).toHaveLength(2)
    expect(store.selectedUsages.every((u) => u.origin === 'inherited')).toBe(true)
  })

  it('keeps usages from other files intact', async () => {
    openDirtyFeature()
    getIndexMock.mockResolvedValue(
      index({
        usages: {
          smoke: [usage(), usage({ id: 'b.feature#0', relativePath: 'b.feature', featureName: 'B' })],
        },
      })
    )
    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')
    expect(store.selectedUsages.map((u) => u.relativePath)).toContain('b.feature')
  })
})

describe('tags store — lifecycle', () => {
  it('unsubscribes on dispose', async () => {
    const unsubscribe = vi.fn()
    onIndexChangedMock.mockReturnValue(unsubscribe)
    const store = useTagsStore()
    await store.init()
    store.dispose()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('resets everything when the workspace changes', async () => {
    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')
    store.setTagFilter('sm')

    store.reset()
    expect(store.selectedTag).toBeNull()
    expect(store.tagFilter).toBe('')
    expect(store.index.tags).toEqual([])
  })
})

describe('tags store — bulk flow (US3)', () => {
  const MIXED = index({
    tags: [summary({ name: 'smoke', scenarioCount: 3 })],
    usages: {
      smoke: [
        usage({ id: 'a.feature#0', origin: 'direct' }),
        usage({ id: 'a.feature#1', scenarioIndex: 1, origin: 'inherited' }),
        usage({ id: 'b.feature#0', relativePath: 'b.feature', origin: 'direct' }),
      ],
    },
  })

  it('previews how many scenarios in how many files an add would change', async () => {
    getIndexMock.mockResolvedValue(MIXED)
    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')
    store.selectAllVisibleScenarios()

    // Adding `fresh`: nothing carries it, so all 3 change, across 2 files.
    const preview = store.previewBulk('add', 'fresh')
    expect(preview).toMatchObject({ willChange: 3, filesAffected: 2, alreadySatisfied: 0, blocked: 0 })
  })

  it('counts scenarios that already carry the tag as already satisfied', async () => {
    getIndexMock.mockResolvedValue(MIXED)
    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')
    store.selectAllVisibleScenarios()

    const preview = store.previewBulk('add', 'smoke')
    expect(preview).toMatchObject({ willChange: 0, alreadySatisfied: 3 })
  })

  it('counts inherited usages as blocked for a remove (FR-021)', async () => {
    getIndexMock.mockResolvedValue(MIXED)
    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')
    store.selectAllVisibleScenarios()

    const preview = store.previewBulk('remove', 'smoke')
    expect(preview).toMatchObject({ willChange: 2, blocked: 1, filesAffected: 2 })
  })

  it('previews nothing for an invalid tag name', async () => {
    getIndexMock.mockResolvedValue(MIXED)
    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')
    store.selectAllVisibleScenarios()

    expect(store.previewBulk('add', 'two words')).toMatchObject({ willChange: 0 })
  })

  it('flags a conflict when a target file has unsaved editor changes (FR-025)', async () => {
    const scenarioStore = useScenarioStore()
    scenarioStore.currentFeaturePath = 'a.feature'
    scenarioStore.isDirty = true
    scenarioStore.scenarios = [{ name: 'Successful login', tags: ['smoke'], steps: [] }]
    scenarioStore.featureName = 'Auth'
    scenarioStore.featureTags = []

    getIndexMock.mockResolvedValue(MIXED)
    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')
    store.selectAllVisibleScenarios()

    expect(store.conflictsWithUnsavedEditor).toBe(true)
  })

  it('does not flag a conflict when the open feature is not targeted', async () => {
    const scenarioStore = useScenarioStore()
    scenarioStore.currentFeaturePath = 'unrelated.feature'
    scenarioStore.isDirty = true

    getIndexMock.mockResolvedValue(MIXED)
    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')
    store.selectAllVisibleScenarios()

    expect(store.conflictsWithUnsavedEditor).toBe(false)
  })

  it('dispatches only the selected targets and adopts the returned index', async () => {
    getIndexMock.mockResolvedValue(MIXED)
    applyBulkMock.mockResolvedValue({
      operation: 'add',
      tag: 'fresh',
      outcomes: [],
      changedCount: 1,
      filesChanged: 1,
      failedCount: 0,
      index: index({ tags: [summary({ name: 'fresh', scenarioCount: 1 })], usages: { fresh: [] } }),
    })

    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')
    store.toggleScenario('b.feature#0')

    await store.applyBulk('add', '@fresh')

    expect(applyBulkMock).toHaveBeenCalledWith({
      operation: 'add',
      tag: 'fresh',
      targets: [{ relativePath: 'b.feature', scenarioIndex: 0 }],
    })
    expect(store.index.tags[0]!.name).toBe('fresh')
  })

  it('refuses to dispatch an invalid tag or an empty selection', async () => {
    getIndexMock.mockResolvedValue(MIXED)
    const store = useTagsStore()
    await store.init()
    store.selectTag('smoke')

    expect(await store.applyBulk('add', 'ok')).toBeNull() // nothing selected
    store.selectAllVisibleScenarios()
    expect(await store.applyBulk('add', 'bad name')).toBeNull()
    expect(applyBulkMock).not.toHaveBeenCalled()
  })
})
