import { streamText } from 'ai'
import { createOllama } from 'ollama-ai-provider-v2'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { AIProviderStatus } from '@suisui/shared'
import { createLogger } from '../../utils/logger'
import type { IAIProvider, AIStreamRequest } from './IAIProvider'

const logger = createLogger('VercelAIProvider')

const DEFAULT_OLLAMA_BASE = 'http://127.0.0.1:11434'

export type VercelProviderMode = 'ollama' | 'openai-compatible'

export interface VercelAIProviderOptions {
  mode: VercelProviderMode
  model: string | null
  baseUrl: string | null
  /** Reads the API key from the main-process credentials store; never exposed to the renderer. */
  getKey: () => Promise<string | null>
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
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
    })

    for await (const delta of result.textStream) {
      yield delta
    }
  }

  private async openAICompatibleModel(model: string) {
    const base = this.opts.baseUrl ? trimTrailingSlash(this.opts.baseUrl) : null
    if (!base) throw new Error('No base URL configured for the OpenAI-compatible provider')
    const apiKey = (await this.opts.getKey()) ?? undefined
    const provider = createOpenAICompatible({ name: 'byok', baseURL: base, apiKey })
    return provider(model)
  }
}

logger.debug('VercelAIProvider module loaded')
