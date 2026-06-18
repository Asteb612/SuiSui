import type { AIProviderConfig, AIProviderStatus } from '@suisui/shared'
import { DEFAULT_AI_PROVIDER_CONFIG } from '@suisui/shared'
import { createLogger } from '../../utils/logger'
import { getSettingsService, type SettingsService } from '../SettingsService'
import { getAICredentialsService, type AICredentialsService } from './AICredentialsService'
import type { IAIProvider, AIStreamRequest } from './IAIProvider'
import { VercelAIProvider } from './VercelAIProvider'
import { ClaudeSubscriptionProvider } from './ClaudeSubscriptionProvider'

const logger = createLogger('AIService')

const NOT_CONFIGURED_STATUS: AIProviderStatus = {
  available: false,
  reason: 'No AI provider configured',
  models: null,
  detail: null,
}

export interface AIServiceDeps {
  /** Inject a provider directly (tests use FakeAIProvider). Bypasses config-based resolution. */
  provider?: IAIProvider
  settingsService?: SettingsService
  credentialsService?: AICredentialsService
}

/**
 * High-level AI use cases (singleton + DI). Reads the active AIProviderConfig,
 * selects the matching provider, and exposes status + streaming generation.
 *
 * The LLM is a DRAFT GENERATOR only — correctness is enforced downstream by
 * ValidationService (spec FR-013). This service never inserts into a scenario.
 */
export class AIService {
  private providerOverride?: IAIProvider
  private settingsService: SettingsService
  private credentialsService: AICredentialsService

  constructor(deps: AIServiceDeps = {}) {
    this.providerOverride = deps.provider
    this.settingsService = deps.settingsService ?? getSettingsService()
    this.credentialsService = deps.credentialsService ?? getAICredentialsService()
  }

  /** Current non-secret config, with `hasApiKey` reflecting stored credentials. */
  async getConfig(): Promise<AIProviderConfig> {
    const settings = await this.settingsService.get()
    const config = settings.aiProvider ?? { ...DEFAULT_AI_PROVIDER_CONFIG }
    return { ...config, hasApiKey: await this.credentialsService.hasKey() }
  }

  async setConfig(config: AIProviderConfig): Promise<void> {
    // Never persist a secret here; hasApiKey is derived from the credentials store.
    const hasApiKey = await this.credentialsService.hasKey()
    await this.settingsService.save({ aiProvider: { ...config, hasApiKey } })
    logger.info('AI provider config saved', { type: config.type, model: config.model })
  }

  async status(): Promise<AIProviderStatus> {
    const provider = await this.resolveProvider()
    if (!provider) return NOT_CONFIGURED_STATUS
    return provider.status()
  }

  /** Stream incremental text deltas for a request. Throws if no provider configured. */
  async *stream(req: AIStreamRequest): AsyncIterable<string> {
    const provider = await this.resolveProvider()
    if (!provider) {
      throw new Error('No AI provider configured')
    }
    yield* provider.stream({ ...req, input: this.buildPrompt(req) })
  }

  /**
   * Build the prompt for a request. The model is a DRAFT generator; generated
   * Gherkin is validated downstream before it can be accepted.
   */
  private buildPrompt(req: AIStreamRequest): string {
    if (req.kind === 'scenario') {
      return this.buildScenarioPrompt(req)
    }
    return req.input
  }

  private buildScenarioPrompt(req: AIStreamRequest): string {
    const stepList = req.context.steps
      .map((s) => `- ${s.keyword} ${s.pattern}`)
      .join('\n')
    return [
      'You are helping author a Gherkin .feature scenario for a BDD test.',
      'Reuse the EXISTING step definitions below wherever they match the intent;',
      'prefer them over inventing new steps. Output ONLY valid Gherkin (a Feature',
      'with one Scenario), no explanations, no code fences.',
      '',
      'Existing steps:',
      stepList || '(none provided)',
      '',
      `Describe-this-scenario request: ${req.input}`,
    ].join('\n')
  }

  /**
   * Resolve the provider for the active config. Returns null when unconfigured.
   * Concrete-provider wiring (Ollama / OpenAI-compatible / Claude subscription)
   * is completed in the US1 phase (task T024).
   */
  private async resolveProvider(): Promise<IAIProvider | null> {
    if (this.providerOverride) return this.providerOverride
    const config = await this.getConfig()
    if (!config.type) return null

    const getKey = () => this.credentialsService.getKey()
    switch (config.type) {
      case 'ollama':
        return new VercelAIProvider({ mode: 'ollama', model: config.model, baseUrl: config.baseUrl, getKey })
      case 'openai-compatible':
        return new VercelAIProvider({ mode: 'openai-compatible', model: config.model, baseUrl: config.baseUrl, getKey })
      case 'claude-subscription':
        return new ClaudeSubscriptionProvider({ model: config.model })
      default:
        return null
    }
  }
}

let instance: AIService | null = null

export function getAIService(): AIService {
  if (!instance) instance = new AIService()
  return instance
}

export function setAIService(service: AIService): void {
  instance = service
}

export function resetAIService(): void {
  instance = null
}
