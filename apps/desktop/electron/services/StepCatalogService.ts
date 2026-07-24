import type {
  CatalogStep,
  CatalogStepKeyword,
  GenerateCatalogOptions,
  StepCatalogResult,
} from '@suisui/shared'
import { patternToRegex } from '@suisui/shared'
import { generateCatalog, readCache, clearCache as clearDiskCache } from '@suisui/step-catalog'
import type { EngineGenerateOptions } from '@suisui/step-catalog'
import { getWorkspaceService, findExistingPlaywrightConfig } from './WorkspaceService'
import { createLogger } from '../utils/logger'

const logger = createLogger('StepCatalogService')

/** Injectable dependencies (Constitution IV — singleton + DI). */
export interface StepCatalogServiceDeps {
  generate?: (options: EngineGenerateOptions) => Promise<StepCatalogResult>
  getWorkspacePath?: () => string | null
  resolveConfigPath?: (workspacePath: string) => string | null
}

export class StepCatalogService {
  private current: StepCatalogResult | null = null
  private readonly generate_: (options: EngineGenerateOptions) => Promise<StepCatalogResult>
  private readonly getWorkspacePath: () => string | null
  private readonly resolveConfigPath: (workspacePath: string) => string | null

  constructor(deps: StepCatalogServiceDeps = {}) {
    this.generate_ = deps.generate ?? ((options) => generateCatalog(options))
    this.getWorkspacePath = deps.getWorkspacePath ?? (() => getWorkspaceService().getPath())
    this.resolveConfigPath = deps.resolveConfigPath ?? findExistingPlaywrightConfig
  }

  /** Generate (or refresh) the catalog for the active workspace. */
  async generate(options?: GenerateCatalogOptions): Promise<StepCatalogResult> {
    const workspacePath = this.getWorkspacePath()
    if (!workspacePath) {
      logger.error('No workspace selected')
      throw new Error('No workspace selected')
    }

    const configPath = this.resolveConfigPath(workspacePath) ?? undefined
    const engineOptions: EngineGenerateOptions = {
      workspacePath,
      configPath,
      force: options?.force,
      include: options?.include,
      exclude: options?.exclude,
    }

    logger.info('Generating step catalog', { workspacePath, configPath })
    const result = await this.generate_(engineOptions)
    this.current = result
    logger.info('Step catalog generated', {
      steps: result.steps.length,
      analyzedFiles: result.analyzedFiles,
      durationMs: result.durationMs,
    })
    return result
  }

  /** Return the in-memory result, falling back to the on-disk cache. */
  async getCached(): Promise<StepCatalogResult | null> {
    if (this.current) return this.current
    const workspacePath = this.getWorkspacePath()
    if (!workspacePath) return null
    const envelope = readCache(workspacePath)
    if (envelope) this.current = envelope.result
    return this.current
  }

  /** Drop the in-memory result and delete the on-disk cache. */
  async clearCache(): Promise<void> {
    this.current = null
    const workspacePath = this.getWorkspacePath()
    if (workspacePath) clearDiskCache(workspacePath)
  }

  /** Look up a step by its stable ID within the current result. */
  getStepById(id: string): CatalogStep | undefined {
    return this.current?.steps.find((step) => step.id === id)
  }

  /** Find catalog steps whose pattern matches the given step text. */
  findMatchingSteps(text: string, keyword?: CatalogStepKeyword): CatalogStep[] {
    if (!this.current) return []
    return this.current.steps.filter((step) => {
      if (keyword && step.keyword !== keyword) return false
      try {
        return patternToRegex(step.pattern.source).test(text)
      } catch {
        return false
      }
    })
  }
}

let instance: StepCatalogService | null = null

export function getStepCatalogService(): StepCatalogService {
  if (!instance) instance = new StepCatalogService()
  return instance
}

export function resetStepCatalogService(): void {
  instance = null
}
