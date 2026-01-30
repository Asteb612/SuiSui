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

// Required dependencies for SuiSui workspaces
const REQUIRED_DEPENDENCIES: RequiredDependency[] = [
  { name: '@playwright/test', version: '^1.40.0', type: 'devDependencies' },
  { name: 'playwright-bdd', version: '^8.0.0', type: 'devDependencies' },
]

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

  async install(workspacePath?: string): Promise<DependencyInstallResult> {
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

    // Determine if we should use npm ci or npm install
    // Use 'install' if package.json was modified (lockfile out of sync) or no lockfile exists
    const packageLockPath = path.join(wsPath, 'package-lock.json')
    const hasLockfile = fs.existsSync(packageLockPath)
    const npmCommand = (packageJsonCheck.wasModified || !hasLockfile) ? 'install' : 'ci'

    logger.info('Installing dependencies', {
      workspacePath: wsPath,
      command: npmCommand,
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
    }

    // Determine npm args - if npmPath is a .js file, we need to run it with node
    const isNpmScript = npmPath.endsWith('.js')
    const args = isNpmScript
      ? [npmPath, npmCommand]
      : [npmCommand]
    const execPath = isNpmScript ? nodePath : npmPath

    const result = await this.commandRunner.exec(execPath, args, {
      cwd: wsPath,
      env,
      timeout: 300000, // 5 minutes
    })

    const duration = Date.now() - startTime

    if (result.code !== 0) {
      logger.error('npm install failed', undefined, {
        exitCode: result.code,
        stderr: result.stderr.substring(0, 500),
      })
      return {
        success: false,
        duration,
        stdout: result.stdout,
        stderr: result.stderr,
        error: `npm ${npmCommand} failed with exit code ${result.code}`,
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

    // Hash the lockfile (might have been created/updated)
    const lockfileHash = await this.hashFile(packageLockPath) || ''

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
