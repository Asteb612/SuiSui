import path from 'node:path'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import type {
  DependencyStatus,
  DependencyInstallResult,
  InstallState,
  RequiredDependency,
  PackageJsonCheckResult,
} from '@suisui/shared'
import { getNodeService, type INodeService } from './NodeService'
import { getCommandRunner, type ICommandRunner } from './CommandRunner'
import { getWorkspaceService } from './WorkspaceService'
import { createLogger } from '../utils/logger'

const logger = createLogger('DependencyService')

/**
 * Absolute ceiling for a dependency install.
 *
 * Deliberately generous: a cold install of a monorepo downloads the pinned
 * package manager, resolves every workspace project, and runs postinstall
 * scripts (builds, Playwright browser downloads). The old flat 5 minutes killed
 * such installs midway, which is worse than useless — it left a half-populated
 * node_modules behind.
 */
const INSTALL_TOTAL_TIMEOUT_MS = 45 * 60 * 1000

/**
 * How long the install may produce *nothing at all* before we call it wedged.
 *
 * This, not the ceiling above, is what actually catches a stuck install.
 * Package managers stream progress the whole way through, so several minutes of
 * complete silence means it is blocked — on a prompt with no answer, or on a
 * lock held by a leftover process — rather than merely slow.
 */
const INSTALL_IDLE_TIMEOUT_MS = 5 * 60 * 1000

// Required dependencies for SuiSui workspaces
const REQUIRED_DEPENDENCIES: RequiredDependency[] = [
  { name: '@playwright/test', version: '^1.40.0', type: 'devDependencies' },
  { name: 'playwright-bdd', version: '^8.0.0', type: 'devDependencies' },
]

/**
 * A workspace's package manager, and the directory its install must run in.
 *
 * `dir` is NOT always the workspace: in a monorepo the lockfile lives at the
 * repo root, and pnpm/yarn refuse to install from a sub-package. Detection
 * therefore walks upwards.
 */
export interface PackageManager {
  readonly name: 'npm' | 'pnpm' | 'yarn'
  /** Directory to run the install in — where the lockfile/workspace file lives. */
  readonly dir: string
  /** True when `dir` is above the opened workspace (a monorepo sub-package). */
  readonly isMonorepoRoot: boolean
}

/**
 * Detect which package manager a workspace uses.
 *
 * Walks up from the workspace looking for a lockfile or workspace manifest,
 * because a project opened at `repo/e2e` may be a member of a pnpm or yarn
 * workspace whose lockfile is at `repo/`. Running `npm install` there fails
 * outright — npm cannot parse pnpm's `workspace:` protocol and reports
 * EUNSUPPORTEDPROTOCOL.
 *
 * Precedence at each level: pnpm, then yarn, then npm. Falls back to npm in the
 * workspace itself when nothing is found, which is the right default for a
 * standalone project.
 */
