import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { SearchIndexStatus, SearchResponse, SearchResult } from '@suisui/shared'
import { useSearchStore } from '../stores/search'
import { useScenarioStore } from '../stores/scenario'

const READY: SearchIndexStatus = {
  state: 'ready',
  fileCount: 2,
  scenarioCount: 4,
  unparsedFiles: [],
}

const queryMock = vi.fn<(requestId: number, text: string) => Promise<SearchResponse>>()
const getStatusMock = vi.fn<() => Promise<SearchIndexStatus>>()
const onIndexStatusMock = vi.fn(() => () => {})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  getStatusMock.mockResolvedValue(READY)
  vi.stubGlobal('window', {
    api: { search: { query: queryMock, getStatus: getStatusMock, onIndexStatus: onIndexStatusMock } },
  })
})

function result(over: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'a.feature#0',
    type: 'scenario',
    text: 'Successful login',
    ranges: [{ start: 11, end: 16 }],
    matchedField: 'name',
    relativePath: 'a.feature',
    featureName: 'Auth',
    scenarioIndex: 0,
    tags: [],
    score: 60,
    ...over,
  }
}

function response(over: Partial<SearchResponse> = {}): SearchResponse {
  const results = over.results ?? [result()]
  return {
    requestId: 1,
    results,
    totalMatches: results.length,
    truncated: false,
    status: READY,
    ...over,
  }
}

describe('search store — query lifecycle', () => {
  it('does not dispatch for an empty or whitespace-only query', async () => {
    const store = useSearchStore()
    store.setQuery('   ')
    await store.runQuery()
    expect(queryMock).not.toHaveBeenCalled()
    expect(store.results).toEqual([])
  })

  it('clears results when the query is cleared', async () => {
    const store = useSearchStore()
    queryMock.mockImplementation(async (requestId) => response({ requestId }))
    store.query = 'login'
    await store.runQuery()
    expect(store.results).toHaveLength(1)

    store.setQuery('')
    expect(store.results).toEqual([])
    expect(store.totalMatches).toBe(0)
  })

  it('echoes results for the latest request', async () => {
    const store = useSearchStore()
    queryMock.mockImplementation(async (requestId) => response({ requestId }))
    store.query = 'login'
    await store.runQuery()
    expect(store.results).toHaveLength(1)
  })

  it('discards a stale response so it cannot overwrite newer results (FR-029)', async () => {
    const store = useSearchStore()

    let resolveSlow: ((value: SearchResponse) => void) | null = null
    queryMock.mockImplementationOnce(
      (requestId) =>
        new Promise<SearchResponse>((resolve) => {
          resolveSlow = () => resolve(response({ requestId, results: [result({ text: 'STALE' })] }))
        })
    )
    queryMock.mockImplementationOnce(async (requestId) =>
      response({ requestId, results: [result({ text: 'FRESH' })] })
    )

    store.query = 'log'
    const slow = store.runQuery()

    store.query = 'login'
    await store.runQuery()
    expect(store.results[0]!.text).toBe('FRESH')

    resolveSlow!(response())
    await slow

    // The slow first query resolved last, and must NOT have clobbered the newer one.
    expect(store.results[0]!.text).toBe('FRESH')
  })

  it('resets everything when the workspace changes', async () => {
    const store = useSearchStore()
    queryMock.mockImplementation(async (requestId) => response({ requestId }))
    store.query = 'login'
    await store.runQuery()

    store.reset()
    expect(store.results).toEqual([])
    expect(store.query).toBe('')
    expect(store.typeFilter).toBe('all')
  })
})

