import path from 'node:path'
import fs from 'node:fs/promises'
import type {
  FeatureOutline,
  TagIndex,
  TagSummary,
  TagUsage,
} from '@suisui/shared'
import { parseFeatureOutline } from '@suisui/shared'
import type { IFileWatcher } from './FileWatcher'
import { NodeFileWatcher } from './FileWatcher'
import type { IWorkspaceLocator } from './SearchIndexService'
import { getWorkspaceService } from './WorkspaceService'

/** What one feature file contributes to the index. */
interface IndexedFile {
  relativePath: string
  featureName: string
  outline: FeatureOutline
  parsed: boolean
}

function emptyIndex(): TagIndex {
  return {
    state: 'idle',
    tags: [],
    usages: {},
    unparsedFiles: [],
    fileCount: 0,
    scenarioCount: 0,
  }
}

/**
 * Workspace-wide tag index (feature 010).
 *
 * Reads the same `.feature` files as the search index but keeps a different
 * shape: usages grouped by tag, with feature-level inheritance made explicit
 * rather than flattened. `parseFeatureMetadata` (used by the run view) flattens
 * inheritance and cannot answer "is this tag removable here?".
 */
export class TagService {
  private files = new Map<string, IndexedFile>()
  private index: TagIndex = emptyIndex()
  private featuresDir: string | null = null
  private indexedWorkspacePath: string | null = null
  private listeners = new Set<(index: TagIndex) => void>()
  /** Serializes rebuilds so overlapping triggers cannot interleave. */
  private pending: Promise<void> = Promise.resolve()

  constructor(
    private readonly watcher: IFileWatcher = new NodeFileWatcher(),
    private readonly workspace: IWorkspaceLocator = getWorkspaceService()
  ) {}

  // ---------------------------------------------------------------- lifecycle

  async rebuild(): Promise<void> {
    this.setIndex({ ...this.index, state: 'building' })
    this.pending = this.pending.then(() => this.doRebuild()).catch(() => undefined)
    return this.pending
  }

  /**
   * Build only if the index does not already reflect the current workspace.
   *
   * This is the path that matters at startup: a workspace restored from
   * settings is only materialized when the renderer calls `workspace.get()`, so
   * `getPath()` is still null when the app boots.
   */
  async ensureBuilt(): Promise<void> {
    const current = this.workspace.getPath()
    if (current === this.indexedWorkspacePath && this.index.state === 'ready') return
    if (current === null && this.index.state === 'idle') return
    return this.rebuild()
  }

  clear(): void {
    this.watcher.close()
    this.files.clear()
    this.featuresDir = null
    this.indexedWorkspacePath = null
    this.setIndex(emptyIndex())
  }

  dispose(): void {
    this.watcher.close()
    this.listeners.clear()
  }

