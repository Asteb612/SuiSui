import type { AIProviderConfig, AIProviderStatus, AIProviderType, AIStatusTarget } from '@suisui/shared'
import { DEFAULT_AI_PROVIDER_CONFIG } from '@suisui/shared'
import { createLogger } from '../../utils/logger'
import { getSettingsService, type SettingsService } from '../SettingsService'
import { getAICredentialsService, type AICredentialsService } from './AICredentialsService'
import type { IAIProvider, AIStreamRequest } from './IAIProvider'
import { VercelAIProvider } from './VercelAIProvider'
import { ClaudeSubscriptionProvider } from './ClaudeSubscriptionProvider'
import { OpenAiCodexProvider } from './OpenAiCodexProvider'

const logger = createLogger('AIService')

const NOT_CONFIGURED_STATUS: AIProviderStatus = {
  available: false,
  reason: 'No AI provider configured',
  models: null,
  detail: null,
}

/**
 * Reject a non-http(s) base URL before it reaches `fetch` (mirrors the APP_OPEN_EXTERNAL
 * scheme check). The stored API key is attached as a Bearer header to the configured
 * base URL, so constraining the scheme is cheap defense-in-depth against a compromised
 * renderer pointing it at, e.g., a `file:`/custom scheme. A `null` base URL is allowed
 * (providers fall back to their defaults).
 */
function assertSafeBaseUrl(baseUrl: string | null): void {
  if (!baseUrl) return
  let protocol: string
  try {
    protocol = new URL(baseUrl).protocol
  } catch {
    throw new Error('Invalid base URL')
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`Unsupported base URL scheme: ${protocol}`)
  }
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
    assertSafeBaseUrl(config.baseUrl)
    // Never persist a secret here; hasApiKey is derived from the credentials store.
    const hasApiKey = await this.credentialsService.hasKey()
    await this.settingsService.save({ aiProvider: { ...config, hasApiKey } })
    logger.info('AI provider config saved', { type: config.type, model: config.model })
  }

  /**
   * Detect a provider's availability.
   * - With a `target`: build a TRANSIENT provider for that type/baseUrl and return
   *   its status WITHOUT persisting any config change (spec FR-021) — used by the
   *   settings page to detect providers before the user commits a selection.
   * - Without a `target`: probe the currently-configured provider ("test connection", FR-004).
   */
  async status(target?: AIStatusTarget): Promise<AIProviderStatus> {
    if (target) {
      assertSafeBaseUrl(target.baseUrl ?? null)
      return this.buildProvider(target.type, null, target.baseUrl ?? null).status()
    }
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
    if (req.kind === 'step-match') {
      return this.buildStepMatchPrompt(req)
    }
    if (req.kind === 'arg-fill') {
      return this.buildArgFillPrompt(req)
    }
    if (req.kind === 'failure-explain') {
      return this.buildFailureExplainPrompt(req)
    }
    return req.input
  }

  /**
   * Prompt for a plain-language explanation of a failed test (spec FR-012). The
   * explanation streams back incrementally (FR-018); it is advisory only and never
   * modifies the scenario or runner state.
   */
  private buildFailureExplainPrompt(req: AIStreamRequest): string {
    return [
      'A BDD (Playwright / playwright-bdd) test run failed.',
      'Explain the failure in plain language for the test author: the most likely cause,',
      'and concrete next steps to fix it. Be concise. Do not invent output that is not shown.',
      '',
      'Failed test output:',
      req.input,
    ].join('\n')
  }

  /**
   * Prompt for suggesting values for a parameterized step's arguments (spec FR-011),
   * using the scenario context. The reply is parsed into a `paramName -> value` map
   * in the renderer (`parseSuggestedArgs`) and reviewed by the user before commit.
   */
  private buildArgFillPrompt(req: AIStreamRequest): string {
    const step = req.context.targetStep
    const params = step?.args.map((a) => a.name) ?? []
    return [
      'You suggest argument values for a single Gherkin step, using the scenario context.',
      'Reply with ONLY a JSON object mapping each parameter name to a suggested string value.',
      'Use exactly these parameter names as keys; no explanations, no code fences, no extra keys.',
      '',
      `Step: ${step?.pattern ?? req.input}`,
      `Parameters: ${params.join(', ') || '(none)'}`,
      '',
      'Scenario so far:',
      req.context.scenarioText || '(none)',
    ].join('\n')
  }

  /**
   * Prompt for matching a user action to a single EXISTING step (spec FR-010). The
   * reply is reconciled against the real workspace steps in the renderer
   * (`reconcileSuggestedStep`), so we ask for a verbatim copy or an explicit `NONE`.
   */
  private buildStepMatchPrompt(req: AIStreamRequest): string {
    const stepList = req.context.steps.map((s) => `${s.keyword} ${s.pattern}`).join('\n')
    return [
      'You match a user action to the SINGLE best-fitting existing Gherkin step below.',
      'Reply with ONLY the exact step text (keyword + pattern) copied verbatim from the list.',
      'If none is a good match, reply with exactly: NONE',
      'No explanations, no quotes, no code fences.',
      '',
      'Existing steps:',
      stepList || '(none provided)',
      '',
      `User action: ${req.input}`,
    ].join('\n')
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
   * Resolve the provider for the active config. Returns null when unconfigured
   * (or when a test override is injected, that override wins).
   */
  private async resolveProvider(): Promise<IAIProvider | null> {
    if (this.providerOverride) return this.providerOverride
    const config = await this.getConfig()
    if (!config.type) return null
    return this.buildProvider(config.type, config.model, config.baseUrl)
  }

  /**
   * Construct the concrete provider for a given type without touching persisted
   * config. Shared by `resolveProvider` (active config) and `status(target)` (probe).
   */
  private buildProvider(type: AIProviderType, model: string | null, baseUrl: string | null): IAIProvider {
    const getKey = () => this.credentialsService.getKey()
    switch (type) {
      case 'ollama':
        return new VercelAIProvider({ mode: 'ollama', model, baseUrl, getKey })
      case 'openai-compatible':
        return new VercelAIProvider({ mode: 'openai-compatible', model, baseUrl, getKey })
      case 'openai-codex-cli':
        return new OpenAiCodexProvider({ model })
      case 'claude-subscription':
        return new ClaudeSubscriptionProvider({ model })
      default:
        // Guards a corrupted/forward-incompatible persisted config (or a bogus IPC
        // target) from silently returning `undefined` and throwing an opaque TypeError.
        throw new Error(`Unknown AI provider type: ${String(type)}`)
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
