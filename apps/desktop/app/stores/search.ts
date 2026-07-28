import { defineStore } from 'pinia'
import type { SearchResult, SearchResultType, SearchIndexStatus } from '@suisui/shared'
import { MAX_SEARCH_RESULTS, matchTag, matchText, tokenize } from '@suisui/shared'
import { useScenarioStore } from './scenario'

/** Debounce window: below the perceived-lag threshold, collapses intra-word keystrokes. */
const DEBOUNCE_MS = 120

export type SearchTypeFilter = SearchResultType | 'all'

interface SearchStoreState {
  query: string
  results: SearchResult[]
  totalMatches: number
  truncated: boolean
  status: SearchIndexStatus
  activeIndex: number
  typeFilter: SearchTypeFilter
  isOpen: boolean
  /**
   * True from the moment a query is typed until its results land. Without this,
   * the panel flashes "No results" on every keystroke before the debounced
   * query has even been dispatched.
   */
  isSearching: boolean
  /**
   * Monotonic query counter. Lives in state (not module scope) so each store
   * instance owns its own sequence — module scope would leak between tests and
   * silently discard every response.
   */
  requestSeq: number
}

const IDLE_STATUS: SearchIndexStatus = {
  state: 'idle',
  fileCount: 0,
  scenarioCount: 0,
  unparsedFiles: [],
}

/** Module-scoped so they never end up in reactive state. */
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let unsubscribeStatus: (() => void) | null = null

