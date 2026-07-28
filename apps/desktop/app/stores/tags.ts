import { defineStore } from 'pinia'
import type {
  BulkTagOperation,
  BulkTagResult,
  TagIndex,
  TagSummary,
  TagUsage,
} from '@suisui/shared'
import { isValidTagName, normalizeTagName } from '@suisui/shared'
import { useScenarioStore } from './scenario'

export type TagSortMode = 'count' | 'alpha'

interface TagsStoreState {
  index: TagIndex
  selectedTag: string | null
  tagFilter: string
  sortMode: TagSortMode
  /** `TagUsage.id`s selected for a bulk operation. */
  selectedScenarioIds: string[]
  /** Outcome of the last bulk operation, for the summary panel. */
  lastResult: BulkTagResult | null
  isApplying: boolean
}

/** What a pending bulk operation would actually do (FR-019). */
export interface BulkTagPreview {
  willChange: number
  filesAffected: number
  alreadySatisfied: number
  /** remove: inherited from the feature, so not removable here (FR-021). */
  blocked: number
}

const EMPTY_INDEX: TagIndex = {
  state: 'idle',
  tags: [],
  usages: {},
  unparsedFiles: [],
  fileCount: 0,
  scenarioCount: 0,
}

/** Module-scoped so it never lands in reactive state. */
let unsubscribeIndex: (() => void) | null = null

export const useTagsStore = defineStore('tags', {
  state: (): TagsStoreState => ({
    index: { ...EMPTY_INDEX },
    selectedTag: null,
    tagFilter: '',
    sortMode: 'count',
    selectedScenarioIds: [],
    lastResult: null,
    isApplying: false,
  }),

  getters: {
    isIndexing: (state): boolean => state.index.state === 'building',
    hasWorkspaceIndex: (state): boolean => state.index.state !== 'idle',
    hasUnparsedFiles: (state): boolean => state.index.unparsedFiles.length > 0,

    /** Tags after the text filter and the active sort. */
    visibleTags(): TagSummary[] {
      const needle = this.tagFilter.trim().toLowerCase()
      const filtered = needle
        ? this.index.tags.filter((tag) => tag.name.toLowerCase().includes(needle))
        : [...this.index.tags]

      return this.sortMode === 'alpha'
        ? filtered.sort((a, b) => a.name.localeCompare(b.name))
        : filtered.sort((a, b) => b.scenarioCount - a.scenarioCount || a.name.localeCompare(b.name))
    },

    /** True when the workspace is indexed but carries no tags at all. */
    showEmptyState(): boolean {
      return this.index.state === 'ready' && this.index.tags.length === 0
    },

    selectedSummary(): TagSummary | null {
      if (!this.selectedTag) return null
      return this.index.tags.find((tag) => tag.name === this.selectedTag) ?? null
    },

    /**
     * Usages for the selected tag, with the currently-open feature overlaid from
     * live editor state so unsaved tag edits are reflected (FR-010).
     */
    selectedUsages(): TagUsage[] {
      if (!this.selectedTag) return []
      return usagesWithOverlay(this.index, this.selectedTag)
    },

    /** Only the usages that can be removed at scenario level. */
    removableSelection(): TagUsage[] {
      return this.selectedUsages.filter(
        (usage) => usage.origin === 'direct' && this.selectedScenarioIds.includes(usage.id)
      )
    },

    selectedUsageObjects(): TagUsage[] {
      const chosen = new Set(this.selectedScenarioIds)
      return this.selectedUsages.filter((usage) => chosen.has(usage.id))
    },

    hasSelection(): boolean {
      return this.selectedScenarioIds.length > 0
    },

    /**
     * True when an operation would write to the feature currently open with
     * unsaved changes. Writing there would silently fight the editor buffer —
     * whichever saves last wins — so the caller must confirm first (FR-025).
     */
    conflictsWithUnsavedEditor(): boolean {
      const scenarioStore = useScenarioStore()
      if (!scenarioStore.isDirty || !scenarioStore.currentFeaturePath) return false
      return this.selectedUsageObjects.some(
        (usage) => usage.relativePath === scenarioStore.currentFeaturePath
      )
    },
  },

  actions: {
    async init() {
      unsubscribeIndex?.()
      unsubscribeIndex = window.api.tags.onIndexChanged((index) => {
        this.index = index
        this.pruneSelection()
      })
      this.index = await window.api.tags.getIndex()
      this.pruneSelection()
    },

    dispose() {
      unsubscribeIndex?.()
      unsubscribeIndex = null
    },

    selectTag(name: string | null) {
      this.selectedTag = name
      this.selectedScenarioIds = []
    },

    setTagFilter(text: string) {
      this.tagFilter = text
    },

    setSortMode(mode: TagSortMode) {
      this.sortMode = mode
    },

    toggleScenario(id: string) {
      const at = this.selectedScenarioIds.indexOf(id)
      if (at === -1) this.selectedScenarioIds.push(id)
      else this.selectedScenarioIds.splice(at, 1)
    },

    selectAllVisibleScenarios() {
      this.selectedScenarioIds = this.selectedUsages.map((usage) => usage.id)
    },

    clearScenarioSelection() {
      this.selectedScenarioIds = []
    },

    /** Drop a selected tag / scenarios that no longer exist after a reindex. */
    pruneSelection() {
      if (this.selectedTag && !this.index.usages[this.selectedTag]) {
        this.selectedTag = null
        this.selectedScenarioIds = []
        return
      }
      const alive = new Set(this.selectedUsages.map((usage) => usage.id))
      this.selectedScenarioIds = this.selectedScenarioIds.filter((id) => alive.has(id))
    },

    /**
     * What an operation would do, computed from the index the renderer already
     * holds — no round-trip, and it cannot disagree with what is on screen.
     */
    previewBulk(operation: BulkTagOperation, rawTag: string): BulkTagPreview {
      const tag = normalizeTagName(rawTag)
      const empty: BulkTagPreview = {
        willChange: 0,
        filesAffected: 0,
        alreadySatisfied: 0,
        blocked: 0,
      }
      if (!isValidTagName(tag)) return empty

      const files = new Set<string>()
      let willChange = 0
      let alreadySatisfied = 0
      let blocked = 0

      for (const usage of this.selectedUsageObjects) {
        const carriedDirectly = (this.index.usages[tag] ?? []).some(
          (candidate) => candidate.id === usage.id && candidate.origin === 'direct'
        )
        const carriedAtAll = (this.index.usages[tag] ?? []).some(
          (candidate) => candidate.id === usage.id
        )

        if (operation === 'add') {
          if (carriedAtAll) alreadySatisfied++
          else {
            willChange++
            files.add(usage.relativePath)
          }
          continue
        }

        if (!carriedAtAll) alreadySatisfied++
        else if (!carriedDirectly) blocked++
        else {
          willChange++
          files.add(usage.relativePath)
        }
      }

      return { willChange, filesAffected: files.size, alreadySatisfied, blocked }
    },

    async applyBulk(operation: BulkTagOperation, rawTag: string): Promise<BulkTagResult | null> {
      const tag = normalizeTagName(rawTag)
      if (!isValidTagName(tag) || this.selectedScenarioIds.length === 0) return null

      this.isApplying = true
      try {
        const result = await window.api.tags.applyBulk({
          operation,
          tag,
          targets: this.selectedUsageObjects.map((usage) => ({
            relativePath: usage.relativePath,
            scenarioIndex: usage.scenarioIndex,
          })),
        })
        // The service returns the rebuilt index, so counts never lag (FR-026).
        this.index = result.index
        this.lastResult = result
        this.pruneSelection()
        return result
      } finally {
        this.isApplying = false
      }
    },

    clearLastResult() {
      this.lastResult = null
    },

    /** Workspace changed or closed — nothing from the old one may linger. */
    reset() {
      this.index = { ...EMPTY_INDEX }
      this.selectedTag = null
      this.tagFilter = ''
      this.sortMode = 'count'
      this.selectedScenarioIds = []
      this.lastResult = null
      this.isApplying = false
    },
  },
})

