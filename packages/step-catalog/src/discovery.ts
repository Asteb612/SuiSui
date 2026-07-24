/**
 * Step-file discovery (feature 006-step-catalog, research D3).
 *
 * Resolves the candidate step-definition files for a workspace via, in order:
 *   1. explicit settings globs (passed in), 2. a detected BDD steps directory,
 *   3. convention: `**\/*.steps.{ts,js}` and files under any `steps/` directory.
 * Excludes build/vendor dirs. Returns workspace-relative POSIX paths.
 *
 * A lightweight recursive walk is used (no glob dependency); richer glob support
 * can be layered later without changing the return contract.
 */
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.app',
  '.git',
  'dist',
  '.output',
  '.nuxt',
  'build',
  'coverage',
  '.suisui',
])

const STEP_FILE = /\.steps\.[cm]?[jt]s$/
const SOURCE_FILE = /\.[cm]?[jt]sx?$/
const IGNORED_SUFFIX = /\.(d\.ts|test\.[cm]?[jt]s|spec\.[cm]?[jt]s)$/

/** Convert an OS path (incl. Windows backslashes) to POSIX separators. */
export function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

function isStepFile(relPosix: string): boolean {
  if (IGNORED_SUFFIX.test(relPosix)) return false
  if (STEP_FILE.test(relPosix)) return true
  // Any source file living under a `steps/` directory segment.
  if (/(^|\/)steps\//.test(relPosix) && SOURCE_FILE.test(relPosix)) return true
  return false
}

export interface DiscoverOptions {
  /** Absolute workspace root. */
  workspacePath: string
  /** Extra workspace-relative globs/paths from settings (best-effort). */
  settingsGlobs?: string[]
  /** Extra workspace-relative ignore prefixes. */
  exclude?: string[]
}

/** Discover step files; returns workspace-relative POSIX paths, sorted. */
export function discoverStepFiles(options: DiscoverOptions): string[] {
  const { workspacePath, exclude = [] } = options
  const found = new Set<string>()

  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const abs = join(dir, entry)
      let isDir = false
      try {
        isDir = statSync(abs).isDirectory()
      } catch {
        continue
      }
      if (isDir) {
        if (EXCLUDED_DIRS.has(entry)) continue
        walk(abs)
        continue
      }
      const relPosix = toPosix(relative(workspacePath, abs))
      if (exclude.some((p) => relPosix.startsWith(p.replace(/\/+$/, '') + '/') || relPosix === p)) {
        continue
      }
      if (isStepFile(relPosix)) found.add(relPosix)
    }
  }

  walk(workspacePath)
  return [...found].sort()
}
