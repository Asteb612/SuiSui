import type { IFileWatcher } from '../../services/FileWatcher'

/**
 * Test double for {@link IFileWatcher}.
 *
 * Emits synchronously so freshness tests assert on real state instead of
 * sleeping and hoping (Constitution III).
 */
export class FakeFileWatcher implements IFileWatcher {
  watchedDir: string | null = null
  closeCount = 0

  private onChange: ((relativePaths: string[]) => void) | null = null
  private onError: ((error: Error) => void) | null = null

  watch(
    dir: string,
    onChange: (relativePaths: string[]) => void,
    onError: (error: Error) => void
  ): void {
    this.watchedDir = dir
    this.onChange = onChange
    this.onError = onError
  }

  close(): void {
    this.closeCount++
    this.watchedDir = null
    this.onChange = null
    this.onError = null
  }

  /** Simulate a debounced batch of file changes. */
  emitChange(...relativePaths: string[]): void {
    this.onChange?.(relativePaths)
  }

  /** Simulate the watcher dying — the service should fall back to a full rescan. */
  emitError(message = 'watch failed'): void {
    this.onError?.(new Error(message))
  }

  get isWatching(): boolean {
    return this.onChange !== null
  }
}