describe('search store — type filter (FR-023)', () => {
  beforeEach(async () => {
    queryMock.mockImplementation(async (requestId) =>
      response({
        requestId,
        results: [
          result({ id: 'a.feature', type: 'feature', text: 'Auth', scenarioIndex: undefined }),
          result({ id: 'a.feature#0', type: 'scenario', text: 'Successful login' }),
          result({ id: 'a.feature#1', type: 'scenario', text: 'Failed login' }),
        ],
      })
    )
  })

  it('narrows visible results while counts stay unfiltered', async () => {
    const store = useSearchStore()
    store.query = 'login'
    await store.runQuery()

    store.setTypeFilter('scenario')
    expect(store.visibleResults).toHaveLength(2)
    expect(store.featureCount).toBe(1)
    expect(store.scenarioCount).toBe(2)
  })

  it('resets the filter when the query is cleared', async () => {
    const store = useSearchStore()
    store.query = 'login'
    await store.runQuery()
    store.setTypeFilter('feature')

    store.setQuery('')
    expect(store.typeFilter).toBe('all')
  })

  it('wraps keyboard navigation around the visible results', async () => {
    const store = useSearchStore()
    store.query = 'login'
    await store.runQuery()

    expect(store.activeIndex).toBe(0)
    store.moveActive(-1)
    expect(store.activeIndex).toBe(2)
    store.moveActive(1)
    expect(store.activeIndex).toBe(0)
  })

  it('does not flash "no results" while a query is still in flight', async () => {
    const store = useSearchStore()

    // Typing schedules a debounced query — the empty state must NOT appear yet.
    store.setQuery('login')
    expect(store.isSearching).toBe(true)
    expect(store.showEmptyState).toBe(false)

    store.cancelPending()
    await store.runQuery()
    expect(store.isSearching).toBe(false)
  })

  it('reports an empty state only when not indexing', async () => {
    const store = useSearchStore()
    queryMock.mockImplementation(async (requestId) => response({ requestId, results: [] }))
    store.query = 'zzz'
    await store.runQuery()
    expect(store.showEmptyState).toBe(true)

    store.status = { ...READY, state: 'building' }
    expect(store.showEmptyState).toBe(false)
  })
})

describe('search store — unsaved-edit overlay (FR-012)', () => {
  function openDirtyFeature(path = 'a.feature') {
    const scenarioStore = useScenarioStore()
    scenarioStore.currentFeaturePath = path
    scenarioStore.featureName = 'Auth'
    scenarioStore.featureTags = []
    scenarioStore.scenarios = [{ name: 'Renamed scenario', tags: ['wip'], steps: [] }]
    scenarioStore.isDirty = true
    return scenarioStore
  }

  it('leaves indexed results untouched when nothing is dirty', async () => {
    const store = useSearchStore()
    queryMock.mockImplementation(async (requestId) => response({ requestId }))
    store.query = 'login'
    await store.runQuery()
    expect(store.results[0]!.text).toBe('Successful login')
  })

  it('replaces the open feature rows with live state', async () => {
    openDirtyFeature()
    const store = useSearchStore()
    queryMock.mockImplementation(async (requestId) =>
      response({ requestId, results: [result({ text: 'Old saved name' })] })
    )

    store.query = 'renamed'
    await store.runQuery()

    expect(store.results.map((r) => r.text)).toContain('Renamed scenario')
  })

  it('does not return the stale indexed name after a rename', async () => {
    openDirtyFeature()
    const store = useSearchStore()
    // The index still holds the OLD name and would match the old query.
    queryMock.mockImplementation(async (requestId) =>
      response({ requestId, results: [result({ text: 'Successful login' })] })
    )

    store.query = 'successful'
    await store.runQuery()

    expect(store.results.map((r) => r.text)).not.toContain('Successful login')
  })

  it('keeps results from other files intact', async () => {
    openDirtyFeature()
    const store = useSearchStore()
    queryMock.mockImplementation(async (requestId) =>
      response({
        requestId,
        results: [
          result({ id: 'b.feature#0', relativePath: 'b.feature', text: 'Renamed elsewhere' }),
          result({ text: 'Old saved name' }),
        ],
      })
    )

    store.query = 'renamed'
    await store.runQuery()

    expect(store.results.map((r) => r.relativePath)).toContain('b.feature')
  })

  it('matches unsaved tags too', async () => {
    openDirtyFeature()
    const store = useSearchStore()
    queryMock.mockImplementation(async (requestId) => response({ requestId, results: [] }))

    store.query = 'wip'
    await store.runQuery()

    const match = store.results.find((r) => r.matchedField === 'tag')
    expect(match?.matchedTag).toBe('wip')
  })
})
