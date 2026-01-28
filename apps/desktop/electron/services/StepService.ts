import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import { createRequire } from 'node:module'
import type {
  StepDefinition,
  StepExportResult,
  DecoratorDefinition,
  StepArgDefinition,
} from '@suisui/shared'
import { getWorkspaceService } from './WorkspaceService'
import { createLogger } from '../utils/logger'

const logger = createLogger('StepService')

function getBundledDepsPath(): string {
  if (app.isPackaged) {
    // In packaged app, extraResources are in the resources folder next to app.asar
    return path.join(process.resourcesPath, 'bundled-deps')
  }
  // In development, use the local bundled-deps
  return path.resolve(__dirname, '..', '..', 'bundled-deps')
}

interface BddgenStep {
  keyword: 'Given' | 'When' | 'Then'
  pattern: string
  location: string
}

interface BddgenExport {
  steps: BddgenStep[]
}

export class StepService {
  private cache: StepExportResult | null = null

  constructor() {
    // No dependencies needed - runs in-process
  }

  private parseArgs(pattern: string): StepArgDefinition[] {
    const args: StepArgDefinition[] = []
    const regex = /\{(string|int|float|any)(?::(\w+))?\}/g
    let match: RegExpExecArray | null
    let index = 0

    while ((match = regex.exec(pattern)) !== null) {
      const type = match[1] as StepArgDefinition['type']
      const name = match[2] ?? `arg${index}`
      args.push({ name, type, required: true })
      index++
    }

    return args
  }

  private parseDecorator(pattern: string): string | undefined {
    const match = pattern.match(/^@(\w+)\s*/)
    return match?.[1]
  }

