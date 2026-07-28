import path from 'node:path'
import fs from 'node:fs/promises'
import type {
  MatchRange,
  SearchIndexStatus,
  SearchResponse,
  SearchResult,
  SearchResultType,
} from '@suisui/shared'
import { MAX_SEARCH_RESULTS, matchTag, matchText, normalize, tokenize } from '@suisui/shared'
import { parseFeatureOutline } from '@suisui/shared'
import type { IFileWatcher } from './FileWatcher'
import { NodeFileWatcher } from './FileWatcher'
import { getWorkspaceService } from './WorkspaceService'

/** The slice of WorkspaceService this service needs, narrowed for injection. */
export interface IWorkspaceLocator {
  getPath(): string | null
  getFeaturesDir(workspacePath: string): Promise<string>
}

/**
 * One searchable item. Normalized fields are precomputed at index time — that
 * is what keeps per-keystroke cost negligible at workspace scale.
 */
interface SearchIndexRow {
  type: SearchResultType
  text: string
  normalizedText: string
  /** Feature rows only: the file's base name, also matchable. */
  normalizedFileName: string
  tags: string[]
  normalizedTags: string[]
  relativePath: string
  featureName: string
  scenarioIndex?: number
}

/** Features outrank equally-scoring scenarios — they are the broader target. */
const FEATURE_TYPE_WEIGHT = 5

function emptyStatus(): SearchIndexStatus {
  return { state: 'idle', fileCount: 0, scenarioCount: 0, unparsedFiles: [] }
}

export class SearchIndexService {
  private rows: SearchIndexRow[] = []
  private byFile = new Map<string, SearchIndexRow[]>()
  private status: SearchIndexStatus = emptyStatus()
  private featuresDir: string | null = null
  /** Workspace the current index was built from, so `ensureBuilt` can no-op. */
  private indexedWorkspacePath: string | null = null
  private statusListeners = new Set<(status: SearchIndexStatus) => void>()
  /** Serializes rebuilds so overlapping triggers cannot interleave. */
  private pending: Promise<void> = Promise.resolve()

  constructor(
    private readonly watcher: IFileWatcher = new NodeFileWatcher(),
    private readonly workspace: IWorkspaceLocator = getWorkspaceService()
  ) {}

  // ---------------------------------------------------------------- lifecycle

  /** Rebuild the whole index. Safe to call repeatedly; calls are serialized. */
  async rebuild(): Promise<void> {
    this.setStatus({ ...this.status, state: 'building' })
    this.pending = this.pending.then(() => this.doRebuild()).catch(() => undefined)
    return this.pending
  }

  /**
   * Build the index if it does not already reflect the current workspace.
   *
   * This is the path that matters at startup: a workspace restored from settings
   * is only materialized when the renderer calls `workspace.get()`, so
   * `getPath()` is still null when the app first boots. Without this hook the
   * index would stay empty for the entire session and every search would
   * (wrongly) report no results.
   */
  async ensureBuilt(): Promise<void> {
    const current = this.workspace.getPath()
    if (current === this.indexedWorkspacePath && this.status.state === 'ready') return
    if (current === null && this.status.state === 'idle') return
    return this.rebuild()
  }

  /** Drop everything — the workspace was closed. */
  clear(): void {
    this.watcher.close()
    this.rows = []
    this.byFile.clear()
    this.featuresDir = null
    this.indexedWorkspacePath = null
    this.setStatus(emptyStatus())
  }

  dispose(): void {
    this.watcher.close()
    this.statusListeners.clear()
  }

  /** Subscribe to index-state changes; returns an unsubscribe fn. */
  onStatusChange(listener: (status: SearchIndexStatus) => void): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  getStatus(): SearchIndexStatus {
    return { ...this.status, unparsedFiles: [...this.status.unparsedFiles] }
  }

  // ------------------------------------------------------------------- search

  search(requestId: number, text: string): SearchResponse {
    const tokens = tokenize(text)
    if (tokens.length === 0) {
      return { requestId, results: [], totalMatches: 0, truncated: false, status: this.getStatus() }
    }

    const matches: SearchResult[] = []
    for (const row of this.rows) {
      const result = this.matchRow(row, tokens)
      if (result) matches.push(result)
    }

    matches.sort(compareResults)
    const truncated = matches.length > MAX_SEARCH_RESULTS

    return {
      requestId,
      results: truncated ? matches.slice(0, MAX_SEARCH_RESULTS) : matches,
      totalMatches: matches.length,
      truncated,
      status: this.getStatus(),
    }
  }

