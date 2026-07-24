/**
 * On-disk catalog cache (feature 006-step-catalog, US5, research D7).
 *
 * Stores a `CacheEnvelope` (result + fingerprint) at
 * `<workspace>/.app/cache/step-catalog.json` and invalidates it when any of the
 * fingerprint inputs change: step file mtime+content hash, Playwright config,
 * relevant package config, the catalog schema version, or the engine version.
 * On first write it ensures `<workspace>/.app/.gitignore` excludes the whole
 * SuiSui metadata directory from the user's version control (FR-025).
 */
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import type { StepCatalogResult } from '@suisui/shared'
import type { CacheEnvelope, CacheFingerprint } from './internal-types'

/** Cache-busting token; bump when the engine's analysis semantics change. */
export const ENGINE_VERSION = '0.1.0'

/** Short content hash (16 hex chars of sha256). */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

/** Absolute path of the cache file for a workspace. */
export function cachePath(workspacePath: string): string {
  return join(workspacePath, '.app', 'cache', 'step-catalog.json')
}

function safeHashFile(absPath: string): string | null {
  try {
    return hashContent(readFileSync(absPath, 'utf8'))
  } catch {
    return null
  }
}

export interface FingerprintInput {
  workspacePath: string
  /** Workspace-relative POSIX step file paths. */
  files: string[]
  /** Workspace-relative Playwright config path, if any. */
  configPath?: string
  /** Workspace-relative package/ts config files to track. */
  packageFiles?: string[]
}

/** Build a fingerprint of the inputs that should invalidate the cache. */
export function buildFingerprint(input: FingerprintInput): CacheFingerprint {
  const files: CacheFingerprint['files'] = {}
  for (const rel of input.files) {
    const abs = join(input.workspacePath, rel)
    try {
      const mtimeMs = statSync(abs).mtimeMs
      const hash = safeHashFile(abs) ?? ''
      files[rel] = { mtimeMs, hash }
    } catch {
      files[rel] = { mtimeMs: 0, hash: '' }
    }
  }

  const configAbs = input.configPath ? join(input.workspacePath, input.configPath) : null
  const playwrightConfigHash = configAbs ? (safeHashFile(configAbs) ?? '') : ''

  const packageFiles = input.packageFiles ?? ['package.json', 'tsconfig.json']
  const packageConfigHash = hashContent(
    packageFiles.map((rel) => safeHashFile(join(input.workspacePath, rel)) ?? '').join('|'),
  )

  return { files, playwrightConfigHash, packageConfigHash, engineVersion: ENGINE_VERSION }
}

/** True when two fingerprints are equivalent (same files, hashes, configs). */
export function fingerprintsMatch(a: CacheFingerprint, b: CacheFingerprint): boolean {
  if (a.engineVersion !== b.engineVersion) return false
  if (a.playwrightConfigHash !== b.playwrightConfigHash) return false
  if (a.packageConfigHash !== b.packageConfigHash) return false
  const aKeys = Object.keys(a.files)
  const bKeys = Object.keys(b.files)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    const fa = a.files[key]
    const fb = b.files[key]
    if (!fb || fa!.mtimeMs !== fb.mtimeMs || fa!.hash !== fb.hash) return false
  }
  return true
}

/** Validate a cache envelope against a freshly-computed fingerprint. */
export function isCacheValid(
  envelope: CacheEnvelope,
  currentFingerprint: CacheFingerprint,
  schemaVersion: number,
): boolean {
  if (envelope.schemaVersion !== schemaVersion) return false
  return fingerprintsMatch(envelope.fingerprint, currentFingerprint)
}

/** Read + parse the cache envelope, or null when absent/unreadable. */
export function readCache(workspacePath: string): CacheEnvelope | null {
  try {
    const raw = readFileSync(cachePath(workspacePath), 'utf8')
    return JSON.parse(raw) as CacheEnvelope
  } catch {
    return null
  }
}

/** Ensure `<workspace>/.app/.gitignore` excludes the metadata dir (FR-025). */
function ensureAppGitignore(workspacePath: string): void {
  const gitignore = join(workspacePath, '.app', '.gitignore')
  if (!existsSync(gitignore)) {
    mkdirSync(dirname(gitignore), { recursive: true })
    writeFileSync(gitignore, '*\n')
  }
}

/** Write the cache envelope (creates dirs + the .app/.gitignore guard). */
export function writeCache(
  workspacePath: string,
  result: StepCatalogResult,
  fingerprint: CacheFingerprint,
): void {
  const file = cachePath(workspacePath)
  mkdirSync(dirname(file), { recursive: true })
  ensureAppGitignore(workspacePath)
  const envelope: CacheEnvelope = { schemaVersion: result.schemaVersion, fingerprint, result }
  writeFileSync(file, JSON.stringify(envelope))
}

/** Delete the cache file (no-op when absent). */
export function clearCache(workspacePath: string): void {
  try {
    rmSync(cachePath(workspacePath), { force: true })
  } catch {
    // ignore
  }
}