export function detectPackageManager(workspacePath: string): PackageManager {
  const markers: ReadonlyArray<{ file: string; name: PackageManager['name'] }> = [
    { file: 'pnpm-workspace.yaml', name: 'pnpm' },
    { file: 'pnpm-lock.yaml', name: 'pnpm' },
    { file: 'yarn.lock', name: 'yarn' },
    { file: 'package-lock.json', name: 'npm' },
  ]

  let dir = workspacePath
  for (;;) {
    for (const marker of markers) {
      if (fs.existsSync(path.join(dir, marker.file))) {
        return {
          name: marker.name,
          dir,
          isMonorepoRoot: dir !== workspacePath,
        }
      }
    }

    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return { name: 'npm', dir: workspacePath, isMonorepoRoot: false }
}

/** Scripts a package manager runs as part of installing, in any workspace. */
export const INSTALL_LIFECYCLE_SCRIPTS = [
  'preinstall',
  'install',
  'postinstall',
  'prepare',
] as const

/**
 * Arguments that scope an install to just the opened workspace package.
 *
 * Opening `repo/e2e` means wanting to run that project's tests, not to build
 * every sibling in the monorepo. The install still has to run from the repo
 * root (that is where the lockfile lives), but it does not have to *install*
 * the root: skipping unrelated siblings avoids downloading hundreds of
 * packages, plus their postinstall scripts, that the tests never touch.
 *
 * Returns an empty list — meaning "install everything" — whenever scoping is
 * not safely possible, so the fallback is always the correct-but-slower path.
 */
export function workspaceFilterArgs(
  pm: PackageManager,
  packageName: string | null,
  rootHasInstallScripts: boolean,
): string[] {
  // The opened workspace IS the install root: there is nothing to narrow to.
  if (!pm.isMonorepoRoot) return []
  // An unnamed package cannot be referenced by any of the filter syntaxes.
  if (!packageName) return []
  // A root install script routinely reaches across the whole repo — this one,
  // for instance, builds two sibling packages:
  //
  //   "postinstall": "pnpm --filter @acme/shared run build && pnpm --filter @acme/gql run build"
  //
  // Those siblings sit outside the opened package's dependency closure, so a
  // filtered install prunes their dependencies from the store and then runs a
  // script that needs them. The script fails on a missing module, and the
  // damage outlives the run: the sibling keeps a node_modules entry whose
  // symlink now dangles. Scoping is only safe when the root stays out of it.
  if (rootHasInstallScripts) return []

  switch (pm.name) {
    case 'pnpm':
      // The trailing "..." also selects the package's workspace dependencies.
      // Without it a `workspace:` link resolves to nothing and the tests fail
      // on a missing import rather than on anything they were meant to check.
      return ['--filter', `${packageName}...`]
    case 'npm':
      return ['--workspace', packageName]
    case 'yarn':
      // Classic yarn has no per-workspace install, and Berry spells it as a
      // different verb entirely (`yarn workspaces focus`) rather than a flag on
      // install. Telling the two apart reliably is not worth it here — a full
      // install is slower but always right.
      return []
  }
}

/**
 * Extract major version from a semver range like "^8.0.0", "~6.6.0", "1.2.3", etc.
 * Returns null if the version string can't be parsed.
 */
function extractMajorVersion(versionRange: string): number | null {
  // Remove leading ^ or ~ or >= or other prefixes
  const match = versionRange.match(/(\d+)\./)
  if (match && match[1]) {
    return parseInt(match[1], 10)
  }
  return null
}

/**
 * Check if an installed version meets the minimum required version.
 * For caret ranges like ^8.0.0, we check if the major version is >= required major.
 */
function meetsVersionRequirement(installedVersion: string, requiredVersion: string): boolean {
  const installedMajor = extractMajorVersion(installedVersion)
  const requiredMajor = extractMajorVersion(requiredVersion)

  if (installedMajor === null || requiredMajor === null) {
    // Can't parse, assume it's ok
    return true
  }

  return installedMajor >= requiredMajor
}

export interface IDependencyService {
  checkStatus(workspacePath?: string): Promise<DependencyStatus>
  checkPackageJson(workspacePath?: string): Promise<PackageJsonCheckResult>
  ensureRequiredDependencies(workspacePath?: string): Promise<PackageJsonCheckResult>
  install(workspacePath?: string): Promise<DependencyInstallResult>
}

export class DependencyService implements IDependencyService {
  private nodeService: INodeService
  private commandRunner: ICommandRunner

  constructor(nodeService?: INodeService, commandRunner?: ICommandRunner) {
    this.nodeService = nodeService ?? getNodeService()
    this.commandRunner = commandRunner ?? getCommandRunner()
  }

  private getInstallStatePath(workspacePath: string): string {
    return path.join(workspacePath, '.suisui', 'install-state.json')
  }

  private async hashFile(filePath: string): Promise<string | null> {
    try {
      const content = await fs.promises.readFile(filePath)
      return createHash('sha256').update(content).digest('hex')
    } catch {
      return null
    }
  }

  private async readInstallState(workspacePath: string): Promise<InstallState | null> {
    try {
      const statePath = this.getInstallStatePath(workspacePath)
      if (!fs.existsSync(statePath)) {
        return null
      }
      const content = await fs.promises.readFile(statePath, 'utf-8')
      return JSON.parse(content) as InstallState
    } catch {
      return null
    }
  }

  private async writeInstallState(workspacePath: string, state: InstallState): Promise<void> {
    const statePath = this.getInstallStatePath(workspacePath)
    const stateDir = path.dirname(statePath)

    await fs.promises.mkdir(stateDir, { recursive: true })
    await fs.promises.writeFile(statePath, JSON.stringify(state, null, 2))
  }

  private async readPackageJson(workspacePath: string): Promise<Record<string, unknown> | null> {
    const packageJsonPath = path.join(workspacePath, 'package.json')
    try {
      const content = await fs.promises.readFile(packageJsonPath, 'utf-8')
      return JSON.parse(content) as Record<string, unknown>
    } catch {
      return null
    }
  }

  private async writePackageJson(workspacePath: string, packageJson: Record<string, unknown>): Promise<void> {
    const packageJsonPath = path.join(workspacePath, 'package.json')
    await fs.promises.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')
  }

  async checkPackageJson(workspacePath?: string): Promise<PackageJsonCheckResult> {
    const wsPath = workspacePath ?? getWorkspaceService().getPath()
    if (!wsPath) {
      return {
        isValid: false,
        missingDeps: [],
        outdatedDeps: [],
        packageJsonExists: false,
        wasModified: false,
      }
    }

    const packageJson = await this.readPackageJson(wsPath)
    if (!packageJson) {
      return {
        isValid: false,
        missingDeps: REQUIRED_DEPENDENCIES,
        outdatedDeps: [],
        packageJsonExists: false,
        wasModified: false,
      }
    }

    const dependencies = (packageJson.dependencies || {}) as Record<string, string>
    const devDependencies = (packageJson.devDependencies || {}) as Record<string, string>

    const missingDeps: RequiredDependency[] = []
    const outdatedDeps: RequiredDependency[] = []

    for (const required of REQUIRED_DEPENDENCIES) {
      const inDeps = dependencies[required.name]
      const inDevDeps = devDependencies[required.name]
      const installedVersion = inDeps || inDevDeps

      if (!installedVersion) {
        missingDeps.push(required)
      } else if (!meetsVersionRequirement(installedVersion, required.version)) {
        // Dependency exists but version is too old
        outdatedDeps.push(required)
        logger.info('Outdated dependency detected', {
          name: required.name,
          installed: installedVersion,
          required: required.version,
        })
      }
    }

    logger.debug('Package.json check result', {
      workspacePath: wsPath,
      missingDeps: missingDeps.map((d) => d.name),
      outdatedDeps: outdatedDeps.map((d) => d.name),
    })

    return {
      isValid: missingDeps.length === 0 && outdatedDeps.length === 0,
      missingDeps,
      outdatedDeps,
      packageJsonExists: true,
      wasModified: false,
    }
  }

  async ensureRequiredDependencies(workspacePath?: string): Promise<PackageJsonCheckResult> {
    const wsPath = workspacePath ?? getWorkspaceService().getPath()
    if (!wsPath) {
      return {
        isValid: false,
        missingDeps: [],
        outdatedDeps: [],
        packageJsonExists: false,
        wasModified: false,
      }
    }

    const checkResult = await this.checkPackageJson(wsPath)

    if (checkResult.isValid) {
      return checkResult
    }

    if (!checkResult.packageJsonExists) {
      logger.warn('package.json not found, cannot add dependencies', { workspacePath: wsPath })
      return checkResult
    }

    // Read package.json and add/update dependencies
    const packageJson = await this.readPackageJson(wsPath)
    if (!packageJson) {
      return checkResult
    }

    let modified = false
    const dependencies = (packageJson.dependencies || {}) as Record<string, string>
    const devDependencies = (packageJson.devDependencies || {}) as Record<string, string>

    // Add missing dependencies
    for (const missing of checkResult.missingDeps) {
      const targetSection = missing.type as 'dependencies' | 'devDependencies'

      if (!packageJson[targetSection]) {
        packageJson[targetSection] = {}
      }

      const section = packageJson[targetSection] as Record<string, string>
      section[missing.name] = missing.version
      modified = true

      logger.info('Adding missing dependency', {
        workspacePath: wsPath,
        dependency: missing.name,
        version: missing.version,
        section: targetSection,
      })
    }

    // Update outdated dependencies
    for (const outdated of checkResult.outdatedDeps || []) {
      // Find which section the dependency is in and update it
      if (dependencies[outdated.name]) {
        const oldVersion = dependencies[outdated.name]
        dependencies[outdated.name] = outdated.version
        modified = true
        logger.info('Updating outdated dependency', {
          workspacePath: wsPath,
          dependency: outdated.name,
          oldVersion,
          newVersion: outdated.version,
          section: 'dependencies',
        })
      } else if (devDependencies[outdated.name]) {
        const oldVersion = devDependencies[outdated.name]
        devDependencies[outdated.name] = outdated.version
        modified = true
        logger.info('Updating outdated dependency', {
          workspacePath: wsPath,
          dependency: outdated.name,
          oldVersion,
          newVersion: outdated.version,
          section: 'devDependencies',
        })
      }
    }

    if (modified) {
      packageJson.dependencies = dependencies
      packageJson.devDependencies = devDependencies
      await this.writePackageJson(wsPath, packageJson)
      logger.info('Updated package.json with required dependencies', { workspacePath: wsPath })
    }

    return {
      isValid: true,
      missingDeps: [],
      outdatedDeps: [],
      packageJsonExists: true,
      wasModified: modified,
    }
  }

  /**
   * Check if actually installed package versions in node_modules meet requirements.
   * This catches cases where package.json was updated but npm install wasn't run.
   */
  private checkInstalledVersions(workspacePath: string): { needsUpdate: boolean; outdated: string[] } {
    const nodeModulesPath = path.join(workspacePath, 'node_modules')
    const outdated: string[] = []

    for (const required of REQUIRED_DEPENDENCIES) {
      const pkgJsonPath = path.join(nodeModulesPath, required.name, 'package.json')
      try {
        if (fs.existsSync(pkgJsonPath)) {
          const content = fs.readFileSync(pkgJsonPath, 'utf-8')
          const pkg = JSON.parse(content) as { version?: string }
          if (pkg.version && !meetsVersionRequirement(pkg.version, required.version)) {
            outdated.push(`${required.name}@${pkg.version} (requires ${required.version})`)
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    return { needsUpdate: outdated.length > 0, outdated }
  }

  async checkStatus(workspacePath?: string): Promise<DependencyStatus> {
    const wsPath = workspacePath ?? getWorkspaceService().getPath()
    if (!wsPath) {
      return { needsInstall: false }
    }

    const packageJsonPath = path.join(wsPath, 'package.json')
    const nodeModulesPath = path.join(wsPath, 'node_modules')
    const packageLockPath = path.join(wsPath, 'package-lock.json')

    // First check if it's a Node.js project
    if (!fs.existsSync(packageJsonPath)) {
      // Not a Node.js project
      return { needsInstall: false }
    }

    // Check if node_modules exists
    if (!fs.existsSync(nodeModulesPath)) {
      logger.info('node_modules missing, install needed', { workspacePath: wsPath })
      return { needsInstall: true, reason: 'missing' }
    }

    // Check if installed versions are outdated
    const installedCheck = this.checkInstalledVersions(wsPath)
    if (installedCheck.needsUpdate) {
      logger.info('Outdated packages in node_modules, install needed', {
        workspacePath: wsPath,
        outdated: installedCheck.outdated,
      })
      return { needsInstall: true, reason: 'missing' }
    }

    // Check if package-lock.json exists
    if (!fs.existsSync(packageLockPath)) {
      // Has package.json but no lockfile, check install state
      const lastState = await this.readInstallState(wsPath)
      if (!lastState) {
        return { needsInstall: true, reason: 'missing' }
      }
      return { needsInstall: false, lastInstallState: lastState }
    }

    // Hash current lockfile
    const currentHash = await this.hashFile(packageLockPath)
    if (!currentHash) {
      return { needsInstall: false }
    }

    // Read stored install state
    const lastState = await this.readInstallState(wsPath)
    if (!lastState) {
      logger.info('No install state found, install needed', { workspacePath: wsPath })
      return { needsInstall: true, reason: 'missing' }
    }

    // Compare hashes
    if (lastState.lockfileHash !== currentHash) {
      logger.info('Lockfile changed, install needed', {
        workspacePath: wsPath,
        storedHash: lastState.lockfileHash.substring(0, 8),
        currentHash: currentHash.substring(0, 8),
      })
      return {
        needsInstall: true,
        reason: 'lockfile_changed',
        lastInstallState: lastState,
      }
    }

    return { needsInstall: false, lastInstallState: lastState }
  }

  async install(
    workspacePath?: string,
    onOutput?: (stream: 'stdout' | 'stderr', data: string) => void,
  ): Promise<DependencyInstallResult> {
    const wsPath = workspacePath ?? getWorkspaceService().getPath()
    if (!wsPath) {
      return {
        success: false,
        duration: 0,
        stdout: '',
        stderr: 'No workspace selected',
        error: 'No workspace selected',
      }
    }

    const startTime = Date.now()

    // First, ensure package.json has required dependencies
    const packageJsonCheck = await this.ensureRequiredDependencies(wsPath)
    if (!packageJsonCheck.packageJsonExists) {
      return {
        success: false,
        duration: Date.now() - startTime,
        stdout: '',
        stderr: 'package.json not found in workspace',
        error: 'package.json not found in workspace',
      }
    }

    if (packageJsonCheck.wasModified) {
      logger.info('package.json was updated with required dependencies', { workspacePath: wsPath })
    }

    // Ensure Node runtime is available
    const runtimeResult = await this.nodeService.ensureRuntime()
    if (!runtimeResult.success) {
      return {
        success: false,
        duration: Date.now() - startTime,
        stdout: '',
        stderr: runtimeResult.error || 'Failed to ensure Node runtime',
        error: runtimeResult.error,
      }
    }

    const nodePath = await this.nodeService.getNodePath()
    const npmPath = await this.nodeService.getNpmPath()

    if (!nodePath || !npmPath) {
      return {
        success: false,
        duration: Date.now() - startTime,
        stdout: '',
        stderr: 'Node or npm path not found',
        error: 'Node or npm path not found',
      }
    }

    // Which package manager does this project use, and where must it run?
    const pm = detectPackageManager(wsPath)
    const installDir = pm.dir

    // Reinstall from scratch when we changed package.json or there is no
    // lockfile; otherwise honour the lockfile exactly.
    //   npm  : install / ci
    //   pnpm : install / install --frozen-lockfile
    //   yarn : install / install --immutable  (Berry; classic ignores it)
    const lockfiles: Record<PackageManager['name'], string> = {
      npm: 'package-lock.json',
      pnpm: 'pnpm-lock.yaml',
      yarn: 'yarn.lock',
    }
    const hasLockfile = fs.existsSync(path.join(installDir, lockfiles[pm.name]))
    const reinstall = packageJsonCheck.wasModified || !hasLockfile

    const baseArgs: string[] =
      pm.name === 'npm'
        ? [reinstall ? 'install' : 'ci']
        : pm.name === 'pnpm'
          ? reinstall ? ['install'] : ['install', '--frozen-lockfile']
          : reinstall ? ['install'] : ['install', '--immutable']

    // Narrow the install to the opened package when it is one member of a
    // larger repo. Siblings already on disk are left untouched — a filtered
    // install adds to node_modules, it does not prune what it skipped.
    const workspacePackageJson = await this.readPackageJson(wsPath)
    const packageName =
      typeof workspacePackageJson?.name === 'string' ? workspacePackageJson.name : null

    const rootPackageJson = pm.isMonorepoRoot ? await this.readPackageJson(installDir) : null
    const rootScripts = (rootPackageJson?.scripts ?? {}) as Record<string, unknown>
    const rootHasInstallScripts = INSTALL_LIFECYCLE_SCRIPTS.some(
      (script) => typeof rootScripts[script] === 'string',
    )

    const filterArgs = workspaceFilterArgs(pm, packageName, rootHasInstallScripts)
    const pmArgs = [...baseArgs, ...filterArgs]

    logger.info('Installing dependencies', {
      workspacePath: wsPath,
      packageManager: pm.name,
      installDir,
      isMonorepoRoot: pm.isMonorepoRoot,
      scopedTo: filterArgs.length > 0 ? packageName : null,
      rootHasInstallScripts,
      args: pmArgs,
      nodePath,
      npmPath,
    })

    // Build environment
    const nodeDir = path.dirname(nodePath)
    const env: Record<string, string> = {
      npm_config_fund: 'false',
      npm_config_audit: 'false',
      npm_config_update_notifier: 'false',
      PATH: nodeDir + path.delimiter + (process.env.PATH || ''),
      // Corepack downloads the pinned package manager on first use and asks
      // "Do you want to continue? [Y/n]" before doing so. We run without a TTY,
      // so that prompt never receives an answer and the install hangs until the
      // timeout. Answering up front is the documented way to run corepack
      // non-interactively.
      COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
      // A workspace may pin a package manager (`packageManager` in
      // package.json) that corepack's strict mode refuses to run. Honour the
      // project's choice rather than failing the install over it.
      COREPACK_ENABLE_STRICT: '0',
      // Suppress interactive progress/prompts in the package managers too.
      CI: '1',
      // Answer the prompts we know about, up front, instead of relying on the
      // package manager's own CI detection.
      //
      // pnpm asks "The modules directory ... will be removed and reinstalled
      // from scratch. Proceed? (Y/n)" whenever node_modules was built under
      // different settings. With no TTY that question is never answered and the
      // install simply stops — output, then silence, forever. Answering "yes"
      // is the only non-blocking option: the alternative is aborting an install
      // the user explicitly asked for.
      npm_config_confirm_modules_purge: 'false',
      // Applies to any `npx`/`pnpm dlx` a postinstall script shells out to.
      npm_config_yes: 'true',
    }

    // How to invoke the chosen package manager.
    //
    // npm ships with the embedded Node runtime, so it is called directly (via
    // `node npm-cli.js` when the resolved path is a script).
    //
    // pnpm and yarn do not ship with us. Corepack does — it is bundled with
    // Node >= 16 — and is the supported way to run them without a global
    // install, so we shell out through it. If corepack is unavailable the run
    // fails with the package manager's own error, which is clearer than
    // silently falling back to npm and emitting EUNSUPPORTEDPROTOCOL.
    const isNpmScript = npmPath.endsWith('.js')
    const corepackPath = path.join(nodeDir, 'corepack')

    const { execPath, args } =
      pm.name === 'npm'
        ? {
            execPath: isNpmScript ? nodePath : npmPath,
            args: isNpmScript ? [npmPath, ...pmArgs] : pmArgs,
          }
        : {
            execPath: nodePath,
            args: [corepackPath, pm.name, ...pmArgs],
          }

    // Announce what is about to happen BEFORE the slow part. A first run
    // downloads the pinned package manager and then installs a whole monorepo,
    // which can take minutes; without this the UI shows nothing at all.
    onOutput?.(
      'stdout',
      `Installing dependencies with ${pm.name} ${pmArgs.join(' ')}\n` +
        `Directory: ${installDir}${pm.isMonorepoRoot ? ' (monorepo root)' : ''}\n` +
        (filterArgs.length > 0
          ? `Scoped to ${packageName} and its workspace dependencies — siblings are skipped.\n`
          : ''),
    )

    const result = await this.commandRunner.exec(execPath, args, {
      cwd: installDir,
      env,
      timeout: INSTALL_TOTAL_TIMEOUT_MS,
      idleTimeout: INSTALL_IDLE_TIMEOUT_MS,
      onOutput,
    })

    const duration = Date.now() - startTime

    if (result.code !== 0) {
      logger.error(`${pm.name} install failed`, undefined, {
        exitCode: result.code,
        timedOut: result.timedOut ?? false,
        stderr: result.stderr.substring(0, 500),
      })
      // A timeout is not "exit code -1" to a user — say what actually happened
      // and, for the idle case, that the command had simply stopped producing
      // output. `result.stderr` already carries the tail that shows where.
      const error = result.timedOut
        ? `${pm.name} ${pmArgs.join(' ')} was stopped after ${Math.round(duration / 1000)}s — ` +
          (result.timedOut === 'idle'
            ? `it produced no output for ${INSTALL_IDLE_TIMEOUT_MS / 60000} minutes and appears to be stuck.`
            : `it exceeded the ${INSTALL_TOTAL_TIMEOUT_MS / 60000} minute limit.`)
        : `${pm.name} ${pmArgs.join(' ')} failed with exit code ${result.code}`

      return {
        success: false,
        duration,
        stdout: result.stdout,
        stderr: result.stderr,
        error,
      }
    }

    // Get node and npm versions for state tracking
    const nodeVersionResult = await this.commandRunner.exec(nodePath, ['--version'], {
      timeout: 5000,
    })
    const npmVersionArgs = isNpmScript ? [npmPath, '--version'] : ['--version']
    const npmVersionResult = await this.commandRunner.exec(
      isNpmScript ? nodePath : npmPath,
      npmVersionArgs,
      { timeout: 5000 }
    )

    // Hash the lockfile (might have been created/updated). Use the detected
    // package manager's lockfile at the directory the install actually ran in,
    // not npm's in the workspace — otherwise a pnpm monorepo hashes a file that
    // never exists and the install is treated as stale on every launch.
    const lockfileHash =
      (await this.hashFile(path.join(installDir, lockfiles[pm.name]))) || ''

    // Save install state
    const installState: InstallState = {
      lockfileHash,
      installedAt: new Date().toISOString(),
      nodeVersion: nodeVersionResult.stdout.trim(),
      npmVersion: npmVersionResult.stdout.trim(),
    }

    await this.writeInstallState(wsPath, installState)

    logger.info('Dependencies installed successfully', {
      workspacePath: wsPath,
      duration,
      nodeVersion: installState.nodeVersion,
      npmVersion: installState.npmVersion,
    })

    return {
      success: true,
      duration,
      stdout: result.stdout,
      stderr: result.stderr,
    }
  }
}

let dependencyServiceInstance: DependencyService | null = null

export function getDependencyService(
  nodeService?: INodeService,
  commandRunner?: ICommandRunner
): DependencyService {
  if (!dependencyServiceInstance) {
    dependencyServiceInstance = new DependencyService(nodeService, commandRunner)
  }
  return dependencyServiceInstance
}

export function resetDependencyService(): void {
  dependencyServiceInstance = null
}
