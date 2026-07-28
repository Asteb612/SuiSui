import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Detecting missing Playwright browsers BEFORE a run.
 *
 * SuiSui deliberately drives the **workspace's** Playwright, so browsers are a
 * per-workspace concern: two workspaces on different Playwright versions need
 * different browser builds, and having run tests once elsewhere proves nothing.
 * Upgrading Playwright — an npm-level change that looks harmless — silently
 * invalidates the installed browsers, because each version pins an exact build
 * revision.
 *
 * Without this check the first sign of trouble is Playwright's own
 * "Executable doesn't exist at …/chromium-1223/chrome-linux64/chrome" in the
 * middle of a run log, which reads as a broken test rather than a one-command
 * setup step.
 */

/** A browser build the workspace's Playwright expects to find on disk. */
export interface RequiredBrowser {
  /** Playwright's browser name, e.g. `chromium`. */
  name: string
  /** Pinned build revision, e.g. `1223`. */
  revision: string
  /** Directory Playwright looks in, e.g. `<root>/chromium-1223`. */
  directory: string
}

export interface BrowserStatus {
  /** True when at least one required browser build is absent. */
  needsInstall: boolean
  /** The builds that are missing. Empty when nothing is needed. */
  missing: RequiredBrowser[]
  /**
   * Why no check could be made, when one could not be. Distinct from
   * "nothing missing": an undetectable state must never block a run.
   */
  undetectable?: string
}

/**
 * Where Playwright keeps browser builds.
 *
 * `PLAYWRIGHT_BROWSERS_PATH=0` means "next to the package" and is deliberately
 * NOT handled here — that layout is resolved by Playwright itself and reporting
 * a false "missing" would be worse than not checking.
 */
export function browsersRoot(env: NodeJS.ProcessEnv = process.env): string | null {
  const override = env.PLAYWRIGHT_BROWSERS_PATH
  if (override === '0') return null
  if (override) return override

  switch (process.platform) {
    case 'win32':
      return env.LOCALAPPDATA
        ? path.join(env.LOCALAPPDATA, 'ms-playwright')
        : path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
    default:
      return path.join(os.homedir(), '.cache', 'ms-playwright')
  }
}

/**
 * Playwright's on-disk directory name for a browser.
 *
 * NOT the same as the name in `browsers.json`: dashes become underscores, so
 * `chromium-headless-shell` is stored as `chromium_headless_shell-1223`.
 * Comparing against the manifest name would report an installed browser as
 * missing forever, and re-download it before every single run.
 */
function browserDirName(name: string): string {
  return name.replace(/-/g, '_')
}

/**
 * Which browser builds a workspace's Playwright pins, read from the
 * `browsers.json` that ships inside its own `playwright-core`.
 *
 * Only the browsers a run can actually use are considered: the `-tip-of-tree`
 * channels are opt-in and are never downloaded by a plain `playwright install`,
 * so treating them as missing would demand an install that never completes.
 */
export function requiredBrowsers(
  workspacePath: string,
  root: string,
  browserNames: readonly string[] = ['chromium', 'chromium-headless-shell'],
): RequiredBrowser[] | null {
  const manifest = path.join(
    workspacePath,
    'node_modules',
    'playwright-core',
    'browsers.json',
  )

  let parsed: { browsers?: Array<{ name?: string; revision?: string }> }
  try {
    parsed = JSON.parse(fs.readFileSync(manifest, 'utf-8'))
  } catch {
    return null
  }

  if (!Array.isArray(parsed.browsers)) return null

  const required: RequiredBrowser[] = []
  for (const browser of parsed.browsers) {
    if (typeof browser?.name !== 'string' || !browserNames.includes(browser.name)) continue
    if (browser.revision === undefined || browser.revision === null) continue

    const revision = String(browser.revision)
    required.push({
      name: browser.name,
      revision,
      directory: path.join(root, `${browserDirName(browser.name)}-${revision}`),
    })
  }

  return required.length > 0 ? required : null
}

/**
 * Are the workspace's Playwright browsers installed?
 *
 * Purely a filesystem check — no subprocess, so it is cheap enough to run before
 * every run. Anything it cannot determine reports `needsInstall: false` with a
 * reason: a detection gap must never stop someone running their tests.
 */
export function checkBrowsers(
  workspacePath: string,
  env: NodeJS.ProcessEnv = process.env,
): BrowserStatus {
  const root = browsersRoot(env)
  if (!root) {
    return { needsInstall: false, missing: [], undetectable: 'browsers path is managed by Playwright' }
  }

  const required = requiredBrowsers(workspacePath, root)
  if (!required) {
    return { needsInstall: false, missing: [], undetectable: 'no playwright-core in the workspace' }
  }

  const missing = required.filter((browser) => !fs.existsSync(browser.directory))
  return { needsInstall: missing.length > 0, missing }
}

/** One-line summary naming the builds to install, for a log line or a prompt. */
export function describeMissingBrowsers(status: BrowserStatus): string {
  if (!status.needsInstall) return ''
  const names = [...new Set(status.missing.map((b) => `${b.name} (build ${b.revision})`))]
  return `Playwright browsers are not installed for this workspace: ${names.join(', ')}`
}