  private generateStepId(keyword: string, pattern: string, location: string): string {
    const hash = `${keyword}-${pattern}-${location}`
      .split('')
      .reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0)
    return `step-${Math.abs(hash).toString(16)}`
  }

  async export(): Promise<StepExportResult> {
    logger.info('Starting step export')
    const workspaceService = getWorkspaceService()
    const workspacePath = workspaceService.getPath()

    if (!workspacePath) {
      logger.error('No workspace selected')
      throw new Error('No workspace selected')
    }

    logger.debug('Workspace path', { workspacePath })

    // Use the app's bundled playwright-bdd from extraResources
    const bundledDepsPath = getBundledDepsPath()
    const bundlePath = path.join(bundledDepsPath, 'playwright-bdd-bundle.js')

    logger.debug('Using bundled playwright-bdd', { bundlePath })

    if (!fs.existsSync(bundlePath)) {
      logger.error('Bundled playwright-bdd not found', undefined, { bundlePath })
      throw new Error(
        `playwright-bdd bundle not found. This is an installation error.\n` +
        `Expected at: ${bundlePath}`
      )
    }

    // Find Playwright config
    const configCandidates = [
      'playwright.config.ts',
      'playwright.config.js',
      'playwright.config.mjs',
      'playwright.config.cjs',
      path.join('tests', 'playwright.config.ts'),
      path.join('tests', 'playwright.config.js'),
      path.join('tests', 'playwright.config.mjs'),
      path.join('tests', 'playwright.config.cjs'),
    ]

    const resolvedConfig = configCandidates
      .map((candidate) => path.resolve(workspacePath, candidate))
      .find((candidate) => fs.existsSync(candidate))

    if (!resolvedConfig) {
      throw new Error(
        'Playwright config not found. Expected playwright.config.(ts|js|mjs|cjs) in the workspace root or tests/.'
      )
    }

    logger.debug('Found Playwright config', { resolvedConfig })

    // Set environment for playwright-bdd
    const originalCwd = process.cwd()
    const originalConfigDir = process.env.PLAYWRIGHT_BDD_CONFIG_DIR
    const originalNodePath = process.env.NODE_PATH

    try {
      // Change to workspace directory for proper module resolution
      process.chdir(workspacePath)
      process.env.PLAYWRIGHT_BDD_CONFIG_DIR = path.dirname(resolvedConfig)

      const appRoot = app.isPackaged ? app.getAppPath() : path.resolve(__dirname, '..', '..')
      const appNodeModules = path.join(appRoot, 'node_modules')
      const resourceNodeModules =
        app.isPackaged && typeof process.resourcesPath === 'string'
          ? path.join(process.resourcesPath, 'node_modules')
          : null
      const unpackedNodeModules =
        app.isPackaged && typeof process.resourcesPath === 'string'
          ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
          : null
      const monorepoRoot = path.resolve(appRoot, '..', '..')
      const rootNodeModules = path.join(monorepoRoot, 'node_modules')
      const nodePathParts = [appNodeModules]

      if (resourceNodeModules && fs.existsSync(resourceNodeModules)) {
        nodePathParts.push(resourceNodeModules)
      }
      if (unpackedNodeModules && fs.existsSync(unpackedNodeModules)) {
        nodePathParts.push(unpackedNodeModules)
      }
      if (fs.existsSync(rootNodeModules)) {
        nodePathParts.push(rootNodeModules)
      }
      if (originalNodePath) {
        nodePathParts.push(originalNodePath)
      }

      process.env.NODE_PATH = nodePathParts.join(path.delimiter)
      require('module').Module._initPaths()

      logger.debug('Set up environment', {
        PLAYWRIGHT_BDD_CONFIG_DIR: process.env.PLAYWRIGHT_BDD_CONFIG_DIR,
        cwd: process.cwd(),
        NODE_PATH: process.env.NODE_PATH,
      })

      // Clear require cache for the bundle to ensure fresh load
      delete require.cache[bundlePath]

      // Load from our bundled single file
      const { loadConfig, getEnvConfigs, TestFilesGenerator } = require(bundlePath)

      // Load the Playwright config
      logger.debug('Loading Playwright config', { resolvedConfig })
      await loadConfig(resolvedConfig)

      // Get BDD configs
      const configs = Object.values(getEnvConfigs())
      if (!configs.length) {
        throw new Error(
          'No BDD configs found. Ensure defineBddConfig() is called in your Playwright config.'
        )
      }

      logger.debug('Found BDD configs', { count: configs.length })

      // Extract steps from all configs
      const extractedSteps: BddgenStep[] = []
      for (const config of configs) {
        const generator = new TestFilesGenerator(config as object)
        const stepDefinitions = await generator.extractSteps()
        stepDefinitions.forEach((step: { keyword: string; pattern: string | RegExp; uri?: string; line?: number }) => {
          const pattern = typeof step.pattern === 'string' ? step.pattern : step.pattern.source
          const uri = step.uri || ''
          const line = step.line || ''
          const location = uri && line ? `${uri}:${line}` : uri
          extractedSteps.push({
            keyword: step.keyword as 'Given' | 'When' | 'Then',
            pattern,
            location
          })
        })
      }

      logger.info('Extracted steps', { count: extractedSteps.length })

      const bddgenExport: BddgenExport = { steps: extractedSteps }

      const steps: StepDefinition[] = bddgenExport.steps.map((step) => ({
        id: this.generateStepId(step.keyword, step.pattern, step.location),
        keyword: step.keyword,
        pattern: step.pattern,
        location: step.location,
        args: this.parseArgs(step.pattern),
        decorator: this.parseDecorator(step.pattern),
        isGeneric: false,
      }))

      const decorators = this.extractDecorators(steps)

      this.cache = {
        steps,
        decorators,
        exportedAt: new Date().toISOString(),
      }

      return this.cache
    } catch (err) {
      logger.error('Step export failed', err as Error)
      throw err
    } finally {
      // Restore original state
      process.chdir(originalCwd)
      if (originalConfigDir !== undefined) {
        process.env.PLAYWRIGHT_BDD_CONFIG_DIR = originalConfigDir
      } else {
        delete process.env.PLAYWRIGHT_BDD_CONFIG_DIR
      }
      if (originalNodePath !== undefined) {
        process.env.NODE_PATH = originalNodePath
      } else {
        delete process.env.NODE_PATH
      }
      // Re-init module paths
      require('module').Module._initPaths()
    }
  }

  private extractDecorators(steps: StepDefinition[]): DecoratorDefinition[] {
    const decoratorMap = new Map<string, DecoratorDefinition>()

    for (const step of steps) {
      if (step.decorator && !decoratorMap.has(step.decorator)) {
        decoratorMap.set(step.decorator, {
          name: step.decorator,
          location: step.location,
        })
      }
    }

    return Array.from(decoratorMap.values())
  }

  async getCached(): Promise<StepExportResult | null> {
    return this.cache
  }

  async getDecorators(): Promise<DecoratorDefinition[]> {
    if (this.cache) {
      return this.cache.decorators
    }
    return []
  }

  clearCache(): void {
    this.cache = null
  }

  getStepsByKeyword(keyword: 'Given' | 'When' | 'Then'): StepDefinition[] {
    if (!this.cache) {
      return []
    }
    return this.cache.steps.filter((step) => step.keyword === keyword)
  }

  findMatchingStep(pattern: string): StepDefinition | undefined {
    if (!this.cache) {
      return undefined
    }
    return this.cache.steps.find((step) => step.pattern === pattern)
  }
}

let stepServiceInstance: StepService | null = null

export function getStepService(): StepService {
  if (!stepServiceInstance) {
    stepServiceInstance = new StepService()
  }
  return stepServiceInstance
}

export function resetStepService(): void {
  stepServiceInstance = null
}
