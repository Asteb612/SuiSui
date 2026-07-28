import fs from 'node:fs/promises'
import path from 'node:path'
import {
  RUN_SNAPSHOT_VERSION,
  type LiveRunState,
  type PersistedRunSnapshot,
} from '@suisui/shared'
import { getWorkspaceService } from './WorkspaceService'
import { createLogger } from '../utils/logger'

const logger = createLogger('RunHistoryService')

const SNAPSHOT_FILE = 'last-run.json'

/**
 * A snapshot older than this is discarded on read.
 *
 * Step statuses describe the code as it was when the run happened. After a week
 * away the feature files have almost certainly moved on, and showing stale
 * red/green next to edited steps is worse than showing nothing.
 */
const MAX_SNAPSHOT_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Persists the last run's per-step outcomes under `<workspace>/.app/`.
 *
 * The whole point of the after-run view is locating the failing step, and that
 * need does not end when the window reloads. Everything here is best-effort: a
 * failure to save or load must never affect running tests, so both paths swallow
 * their errors and degrade to "no previous run".
 */
export class RunHistoryService {
  private snapshotPath(workspacePath: string): string {
    return path.join(workspacePath, '.app', SNAPSHOT_FILE)
  }

  async save(live: LiveRunState, scopeId: string, savedAt: number): Promise<void> {
    const workspacePath = getWorkspaceService().getPath()
    if (!workspacePath) return

    // Nothing useful to restore, and writing it would clobber a real snapshot.
    if (!live.available || Object.keys(live.scenarios).length === 0) return

    const snapshot: PersistedRunSnapshot = {
      version: RUN_SNAPSHOT_VERSION,
      savedAt,
      scopeId,
      live,
    }

    try {
      const target = this.snapshotPath(workspacePath)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, JSON.stringify(snapshot), 'utf-8')
    } catch (error) {
      logger.warn('Could not save the last-run snapshot', { error: String(error) })
    }
  }

  /** The stored snapshot, or null when there is none worth restoring. */
  async load(): Promise<PersistedRunSnapshot | null> {
    const workspacePath = getWorkspaceService().getPath()
    if (!workspacePath) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(await fs.readFile(this.snapshotPath(workspacePath), 'utf-8'))
    } catch {
      // Absent or unreadable — simply no previous run.
      return null
    }

    return this.validate(parsed)
  }

  async clear(): Promise<void> {
    const workspacePath = getWorkspaceService().getPath()
    if (!workspacePath) return
    try {
      await fs.unlink(this.snapshotPath(workspacePath))
    } catch {
      // Already gone.
    }
  }

  /**
   * The file is on disk and may be hand-edited, truncated by a crash, or written
   * by an older version, so it is validated rather than trusted.
   */
  private validate(parsed: unknown): PersistedRunSnapshot | null {
    if (typeof parsed !== 'object' || parsed === null) return null
    const s = parsed as Partial<PersistedRunSnapshot>

    if (s.version !== RUN_SNAPSHOT_VERSION) return null
    if (typeof s.savedAt !== 'number' || typeof s.scopeId !== 'string') return null
    if (Date.now() - s.savedAt > MAX_SNAPSHOT_AGE_MS) return null

    const live = s.live
    if (typeof live !== 'object' || live === null) return null
    if (typeof live.scenarios !== 'object' || live.scenarios === null) return null
    if (!Array.isArray(live.running)) return null

    return {
      version: RUN_SNAPSHOT_VERSION,
      savedAt: s.savedAt,
      scopeId: s.scopeId,
      live: {
        scenarios: live.scenarios,
        // A restored run is never in flight, whatever the file claims.
        running: [],
        available: true,
        reconciled: true,
      },
    }
  }
}

let instance: RunHistoryService | null = null

export function getRunHistoryService(): RunHistoryService {
  if (!instance) instance = new RunHistoryService()
  return instance
}
