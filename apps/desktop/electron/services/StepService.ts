import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import type {
  StepDefinition,
  StepExportResult,
  DecoratorDefinition,
  StepArgDefinition,
} from '@suisui/shared'
import { getCommandRunner, type ICommandRunner } from './CommandRunner'
import { getWorkspaceService } from './WorkspaceService'
import { createLogger } from '../utils/logger'

const logger = createLogger('StepService')

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
  private commandRunner: ICommandRunner

  constructor(commandRunner?: ICommandRunner) {
    this.commandRunner = commandRunner ?? getCommandRunner()
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

  private getAppRoot(): string {
    // In development: __dirname is electron/services/
    // In production: __dirname is dist-electron/services/
    // App root is always 2 levels up
    const appRoot = path.resolve(__dirname, '..', '..')
    
    // Verify it's the app root by checking for package.json
    const packageJsonPath = path.join(appRoot, 'package.json')
    try {
      fs.accessSync(packageJsonPath)
      return appRoot
    } catch {
      // Fallback: try using app.getAppPath() if available
      try {
        return app.getAppPath()
      } catch {
        // Last resort: assume current structure
        return appRoot
      }
    }
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

    // Get app root and find playwright-bdd package
    const appRoot = this.getAppRoot()
    const appNodeModules = path.join(appRoot, 'node_modules')
    
    // The actual bddgen CLI is in playwright-bdd/dist/cli/index.js
    // The .bin/bddgen wrapper points to bddgen/index.js (a stub), but we can run the real one directly
    const playwrightBddPath = path.join(appNodeModules, 'playwright-bdd')
    const bddgenCliPath = path.join(playwrightBddPath, 'dist', 'cli', 'index.js')
    
    if (!fs.existsSync(bddgenCliPath)) {
      logger.error('bddgen CLI not found', undefined, { 
        appRoot, 
        playwrightBddPath,
        bddgenCliPath
      })
      throw new Error(
        `bddgen CLI not found. Please ensure playwright-bdd is installed: pnpm install`
      )
    }
    
    logger.info('Executing bddgen export', { workspacePath, appRoot, bddgenCliPath })
    
    // In pnpm workspaces, dependencies are in the root node_modules with symlinks
    // We need to ensure Node can resolve modules correctly
    // Run from the monorepo root so pnpm's symlink structure resolves correctly
    const monorepoRoot = path.resolve(appRoot, '..', '..')
    const rootNodeModules = path.join(monorepoRoot, 'node_modules')
    
    logger.debug('Module resolution setup', { monorepoRoot, rootNodeModules, rootExists: fs.existsSync(rootNodeModules) })
    
    const exportScript = [
      "const path = require('node:path');",
      "const fs = require('node:fs');",
      "const { createRequire } = require('node:module');",
      "const packageRequire = createRequire(process.cwd() + path.sep);",
      "const playwrightBddPackageJson = packageRequire.resolve('playwright-bdd/package.json');",
      "const playwrightBddRoot = path.dirname(playwrightBddPackageJson);",
      "const loadConfigPath = path.join(playwrightBddRoot, 'dist', 'playwright', 'loadConfig.js');",
      "const envPath = path.join(playwrightBddRoot, 'dist', 'config', 'env.js');",
      "const genPath = path.join(playwrightBddRoot, 'dist', 'gen', 'index.js');",
      "const { loadConfig } = require(loadConfigPath);",
      "const { getEnvConfigs } = require(envPath);",
      "const { TestFilesGenerator } = require(genPath);",
      "const configCandidates = [",
      "  'playwright.config.ts',",
      "  'playwright.config.js',",
      "  'playwright.config.mjs',",
      "  'playwright.config.cjs',",
      "  path.join('tests', 'playwright.config.ts'),",
      "  path.join('tests', 'playwright.config.js'),",
      "  path.join('tests', 'playwright.config.mjs'),",
      "  path.join('tests', 'playwright.config.cjs'),",
      "];",
      "const resolvedConfig = configCandidates",
      "  .map((candidate) => path.resolve(process.cwd(), candidate))",
      "  .find((candidate) => fs.existsSync(candidate));",
      "if (!resolvedConfig) {",
      "  console.error('Playwright config not found. Expected playwright.config.(ts|js|mjs|cjs) in the workspace root or tests/.');",
      "  process.exit(1);",
      "}",
      "process.env.PLAYWRIGHT_BDD_CONFIG_DIR = path.dirname(resolvedConfig);",
      ";(async () => {",
      "  await loadConfig(resolvedConfig);",
      "  const configs = Object.values(getEnvConfigs())",
      "  if (!configs.length) {",
      "    console.error('No BDD configs found. Ensure defineBddConfig() is called in your Playwright config.')",
      "    process.exit(1)",
      "  }",
      "  const steps = []",
      "  for (const config of configs) {",
      "    const generator = new TestFilesGenerator(config)",
      "    const stepDefinitions = await generator.extractSteps()",
      "    stepDefinitions.forEach((step) => {",
      "      const pattern = typeof step.pattern === 'string' ? step.pattern : step.pattern.source",
      "      const uri = step.uri || ''",
      "      const line = step.line || ''",
      "      const location = uri && line ? `${uri}:${line}` : uri",
      "      steps.push({ keyword: step.keyword, pattern, location })",
      "    })",
      "  }",
      "  process.stdout.write(JSON.stringify({ steps }))",
      "})().catch((err) => {",
      "  console.error(err && err.stack ? err.stack : err)",
      "  process.exit(1)",
      "})",
    ].join('\n')
    const exportScriptBase64 = Buffer.from(exportScript, 'utf8').toString('base64')
    const evalScript = `eval(Buffer.from("${exportScriptBase64}","base64").toString("utf8"))`
    const evalScriptArg = JSON.stringify(evalScript)

    // Run playwright-bdd's generator via Node to output JSON
    const result = await this.commandRunner.exec('node', ['-e', evalScriptArg], {
      cwd: workspacePath,
      timeout: 30000,
      env: {
        ...process.env,
        // Include root node_modules in NODE_PATH for pnpm workspace
        NODE_PATH: [rootNodeModules, appNodeModules].join(path.delimiter),
        // Preserve existing PATH but prepend app's node_modules/.bin
        PATH: `${path.join(appNodeModules, '.bin')}${path.delimiter}${process.env.PATH || ''}`,
      },
    })

    logger.debug('bddgen command completed', {
      exitCode: result.code,
      stdoutLength: result.stdout.length,
      stderrLength: result.stderr.length,
      stdout: result.stdout.substring(0, 500), // First 500 chars for debugging
      stderr: result.stderr.substring(0, 500),
    })

    // Try to parse JSON from stdout first (might succeed even with warnings in stderr)
    let bddgenExport: BddgenExport | null = null
    
    try {
      // Extract JSON from stdout (might have npm warnings mixed in)
      const jsonMatch = result.stdout.match(/\{[\s\S]*\}/)
      const jsonString = jsonMatch ? jsonMatch[0] : result.stdout.trim()
      
      if (jsonString) {
        bddgenExport = JSON.parse(jsonString)
        if (bddgenExport) {
          logger.debug('Successfully parsed bddgen JSON', { stepCount: bddgenExport.steps.length })
        }
      } else {
        logger.warn('No JSON string found in stdout', { stdout: result.stdout })
      }
    } catch (parseError) {
      // JSON parsing failed, will check error below
      logger.warn('Failed to parse bddgen JSON output', { error: parseError, stdout: result.stdout })
      bddgenExport = null
    }

    // If command failed and we couldn't parse JSON, throw error
    if (result.code !== 0 && !bddgenExport) {
      const stderrMsg = result.stderr.trim()
      const stdoutMsg = result.stdout.trim()
      const errorMessage = stderrMsg || stdoutMsg || 'Command failed with no output'
      
      logger.error('bddgen export failed', undefined, {
        exitCode: result.code,
        stderr: result.stderr,
        stdout: result.stdout,
        stderrLength: result.stderr.length,
        stdoutLength: result.stdout.length,
        workspacePath,
      })
      
      // Build detailed error message
      const errorDetails = [
        `Failed to export steps from bddgen`,
        `Exit code: ${result.code}`,
        `Workspace: ${workspacePath}`,
      ]
      
      if (stderrMsg) {
        errorDetails.push(`Stderr: ${stderrMsg.substring(0, 500)}`)
      }
      if (stdoutMsg) {
        errorDetails.push(`Stdout: ${stdoutMsg.substring(0, 500)}`)
      }
      if (!stderrMsg && !stdoutMsg) {
        errorDetails.push(`No output from command (both stdout and stderr are empty)`)
      }
      
      if (errorMessage.includes('playwright-bdd') || errorMessage.includes('bddgen') || errorMessage.includes('ENOENT') || errorMessage.includes('not found') || errorMessage.includes('No such file')) {
        errorDetails.push(`Please ensure both bddgen and playwright-bdd are installed in the app dependencies: pnpm install`)
      }
      
      throw new Error(errorDetails.join('\n'))
    }

    // If we couldn't parse JSON but command succeeded, that's also an error
    if (!bddgenExport) {
      const parseErrorData = {
        exitCode: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
      }
      logger.error('Failed to parse bddgen output', undefined, parseErrorData)
      throw new Error(
        `Failed to parse bddgen output: No valid JSON found in command output.\n` +
        `Exit code: ${result.code}\n` +
        `Stdout: ${result.stdout.substring(0, 500)}\n` +
        `Stderr: ${result.stderr.substring(0, 500)}`
      )
    }

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

export function getStepService(commandRunner?: ICommandRunner): StepService {
  if (!stepServiceInstance) {
    stepServiceInstance = new StepService(commandRunner)
  }
  return stepServiceInstance
}

export function resetStepService(): void {
  stepServiceInstance = null
}
