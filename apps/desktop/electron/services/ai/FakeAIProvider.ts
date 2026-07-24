import type { AIProviderStatus } from '@suisui/shared'
import type { IAIProvider, AIStreamRequest } from './IAIProvider'

export interface FakeAIProviderOptions {
  /** Chunks yielded by `stream()` in order. */
  chunks?: string[]
  /**
   * Optional request-aware responder. When set, its return value is used as the
   * chunk list for a given request instead of `chunks` — lets a single fake return
   * output appropriate to each use case (e.g. Gherkin for `scenario`, a step pattern
   * for `step-match`, a JSON map for `arg-fill`). Used by the E2E test-mode handler.
   */
  responder?: (req: AIStreamRequest) => string[]
  /** Status returned by `status()`. Defaults to available. */
  status?: AIProviderStatus
  /** If set, throw this error after yielding `throwAfter` chunks (simulates a failure / interrupted stream). */
  throwAfter?: number
  error?: Error
}

const DEFAULT_STATUS: AIProviderStatus = {
  available: true,
  reason: null,
  models: ['fake-model'],
  detail: 'running',
}

/**
 * Test double for `IAIProvider`. Yields scripted chunks and can simulate
 * abort/error. Never touches a real model, CLI, or network (Constitution Principle III).
 */
export class FakeAIProvider implements IAIProvider {
  private chunks: string[]
  private responder?: (req: AIStreamRequest) => string[]
  private statusResult: AIProviderStatus
  private throwAfter?: number
  private error?: Error

  /** Records every request for test assertions. */
  public callHistory: AIStreamRequest[] = []

  constructor(options: FakeAIProviderOptions = {}) {
    this.chunks = options.chunks ?? ['Feature: ', 'Fake', '\n']
    this.responder = options.responder
    this.statusResult = options.status ?? DEFAULT_STATUS
    this.throwAfter = options.throwAfter
    this.error = options.error
  }

  setChunks(chunks: string[]): void {
    this.chunks = chunks
  }

  setStatus(status: AIProviderStatus): void {
    this.statusResult = status
  }

  async status(): Promise<AIProviderStatus> {
    return this.statusResult
  }

  async *stream(req: AIStreamRequest): AsyncIterable<string> {
    this.callHistory.push(req)
    const chunks = this.responder ? this.responder(req) : this.chunks
    let i = 0
    for (const chunk of chunks) {
      if (req.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      if (this.throwAfter !== undefined && i === this.throwAfter) {
        throw this.error ?? new Error('FakeAIProvider simulated failure')
      }
      i++
      yield chunk
    }
  }
}