  onIndexChanged(listener: (index: TagIndex) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getIndex(): TagIndex {
    return this.index
  }

  /** Absolute path of a feature file, or null when it is not indexed. */
  resolveIndexedPath(relativePath: string): string | null {
    if (!this.featuresDir || !this.files.has(relativePath)) return null
    return path.join(this.featuresDir, relativePath)
  }

  getIndexedFile(relativePath: string): IndexedFile | undefined {
    return this.files.get(relativePath)
  }

  // ------------------------------------------------------------------ indexing

  private async doRebuild(): Promise<void> {
    const workspacePath = this.workspace.getPath()
    if (!workspacePath) {
      this.watcher.close()
      this.files.clear()
      this.featuresDir = null
      this.indexedWorkspacePath = null
      this.setIndex(emptyIndex())
      return
    }

    const featuresDir = path.join(workspacePath, await this.workspace.getFeaturesDir(workspacePath))
    this.featuresDir = featuresDir

    await this.scanAll(featuresDir)
    this.indexedWorkspacePath = workspacePath
    this.startWatching(featuresDir)
  }

  /** Re-read every feature file and rebuild the index. Does not touch the watcher. */
  private async scanAll(featuresDir: string): Promise<void> {
    const relativePaths = await this.scan(featuresDir)
    this.files.clear()
    for (const relativePath of relativePaths) {
      this.files.set(relativePath, await this.readFile(featuresDir, relativePath))
    }
    this.setIndex(this.aggregate('ready'))
  }

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

  private async readFile(featuresDir: string, relativePath: string): Promise<IndexedFile> {
    const fileName = path.basename(relativePath, '.feature')
    let content: string
    try {
      content = await fs.readFile(path.join(featuresDir, relativePath), 'utf-8')
    } catch {
      return {
        relativePath,
        featureName: fileName,
        outline: { name: '', tags: [], scenarios: [], hasParseErrors: true },
        parsed: false,
      }
    }

    const outline = parseFeatureOutline(content)
    return {
      relativePath,
      featureName: outline.name || fileName,
      outline,
      parsed: !outline.hasParseErrors,
    }
  }

  // --------------------------------------------------------------- aggregation

  /**
   * Collapse indexed files into tags + usages.
   *
   * A scenario carrying a tag both directly and by inheritance yields ONE usage
   * with `origin: 'direct'` — the direct one is the actionable half, since an
   * inherited tag cannot be removed at scenario level.
   */
  private aggregate(state: TagIndex['state']): TagIndex {
    const usages: Record<string, TagUsage[]> = {}
    const featureLevel = new Set<string>()
    const scenarioLevel = new Set<string>()
    const seen = new Set<string>()
    let scenarioCount = 0
    const unparsedFiles: string[] = []

    for (const file of [...this.files.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath))) {
      if (!file.parsed) unparsedFiles.push(file.relativePath)

      for (const featureTag of file.outline.tags) {
        featureLevel.add(featureTag)
        // Ensure a feature tag with no scenarios beneath it still appears.
        usages[featureTag] ??= []
      }

      file.outline.scenarios.forEach((scenario, scenarioIndex) => {
        scenarioCount++
        const direct = new Set(scenario.tags)

        for (const tag of direct) {
          scenarioLevel.add(tag)
          this.pushUsage(usages, seen, tag, file, scenarioIndex, scenario.name, 'direct')
        }
        for (const tag of file.outline.tags) {
          if (direct.has(tag)) continue // already counted as direct
          this.pushUsage(usages, seen, tag, file, scenarioIndex, scenario.name, 'inherited')
        }
      })
    }

    const tags: TagSummary[] = Object.keys(usages)
      .map((name) => ({
        name,
        scenarioCount: usages[name]!.length,
        usedAtFeatureLevel: featureLevel.has(name),
        usedAtScenarioLevel: scenarioLevel.has(name),
        orphaned: usages[name]!.length === 0,
      }))
      // Deterministic: most-used first, then by name. The renderer re-sorts for
      // its own display mode, but a stable base order keeps tests meaningful.
      .sort((a, b) => b.scenarioCount - a.scenarioCount || a.name.localeCompare(b.name))

    return {
      state,
      tags,
      usages,
      unparsedFiles,
      fileCount: this.files.size,
      scenarioCount,
    }
  }

  private pushUsage(
    usages: Record<string, TagUsage[]>,
    seen: Set<string>,
    tag: string,
    file: IndexedFile,
    scenarioIndex: number,
    scenarioName: string,
    origin: TagUsage['origin']
  ): void {
    const id = `${file.relativePath}#${scenarioIndex}`
    const key = `${tag} ${id}`
    if (seen.has(key)) return
    seen.add(key)

    usages[tag] ??= []
    usages[tag]!.push({
      id,
      relativePath: file.relativePath,
      featureName: file.featureName,
      scenarioIndex,
      scenarioName,
      origin,
    })
  }

  // ------------------------------------------------------------------ watching

  private startWatching(featuresDir: string): void {
    this.watcher.close()

    // One-shot guard scoped to THIS attempt: a directory that can never be
    // watched must not error -> rebuild -> re-watch -> error forever.
    let errorHandled = false

    this.watcher.watch(
      featuresDir,
      (relativePaths) => {
        void this.applyChanges(relativePaths)
      },
      () => {
        if (errorHandled) return
        errorHandled = true
        void this.scanAll(featuresDir).catch(() => undefined)
      }
    )
  }

  /** Incremental update. Deliberately does not flip state back to 'building'. */
  private async applyChanges(relativePaths: string[]): Promise<void> {
    const featuresDir = this.featuresDir
    if (!featuresDir) return

    for (const raw of relativePaths) {
      const relativePath = raw.split(path.sep).join('/')
      if (!relativePath.endsWith('.feature')) continue

      if (await fileExists(path.join(featuresDir, relativePath))) {
        this.files.set(relativePath, await this.readFile(featuresDir, relativePath))
      } else {
        this.files.delete(relativePath)
      }
    }

    this.setIndex(this.aggregate('ready'))
  }

  /** Re-read specific files after a write, then re-aggregate. */
  async refreshFiles(relativePaths: string[]): Promise<void> {
    await this.applyChanges(relativePaths)
  }

  // -------------------------------------------------------------------- notify

  private setIndex(index: TagIndex): void {
    this.index = index
    for (const listener of this.listeners) {
      listener(index)
    }
  }
}

async function fileExists(fullPath: string): Promise<boolean> {
  try {
    await fs.access(fullPath)
    return true
  } catch {
    return false
  }
}

let instance: TagService | null = null

export function getTagService(): TagService {
  if (!instance) instance = new TagService()
  return instance
}