  /**
   * At most ONE result per row: a name match always wins over a tag match, so
   * per-type counts equal the number of distinct matched items.
   */
  private matchRow(row: SearchIndexRow, tokens: string[]): SearchResult | null {
    const byName = matchText(row.text, tokens)
    if (byName) {
      return this.toResult(row, byName.score, byName.ranges, 'name')
    }

    // Feature files stay findable by file name even when the Feature: line is
    // missing or differently worded. Ranges index `text`, so a file-name-only
    // match reports none rather than highlighting the wrong span.
    if (row.type === 'feature' && matchNormalized(row.normalizedFileName, tokens)) {
      return this.toResult(row, 40, [], 'name')
    }

    for (const tag of row.tags) {
      const byTag = matchTag(tag, tokens)
      if (byTag) {
        return this.toResult(row, byTag.score, [], 'tag', tag)
      }
    }

    return null
  }

  private toResult(
    row: SearchIndexRow,
    score: number,
    ranges: MatchRange[],
    matchedField: 'name' | 'tag',
    matchedTag?: string
  ): SearchResult {
    return {
      id: row.scenarioIndex === undefined ? row.relativePath : `${row.relativePath}#${row.scenarioIndex}`,
      type: row.type,
      text: row.text,
      ranges,
      matchedField,
      ...(matchedTag ? { matchedTag } : {}),
      relativePath: row.relativePath,
      featureName: row.featureName,
      ...(row.scenarioIndex === undefined ? {} : { scenarioIndex: row.scenarioIndex }),
      tags: row.tags,
      score: score + (row.type === 'feature' ? FEATURE_TYPE_WEIGHT : 0),
    }
  }

  // ------------------------------------------------------------------ indexing

  private async doRebuild(): Promise<void> {
    const workspacePath = this.workspace.getPath()
    if (!workspacePath) {
      this.watcher.close()
      this.rows = []
      this.byFile.clear()
      this.featuresDir = null
      this.indexedWorkspacePath = null
      this.setStatus(emptyStatus())
      return
    }

    const featuresDir = path.join(workspacePath, await this.workspace.getFeaturesDir(workspacePath))
    this.featuresDir = featuresDir

    await this.scanIntoIndex(featuresDir)
    this.indexedWorkspacePath = workspacePath
    this.startWatching(featuresDir)
  }

  /** Re-read every feature file and replace the index. Does not touch the watcher. */
  private async scanIntoIndex(featuresDir: string): Promise<void> {
    const relativePaths = await this.scan(featuresDir)
    this.byFile.clear()
    const unparsed: string[] = []

    for (const relativePath of relativePaths) {
      const { rows, parsed } = await this.indexFile(featuresDir, relativePath)
      this.byFile.set(relativePath, rows)
      if (!parsed) unparsed.push(relativePath)
    }

    this.flattenRows()
    this.setStatus({ ...this.countStatus(), state: 'ready', unparsedFiles: unparsed.sort() })
  }

  /** Recursively collect `.feature` paths relative to `dir`. */
  private async scan(dir: string, prefix = ''): Promise<string[]> {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return []
    }

