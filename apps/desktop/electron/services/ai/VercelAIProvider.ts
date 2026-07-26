import { streamText } from 'ai'
import { createOllama } from 'ollama-ai-provider-v2'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { AIProviderStatus, AIReasoningEffort } from '@suisui/shared'
import { createLogger } from '../../utils/logger'
import type { IAIProvider, AIStreamRequest } from './IAIProvider'

const logger = createLogger('VercelAIProvider')

const DEFAULT_OLLAMA_BASE = 'http://127.0.0.1:11434'

/** Provider name for the BYOK OpenAI-compatible endpoint; also the providerOptions key. */
const BYOK_PROVIDER_NAME = 'byok'

export type VercelProviderMode = 'ollama' | 'openai-compatible'

export interface VercelAIProviderOptions {
  mode: VercelProviderMode
  model: string | null
  baseUrl: string | null
  /** Reads the API key from the main-process credentials store; never exposed to the renderer. */
  getKey: () => Promise<string | null>
  /** Reasoning effort; forwarded as `reasoning_effort` only to reasoning-capable models. */
  effort?: AIReasoningEffort
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * Whether a model accepts OpenAI's `reasoning_effort` parameter. Sending it to a
 * non-reasoning model (e.g. gpt-4o) is a 400, so effort is gated on this. Matches the
 * OpenAI reasoning families — the o-series (o1/o3/o4…) and gpt-5* — tolerating an
 * optional `vendor/` gateway prefix (e.g. `openai/gpt-5`).
 */
function isReasoningModel(model: string): boolean {
  const name = model.trim().toLowerCase().split('/').pop() ?? ''
  return /^o\d/.test(name) || name.startsWith('gpt-5')
}

/**
 * Provider for the two HTTP-based categories via the Vercel AI SDK:
 * local Ollama and a bring-your-own-key OpenAI-compatible API.
 */
export class VercelAIProvider implements IAIProvider {
  constructor(private opts: VercelAIProviderOptions) {}

  async status(): Promise<AIProviderStatus> {
    return this.opts.mode === 'ollama' ? this.statusOllama() : this.statusOpenAICompatible()
  }

  private async statusOllama(): Promise<AIProviderStatus> {
    const base = trimTrailingSlash(this.opts.baseUrl ?? DEFAULT_OLLAMA_BASE)
    try {
      const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(1500) })
      if (!res.ok) {
        return { available: false, reason: `http ${res.status}`, models: null, detail: 'running' }
      }
      const body = (await res.json()) as { models?: Array<{ name?: string; model?: string }> }
      const models = (body.models ?? []).map((m) => m.name ?? m.model ?? '').filter(Boolean)
      return { available: true, reason: null, models, detail: 'running' }
    } catch (err) {
      const code = (err as { cause?: { code?: string } })?.cause?.code ?? (err as Error)?.name
      return { available: false, reason: code ?? 'unreachable', models: null, detail: 'installed-not-running' }
    }
  }

  private async statusOpenAICompatible(): Promise<AIProviderStatus> {
    const base = this.opts.baseUrl ? trimTrailingSlash(this.opts.baseUrl) : null
    if (!base) {
      return { available: false, reason: 'No base URL configured', models: null, detail: null }
    }
    try {
      const key = await this.opts.getKey()
      const headers: Record<string, string> = {}
      if (key) headers.Authorization = `Bearer ${key}`
      const res = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(5000) })
      if (!res.ok) {
        return { available: false, reason: `http ${res.status}`, models: null, detail: null }
      }
      const body = (await res.json()) as { data?: Array<{ id?: string }> }
      const models = (body.data ?? []).map((m) => m.id ?? '').filter(Boolean)
      return { available: true, reason: null, models: models.length ? models : null, detail: null }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { available: false, reason: message, models: null, detail: null }
    }
  }

  async *stream(req: AIStreamRequest): AsyncIterable<string> {
    const model = this.opts.model
    if (!model) {
      throw new Error('No model selected for the AI provider')
    }

    const languageModel =
      this.opts.mode === 'ollama'
        ? createOllama({ baseURL: `${trimTrailingSlash(this.opts.baseUrl ?? DEFAULT_OLLAMA_BASE)}/api` })(model)
        : await this.openAICompatibleModel(model)

    const result = streamText({
      model: languageModel,
      prompt: req.input,
      abortSignal: req.signal,
      ...this.reasoningProviderOptions(model),
    })

    for await (const delta of result.textStream) {
      yield delta
    }
  }

  /**
   * Provider options carrying `reasoning_effort` for BYOK reasoning models. Empty for
   * Ollama, for non-reasoning models, or when no effort is set — so a plain BYOK model
   * (gpt-4o, etc.) never receives an unsupported parameter.
   */
  private reasoningProviderOptions(model: string): { providerOptions?: Record<string, Record<string, string>> } {
    if (this.opts.mode !== 'openai-compatible' || !this.opts.effort || !isReasoningModel(model)) {
      return {}
    }
    return { providerOptions: { [BYOK_PROVIDER_NAME]: { reasoningEffort: this.opts.effort } } }
  }

  private async openAICompatibleModel(model: string) {
    const base = this.opts.baseUrl ? trimTrailingSlash(this.opts.baseUrl) : null
    if (!base) throw new Error('No base URL configured for the OpenAI-compatible provider')
    const apiKey = (await this.opts.getKey()) ?? undefined
    const provider = createOpenAICompatible({ name: BYOK_PROVIDER_NAME, baseURL: base, apiKey })
    return provider(model)
  }
}

logger.debug('VercelAIProvider module loaded')
