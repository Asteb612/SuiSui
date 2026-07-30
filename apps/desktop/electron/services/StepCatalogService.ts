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

/**
 * The step-definition file the app provisions when a workspace is initialised
 * (see `WorkspaceService.ensureDefaultSteps`). Steps sourced from this file are
 * the "generic" fallback tier; everything else is project-authored.
 */
const PROVISIONED_STEPS_FILE = 'steps/generic.steps.ts'

/** Injectable dependencies (Constitution IV — singleton + DI). */
export interface StepCatalogServiceDeps {
  generate?: (options: EngineGenerateOptions) => Promise<StepCatalogResult>
  getWorkspacePath?: () => string | null
  resolveConfigPath?: (workspacePath: string) => string | null
  getFeaturesDir?: (workspacePath: string) => Promise<string>
}

export class StepCatalogService {
  private current: StepCatalogResult | null = null
  private readonly generate_: (options: EngineGenerateOptions) => Promise<StepCatalogResult>
  private readonly getWorkspacePath: () => string | null
  private readonly resolveConfigPath: (workspacePath: string) => string | null
  private readonly getFeaturesDir: (workspacePath: string) => Promise<string>

  constructor(deps: StepCatalogServiceDeps = {}) {
    this.generate_ = deps.generate ?? ((options) => generateCatalog(options))
    this.getWorkspacePath = deps.getWorkspacePath ?? (() => getWorkspaceService().getPath())
    this.resolveConfigPath = deps.resolveConfigPath ?? findExistingPlaywrightConfig
    this.getFeaturesDir =
      deps.getFeaturesDir ?? ((workspacePath) => getWorkspaceService().getFeaturesDir(workspacePath))
  }

  /**
   * Stamp each step's authorship tier (feature 012, FR-008).
   *
   * Derived from the source file, never authored, and applied on EVERY load —
   * including a cache hit — so a workspace whose features directory changed
   * cannot serve a stale tier. Deliberately not part of the cache key.
   */
  private async stampTiers(
    result: StepCatalogResult,
    workspacePath: string,
  ): Promise<StepCatalogResult> {
    let provisioned: string
    try {
      const featuresDir = await this.getFeaturesDir(workspacePath)
      provisioned = `${featuresDir.replace(/\\/g, '/').replace(/\/$/, '')}/${PROVISIONED_STEPS_FILE}`
    } catch (err) {
      // Without a features directory we cannot prove any step is generic.
      // Defaulting everything to `project` is the safe direction: it may lose
      // the fallback preference, but it never demotes a team's own step.
      logger.warn('Could not resolve features dir; treating all steps as project-authored', {
        error: err instanceof Error ? err.message : String(err),
      })
      provisioned = ''
    }

    return {
      ...result,
      steps: result.steps.map((step) => ({
        ...step,
        tier:
          provisioned && step.source.file.replace(/\\/g, '/') === provisioned
            ? ('generic' as const)
            : ('project' as const),
      })),
    }
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
    const generated = await this.generate_(engineOptions)
    const result = await this.stampTiers(generated, workspacePath)
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
    // Re-stamped on the cache path too: the tier is derived, so a cached
    // catalog written before the features directory changed must not win.
    if (envelope) this.current = await this.stampTiers(envelope.result, workspacePath)
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