    const found: string[] = []
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (entry.name === 'steps' || entry.name === 'node_modules') continue
        found.push(...(await this.scan(path.join(dir, entry.name), relativePath)))
      } else if (entry.name.endsWith('.feature')) {
        found.push(relativePath)
      }
    }
    return found
  }

  /**
   * Build the rows for one file. A read or parse failure degrades to a
   * name-only feature row rather than dropping the file entirely.
   */
  private async indexFile(
    featuresDir: string,
    relativePath: string
  ): Promise<{ rows: SearchIndexRow[]; parsed: boolean }> {
    const fileName = path.basename(relativePath, '.feature')

    let content: string
    try {
      content = await fs.readFile(path.join(featuresDir, relativePath), 'utf-8')
    } catch {
      return { rows: [makeFeatureRow(fileName, fileName, [], relativePath)], parsed: false }
    }

    const outline = parseFeatureOutline(content)
    const featureName = outline.name || fileName
    const rows: SearchIndexRow[] = [makeFeatureRow(featureName, fileName, outline.tags, relativePath)]

    outline.scenarios.forEach((scenario, index) => {
      rows.push({
        type: 'scenario',
        text: scenario.name,
        normalizedText: normalize(scenario.name),
        normalizedFileName: '',
        tags: scenario.tags,
        normalizedTags: scenario.tags.map(normalize),
        relativePath,
        featureName,
        scenarioIndex: index,
      })
    })

    return { rows, parsed: !outline.hasParseErrors }
  }

  private flattenRows(): void {
    this.rows = [...this.byFile.values()].flat()
  }

  private countStatus(): SearchIndexStatus {
    return {
      state: this.status.state,
      fileCount: this.byFile.size,
      scenarioCount: this.rows.filter((row) => row.type === 'scenario').length,
      unparsedFiles: this.status.unparsedFiles,
    }
  }

  // ------------------------------------------------------------------ watching

  private startWatching(featuresDir: string): void {
    this.watcher.close()

    // One-shot guard, scoped to THIS watch attempt. A dead watcher triggers a
    // single rescan and nothing more — it must never re-establish the watch,
    // because a directory that cannot be watched at all (permissions, network
    // filesystem, missing dir) would then error → rebuild → error forever.
    let errorHandled = false

    this.watcher.watch(
      featuresDir,
      (relativePaths) => {
        void this.applyChanges(relativePaths)
      },
      () => {
        if (errorHandled) return
        errorHandled = true
        // Degrade gracefully: the index stays correct as of now, it just stops
        // auto-updating until the next workspace open.
        void this.scanIntoIndex(featuresDir).catch(() => undefined)
      }
    )
  }

  /**
   * Incremental update. Deliberately does NOT flip state back to 'building' —
   * these complete in milliseconds and surfacing them would only flicker the UI.
   */
  private async applyChanges(relativePaths: string[]): Promise<void> {
    const featuresDir = this.featuresDir
    if (!featuresDir) return

    const unparsed = new Set(this.status.unparsedFiles)

    for (const raw of relativePaths) {
      const relativePath = raw.split(path.sep).join('/')
      if (!relativePath.endsWith('.feature')) continue

      const exists = await fileExists(path.join(featuresDir, relativePath))
      if (!exists) {
        this.byFile.delete(relativePath)
        unparsed.delete(relativePath)
        continue
      }

      const { rows, parsed } = await this.indexFile(featuresDir, relativePath)
      this.byFile.set(relativePath, rows)
      if (parsed) unparsed.delete(relativePath)
      else unparsed.add(relativePath)
    }

    this.flattenRows()
    this.setStatus({ ...this.countStatus(), state: 'ready', unparsedFiles: [...unparsed].sort() })
  }

  // -------------------------------------------------------------------- status

  private setStatus(status: SearchIndexStatus): void {
    this.status = status
    const snapshot = this.getStatus()
    for (const listener of this.statusListeners) {
      listener(snapshot)
    }
  }
}

function makeFeatureRow(
  featureName: string,
  fileName: string,
  tags: string[],
  relativePath: string
): SearchIndexRow {
  return {
    type: 'feature',
    text: featureName,
    normalizedText: normalize(featureName),
    normalizedFileName: normalize(fileName),
    tags,
    normalizedTags: tags.map(normalize),
    relativePath,
    featureName,
  }
}

/** Literal all-tokens check against an already-normalized string. */
function matchNormalized(normalized: string, tokens: string[]): boolean {
  return normalized.length > 0 && tokens.every((token) => normalized.includes(token))
}

/** Deterministic ordering — the E2E order assertions depend on it. */
function compareResults(a: SearchResult, b: SearchResult): number {
  return (
    b.score - a.score ||
    a.text.length - b.text.length ||
    a.relativePath.localeCompare(b.relativePath) ||
    (a.scenarioIndex ?? -1) - (b.scenarioIndex ?? -1)
  )
}

let instance: SearchIndexService | null = null

export function getSearchIndexService(): SearchIndexService {
  if (!instance) instance = new SearchIndexService()
  return instance
}

async function fileExists(fullPath: string): Promise<boolean> {
  try {
    await fs.access(fullPath)
    return true
  } catch {
    return false
  }
}
