import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import { spawn } from 'node:child_process'
import type {
  StepDefinition,
  StepExportResult,
  DecoratorDefinition,
  StepArgDefinition,
} from '@suisui/shared'
import { getWorkspaceService } from './WorkspaceService'
import { getNodeService } from './NodeService'
import { createLogger } from '../utils/logger'

const logger = createLogger('StepService')

function getExportScriptPath(): string {
  if (app.isPackaged) {
    // In packaged app, scripts are unpacked to app.asar.unpacked/scripts
    // This is needed because the embedded Node.js can't read from inside asar
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'scripts', 'bddgen-export.js')
  }
  // In development, use the local script
  return path.resolve(__dirname, '..', 'scripts', 'bddgen-export.js')
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
    // No dependencies needed
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

  private async runBddgenExport(workspacePath: string, configPath: string): Promise<string> {
    const scriptPath = getExportScriptPath()
    const workspaceNodeModules = path.join(workspacePath, 'node_modules')

    logger.debug('Running bddgen export', { scriptPath, workspacePath, configPath })

    if (!fs.existsSync(scriptPath)) {
      throw new Error(
        `Export script not found at: ${scriptPath}\n` +
        `This is an installation error. Please reinstall the application.`
      )
    }

    if (!fs.existsSync(workspaceNodeModules)) {
      throw new Error(
        `Workspace node_modules not found at: ${workspaceNodeModules}\n` +
        `Please ensure dependencies are installed in your workspace.`
      )
    }

    // Get embedded Node.js path
    const nodeService = getNodeService()
    const nodeExecPath = await nodeService.getNodePath()

    if (!nodeExecPath) {
      throw new Error(
        'Node.js runtime not available.\n' +
        'Please restart the application.'
      )
    }

    return new Promise((resolve, reject) => {
      // Use only workspace's node_modules
      const combinedNodePath = workspaceNodeModules

      // Add embedded Node.js bin directory to PATH
      const nodeDir = path.dirname(nodeExecPath)
      const pathParts = [nodeDir, path.join(workspaceNodeModules, '.bin')]
      if (process.env.PATH) {
        pathParts.push(process.env.PATH)
      }

      // Set up environment with NODE_PATH pointing to workspace's node_modules
      const env = {
        ...process.env,
        NODE_PATH: combinedNodePath,
        PATH: pathParts.join(path.delimiter),
      }

      // Run our wrapper script that calls playwright-bdd programmatically
      // This bypasses Commander.js argument parsing issues
      // Pass the workspace's node_modules path so the script can find playwright-bdd
      const args = [scriptPath, configPath, workspaceNodeModules]

      logger.debug('Spawning process', { execPath: nodeExecPath, args, cwd: workspacePath, NODE_PATH: combinedNodePath })

      const child = spawn(nodeExecPath, args, {
        cwd: workspacePath,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.on('data', (data) => {
        stdout += data.toString()
      })

      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      const timeout = setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error('Step export timed out after 60 seconds'))
      }, 60000)

      child.on('close', (code) => {
        clearTimeout(timeout)

        if (code !== 0) {
          logger.error('bddgen export failed', undefined, { code, stdout, stderr })

          // Check for common error patterns and provide helpful messages
          if (stderr.includes('importTestFrom')) {
            reject(new Error(
              `playwright-bdd configuration error.\n\n` +
              `The "importTestFrom" option in your playwright.config.ts should point to a fixtures file ` +
              `that does NOT contain step definitions (no Given, When, Then calls).\n\n` +
              `Step definitions should be in separate files under your steps directory.\n\n` +
              `Details:\n${stderr}`
            ))
          } else if (stderr.includes('Cannot find module')) {
            reject(new Error(
              `Module resolution error during step export.\n\n` +
              `Please ensure your workspace has the required dependencies installed.\n\n` +
              `Details:\n${stderr}`
            ))
          } else {
            reject(new Error(`Step export failed (exit code ${code}):\n${stderr || stdout}`))
          }
          return
        }

        resolve(stdout)
      })

      child.on('error', (err) => {
        clearTimeout(timeout)
        logger.error('Failed to spawn bddgen export', err)
        reject(new Error(`Failed to run step export: ${err.message}`))
      })
    })
  }

  private parseExportOutput(output: string): BddgenStep[] {
    // bddgen export outputs step definitions in a text format like:
    // * Given I am on todo page
    // * When I add todo {string}
    // * Then visible todos count is {int}

    const steps: BddgenStep[] = []
    const lines = output.split('\n').filter(line => line.trim())

    for (const line of lines) {
      // Match patterns like: * Given <pattern> or * When <pattern>
      const match = line.match(/^\*\s*(Given|When|Then)\s+(.+)$/i)
      if (match && match[1] && match[2]) {
        const keyword = match[1]
        const pattern = match[2].trim()

        // Capitalize first letter of keyword
        const normalizedKeyword = (keyword.charAt(0).toUpperCase() + keyword.slice(1).toLowerCase()) as 'Given' | 'When' | 'Then'

        steps.push({
          keyword: normalizedKeyword,
          pattern,
          location: '', // v8 output doesn't include location in this format
        })
      }
    }

    return steps
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

    try {
      // Run bddgen export via subprocess
      const output = await this.runBddgenExport(workspacePath, resolvedConfig)

      logger.debug('bddgen export output', { outputLength: output.length })

      // Parse the output
      const extractedSteps = this.parseExportOutput(output)

      logger.info('Extracted steps', { count: extractedSteps.length })

      const steps: StepDefinition[] = extractedSteps.map((step) => ({
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