export const useSearchStore = defineStore('search', {
  state: (): SearchStoreState => ({
    query: '',
    results: [],
    totalMatches: 0,
    truncated: false,
    status: { ...IDLE_STATUS },
    activeIndex: 0,
    typeFilter: 'all',
    isOpen: false,
    isSearching: false,
    requestSeq: 0,
  }),

  getters: {
    /** Results after the type filter. Counts below stay unfiltered on purpose. */
    visibleResults: (state): SearchResult[] =>
      state.typeFilter === 'all'
        ? state.results
        : state.results.filter((result) => result.type === state.typeFilter),

    featureCount: (state): number => state.results.filter((r) => r.type === 'feature').length,
    scenarioCount: (state): number => state.results.filter((r) => r.type === 'scenario').length,

    isIndexing: (state): boolean => state.status.state === 'building',
    hasUnparsedFiles: (state): boolean => state.status.unparsedFiles.length > 0,

    hasQuery: (state): boolean => state.query.trim().length > 0,

    activeResult(): SearchResult | null {
      return this.visibleResults[this.activeIndex] ?? null
    },

    /**
     * A non-empty query that genuinely returned nothing — not one still being
     * indexed or still in flight.
     */
    showEmptyState(): boolean {
      return (
        this.hasQuery && !this.isIndexing && !this.isSearching && this.visibleResults.length === 0
      )
    },
  },

  actions: {
    async init() {
      unsubscribeStatus?.()
      unsubscribeStatus = window.api.search.onIndexStatus((status) => {
        this.status = status
      })
      this.status = await window.api.search.getStatus()
    },

    dispose() {
      unsubscribeStatus?.()
      unsubscribeStatus = null
      this.cancelPending()
    },

    open() {
      this.isOpen = true
    },

    close() {
      this.isOpen = false
      this.activeIndex = 0
    },

    setQuery(text: string) {
      this.query = text
      this.activeIndex = 0

      if (text.trim().length === 0) {
        // Clearing the query resets the type filter so the next search is never
        // silently narrowed (FR-023).
        this.cancelPending()
        this.results = []
        this.totalMatches = 0
        this.truncated = false
        this.typeFilter = 'all'
        this.isSearching = false
        return
      }

      this.cancelPending()
      this.isSearching = true
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        void this.runQuery()
      }, DEBOUNCE_MS)
    },

    cancelPending() {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
    },

    async runQuery() {
      const text = this.query.trim()
      if (text.length === 0) {
        this.isSearching = false
        return
      }
      this.isSearching = true

      const requestId = ++this.requestSeq
      const response = await window.api.search.query(requestId, text)

      // Superseded searches must never overwrite newer results (FR-029).
      // Debouncing alone does not guarantee this — two in-flight calls can
      // still resolve out of order.
      if (response.requestId !== this.requestSeq) return

      const { results, totalMatches, truncated } = this.applyUnsavedOverlay(
        response.results,
        response.totalMatches,
        response.truncated,
        text
      )

      this.results = results
      this.totalMatches = totalMatches
      this.truncated = truncated
      this.status = response.status
      this.activeIndex = 0
      this.isSearching = false
    },

    /**
     * The main-process index reflects SAVED content. Overlay the feature the user
     * is currently editing so results never contradict what is on screen (FR-012).
     *
     * Order matters: exclude the open feature's indexed rows BEFORE re-adding live
     * ones, or a renamed scenario shows up under both its old and new name.
     */
    applyUnsavedOverlay(
      indexed: SearchResult[],
      totalMatches: number,
      truncated: boolean,
      text: string
    ): { results: SearchResult[]; totalMatches: number; truncated: boolean } {
      const scenarioStore = useScenarioStore()
      const openPath = scenarioStore.currentFeaturePath

      if (!scenarioStore.isDirty || !openPath) {
        return { results: indexed, totalMatches, truncated }
      }

      const others = indexed.filter((result) => result.relativePath !== openPath)
      const live = this.matchOpenFeature(openPath, text)
      const merged = [...others, ...live].sort(compareResults)

      // Recount: the indexed total included rows we just replaced. This is exact
      // only when the response was not truncated; when it was, the true total is
      // already approximate and the indicator stays honest either way.
      const total = truncated ? totalMatches : merged.length
      const isTruncated = merged.length > MAX_SEARCH_RESULTS || truncated

      return {
        results: isTruncated ? merged.slice(0, MAX_SEARCH_RESULTS) : merged,
        totalMatches: total,
        truncated: isTruncated,
      }
    },

    /** Match the in-memory (unsaved) state of the open feature. */
    matchOpenFeature(relativePath: string, text: string): SearchResult[] {
      const scenarioStore = useScenarioStore()
      const tokens = tokenize(text)
      if (tokens.length === 0) return []

      const fileName = relativePath.split('/').pop()?.replace(/\.feature$/, '') ?? relativePath
      const featureName = scenarioStore.featureName || fileName
      const out: SearchResult[] = []

      const featureMatch = buildMatch(
        featureName,
        scenarioStore.featureTags ?? [],
        tokens,
        'feature'
      )
      if (featureMatch) {
        out.push({ ...featureMatch, id: relativePath, relativePath, featureName })
      }

      scenarioStore.scenarios.forEach((scenario, index) => {
        const match = buildMatch(scenario.name, scenario.tags ?? [], tokens, 'scenario')
        if (match) {
          out.push({
            ...match,
            id: `${relativePath}#${index}`,
            relativePath,
            featureName,
            scenarioIndex: index,
          })
        }
      })

      return out
    },

    setTypeFilter(filter: SearchTypeFilter) {
      this.typeFilter = filter
      this.activeIndex = 0
    },

    moveActive(delta: number) {
      const count = this.visibleResults.length
      if (count === 0) {
        this.activeIndex = 0
        return
      }
      this.activeIndex = (this.activeIndex + delta + count) % count
    },

    /** Workspace changed or closed — results from the old workspace must not linger. */
    reset() {
      this.cancelPending()
      // Bump the sequence so any in-flight response is discarded on arrival.
      this.requestSeq++
      this.query = ''
      this.results = []
      this.totalMatches = 0
      this.truncated = false
      this.activeIndex = 0
      this.typeFilter = 'all'
      this.isOpen = false
      this.isSearching = false
    },
  },
})

/** Shared shape-building for renderer-side (unsaved) matches. */
function buildMatch(
  text: string,
  tags: string[],
  tokens: string[],
  type: SearchResultType
): Omit<SearchResult, 'id' | 'relativePath' | 'featureName'> | null {
  const byName = matchText(text, tokens)
  if (byName) {
    return {
      type,
      text,
      ranges: byName.ranges,
      matchedField: 'name',
      tags,
      score: byName.score + (type === 'feature' ? 5 : 0),
    }
  }

  for (const tag of tags) {
    const byTag = matchTag(tag, tokens)
    if (byTag) {
      return {
        type,
        text,
        ranges: [],
        matchedField: 'tag',
        matchedTag: tag,
        tags,
        score: byTag.score + (type === 'feature' ? 5 : 0),
      }
    }
  }

  return null
}

/** Must mirror the service's ordering so merged results stay coherent. */
function compareResults(a: SearchResult, b: SearchResult): number {
  return (
    b.score - a.score ||
    a.text.length - b.text.length ||
    a.relativePath.localeCompare(b.relativePath) ||
    (a.scenarioIndex ?? -1) - (b.scenarioIndex ?? -1)
  )
}
