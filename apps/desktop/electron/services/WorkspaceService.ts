import path from 'node:path'
import fs from 'node:fs/promises'
import type { WorkspaceInfo, WorkspaceValidation } from '@suisui/shared'
import { getSettingsService } from './SettingsService'
import { createLogger } from '../utils/logger'

const logger = createLogger('WorkspaceService')

export class WorkspaceService {
  private currentWorkspace: WorkspaceInfo | null = null

  private async ensurePlaywrightConfig(workspacePath: string): Promise<void> {
    const playwrightConfigPath = path.join(workspacePath, 'playwright.config.ts')
    try {
      await fs.access(playwrightConfigPath)
      logger.debug('playwright.config.ts already exists', { playwrightConfigPath })
    } catch {
      logger.info('Creating playwright.config.ts', { playwrightConfigPath })
      const playwrightConfig = [
        "import { defineConfig } from '@playwright/test'",
        "import { defineBddConfig } from 'playwright-bdd'",
        '',
        'const testDir = defineBddConfig({',
        "  paths: ['features/**/*.feature'],",
        "  steps: ['features/**/*.ts', 'features/**/*.js'],",
        '})',
        '',
        'export default defineConfig({',
        '  testDir,',
        '})',
        '',
      ].join('\n')
      await fs.writeFile(playwrightConfigPath, playwrightConfig, 'utf-8')
      logger.info('playwright.config.ts created', { playwrightConfigPath })
    }
  }

  async validate(workspacePath: string): Promise<WorkspaceValidation> {
    logger.debug('Validating workspace', { workspacePath })
    const errors: string[] = []

    try {
      const stat = await fs.stat(workspacePath)
      if (!stat.isDirectory()) {
        errors.push('Path is not a directory')
        logger.warn('Path is not a directory', { workspacePath })
        return { isValid: false, errors }
      }
    } catch (error) {
      errors.push('Directory does not exist')
      logger.error('Directory does not exist', error instanceof Error ? error : new Error(String(error)), { workspacePath })
      return { isValid: false, errors }
    }

    const packageJsonPath = path.join(workspacePath, 'package.json')
    let hasPackageJson = false
    try {
      await fs.access(packageJsonPath)
      hasPackageJson = true
    } catch (error) {
      errors.push('Missing package.json')
      logger.debug('Missing package.json', { packageJsonPath })
    }

    const featuresPath = path.join(workspacePath, 'features')
    let hasFeaturesDir = false
    try {
      const stat = await fs.stat(featuresPath)
      hasFeaturesDir = stat.isDirectory()
    } catch (error) {
      errors.push('Missing features/ directory')
      logger.debug('Missing features/ directory', { featuresPath })
    }

    const result = {
      isValid: hasPackageJson && hasFeaturesDir,
      errors,
    }
    logger.info('Workspace validation completed', { isValid: result.isValid, errors: result.errors.length })
    return result
  }

  async set(workspacePath: string): Promise<WorkspaceValidation> {
    logger.info('Setting workspace', { workspacePath })
    const validation = await this.validate(workspacePath)

    if (validation.isValid) {
      this.currentWorkspace = {
        path: workspacePath,
        name: path.basename(workspacePath),
        isValid: true,
        hasPackageJson: true,
        hasFeaturesDir: true,
      }

      await this.ensurePlaywrightConfig(workspacePath)

      const settingsService = getSettingsService()
      await settingsService.save({ workspacePath })
      await settingsService.addRecentWorkspace(workspacePath)
      logger.info('Workspace set successfully', { workspacePath, name: this.currentWorkspace.name })
    } else {
      logger.warn('Workspace validation failed', { workspacePath, errors: validation.errors })
    }

    return validation
  }

  async get(): Promise<WorkspaceInfo | null> {
    if (this.currentWorkspace) {
      logger.debug('Returning cached workspace', { path: this.currentWorkspace.path })
      return this.currentWorkspace
    }

    logger.debug('Loading workspace from settings')
    const settingsService = getSettingsService()
    const settings = await settingsService.get()

    if (settings.workspacePath) {
      const validation = await this.validate(settings.workspacePath)
      if (validation.isValid) {
        this.currentWorkspace = {
          path: settings.workspacePath,
          name: path.basename(settings.workspacePath),
          isValid: true,
          hasPackageJson: true,
          hasFeaturesDir: true,
        }
        await this.ensurePlaywrightConfig(settings.workspacePath)
        logger.info('Workspace loaded from settings', { path: this.currentWorkspace.path })
        return this.currentWorkspace
      } else {
        logger.warn('Workspace from settings is invalid', { path: settings.workspacePath, errors: validation.errors })
      }
    }

    logger.debug('No valid workspace found')
    return null
  }

  getPath(): string | null {
    return this.currentWorkspace?.path ?? null
  }

  clear(): void {
    this.currentWorkspace = null
  }

  async init(workspacePath: string): Promise<WorkspaceInfo> {
    logger.info('Initializing workspace', { workspacePath })
    
    // Create package.json if missing
    const packageJsonPath = path.join(workspacePath, 'package.json')
    try {
      await fs.access(packageJsonPath)
      logger.debug('package.json already exists', { packageJsonPath })
    } catch (error) {
      logger.info('Creating package.json', { packageJsonPath })
      const packageJson = {
        name: path.basename(workspacePath),
        version: '1.0.0',
        description: 'BDD Test Project',
        scripts: {
          test: 'npx bddgen && npx playwright test',
        },
        devDependencies: {
          '@playwright/test': '^1.40.0',
          'playwright-bdd': '^6.0.0',
        },
      }
      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2))
      logger.info('package.json created', { packageJsonPath })
    }

    // Create features directory if missing
    const featuresPath = path.join(workspacePath, 'features')
    try {
      await fs.access(featuresPath)
      logger.debug('features/ directory already exists', { featuresPath })
    } catch (error) {
      logger.info('Creating features/ directory', { featuresPath })
      await fs.mkdir(featuresPath, { recursive: true })
      logger.info('features/ directory created', { featuresPath })
    }

    await this.ensurePlaywrightConfig(workspacePath)

    // Now set the workspace
    await this.set(workspacePath)

    const result = {
      path: workspacePath,
      name: path.basename(workspacePath),
      isValid: true,
      hasPackageJson: true,
      hasFeaturesDir: true,
    }
    logger.info('Workspace initialized successfully', { workspacePath, name: result.name })
    return result
  }
}

let workspaceServiceInstance: WorkspaceService | null = null

export function getWorkspaceService(): WorkspaceService {
  if (!workspaceServiceInstance) {
    workspaceServiceInstance = new WorkspaceService()
  }
  return workspaceServiceInstance
}

// For testing: reset the singleton instance
export function resetWorkspaceService(): void {
  workspaceServiceInstance = null
}
