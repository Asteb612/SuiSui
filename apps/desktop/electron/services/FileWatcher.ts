import fs from 'node:fs'

/**
 * Seam over recursive directory watching.
 *
 * Exists so services can be tested without depending on real OS watch events,
 * which are platform-specific and timing-dependent (Constitution III).
 */
export interface IFileWatcher {
  /**
   * Start watching `dir` recursively.
   *
   * `onChange` receives paths relative to `dir`, already debounced and
   * de-duplicated. `onError` signals that the watch is no longer trustworthy
   * and the caller should do a full rescan.
   */
  watch(dir: string, onChange: (relativePaths: string[]) => void, onError: (error: Error) => void): void
  close(): void
}

/** Coalescing window: a branch switch touching 200 files becomes one update. */
const DEBOUNCE_MS = 250

/**
 * `fs.watch` with `recursive: true`.
 *
 * Recursive watching only gained Linux support in Node 20.13 and is documented
 * as lossy under heavy churn, so this is deliberately best-effort: correctness
 * never depends on it. Callers rebuild on workspace open and update the index
 * directly on in-app writes; the watcher only catches external edits.
 */
export class NodeFileWatcher implements IFileWatcher {
  private watcher: fs.FSWatcher | null = null
  private timer: NodeJS.Timeout | null = null
  private pending = new Set<string>()

  watch(dir: string, onChange: (relativePaths: string[]) => void, onError: (error: Error) => void): void {
    this.close()

    try {
      this.watcher = fs.watch(dir, { recursive: true }, (_eventType, filename) => {
        if (filename) {
          this.pending.add(filename.toString())
        }
        this.schedule(onChange)
      })
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
      return
    }

    // A file watcher must never be the reason a process stays alive. Without
    // this, any test that registers the IPC handlers leaves an open handle and
    // the runner hangs after the suite finishes.
    this.watcher.unref?.()

    this.watcher.on('error', (error) => {
      // Do not rethrow: a dead watcher must degrade to "rescan", not crash the
      // main process.
      this.close()
      onError(error instanceof Error ? error : new Error(String(error)))
    })
  }

  private schedule(onChange: (relativePaths: string[]) => void): void {
    if (this.timer) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => {
      this.timer = null
      const paths = [...this.pending]
      this.pending.clear()
      if (paths.length > 0) {
        onChange(paths)
      }
    }, DEBOUNCE_MS)
    // Never hold the process open for a pending debounce.
    this.timer.unref?.()
  }

  close(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.pending.clear()
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }
}