/**
 * Usages for one tag, with the open feature's unsaved state overlaid (FR-010).
 *
 * Order matters: drop the open feature's indexed usages BEFORE re-deriving
 * them, or a tag the user just removed in the editor would still show.
 *
 * Module-scoped rather than an action so getters can call it — Pinia's options
 * API does not expose actions to getters through `this` at the type level.
 */
function usagesWithOverlay(index: TagIndex, tagName: string): TagUsage[] {
  const indexed = index.usages[tagName] ?? []
  const scenarioStore = useScenarioStore()
  const openPath = scenarioStore.currentFeaturePath

  if (!scenarioStore.isDirty || !openPath) return indexed

  const others = indexed.filter((usage) => usage.relativePath !== openPath)
  return [...others, ...liveUsages(openPath, tagName)].sort(compareUsages)
}

/** Derive usages for the open feature from live Pinia state. */
function liveUsages(relativePath: string, tagName: string): TagUsage[] {
  const scenarioStore = useScenarioStore()
  const fileName = relativePath.split('/').pop()?.replace(/\.feature$/, '') ?? relativePath
  const featureName = scenarioStore.featureName || fileName
  const inherited = (scenarioStore.featureTags ?? []).includes(tagName)

  const out: TagUsage[] = []
  scenarioStore.scenarios.forEach((scenario, scenarioIndex) => {
    const direct = (scenario.tags ?? []).includes(tagName)
    if (!direct && !inherited) return
    out.push({
      id: `${relativePath}#${scenarioIndex}`,
      relativePath,
      featureName,
      scenarioIndex,
      scenarioName: scenario.name,
      origin: direct ? 'direct' : 'inherited',
    })
  })
  return out
}

function compareUsages(a: TagUsage, b: TagUsage): number {
  return a.relativePath.localeCompare(b.relativePath) || a.scenarioIndex - b.scenarioIndex
}
