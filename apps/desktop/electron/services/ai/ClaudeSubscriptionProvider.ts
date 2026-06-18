import { spawn } from 'node:child_process'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { AIProviderStatus } from '@suisui/shared'
import { createLogger } from '../../utils/logger'
import type { IAIProvider, AIStreamRequest } from './IAIProvider'

const logger = createLogger('ClaudeSubscriptionProvider')

/**
 * Environment variables that, if present, would cause the spawned `claude` CLI to
 * bill an API account (or a cloud provider) instead of drawing from the user's
 * subscription. They MUST be absent for the subscription path (spec FR-006).
 */
const BILLING_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
]

/** Build a sanitized env (no API-billing keys) for the subscription path. */
export function buildSanitizedEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(source)) {
    if (v === undefined) continue
    if (BILLING_ENV_KEYS.includes(k)) continue
    env[k] = v
  }
  return env
}

/** Narrow a partial-message stream event to its text delta without depending on the SDK's beta types. */
function extractTextDelta(event: unknown): string | null {
  if (typeof event !== 'object' || event === null) return null
  const e = event as { type?: string; delta?: { type?: string; text?: string } }
  if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta' && typeof e.delta.text === 'string') {
    return e.delta.text
  }
  return null
}

/**
 * Drives the user's locally-installed `claude` (subscription) via the Agent SDK.
 *
 * BEST-EFFORT: using the subscription (rather than an API key) is unsupported/unstable
 * upstream (see research Decision 3); the reliable path is a BYOK Anthropic API key
 * through the OpenAI-compatible provider. This provider uses a STREAMING invocation
 * (includePartialMessages) rather than depending on one-shot `-p` headless mode (FR-019),
 * and runs with a sanitized env so it never silently bills the API (FR-006).
 */
export class ClaudeSubscriptionProvider implements IAIProvider {
  constructor(private opts: { model?: string | null } = {}) {}

  async status(): Promise<AIProviderStatus> {
    // Cheap, quota-free check: can we run the `claude` CLI at all?
    return new Promise<AIProviderStatus>((resolve) => {
      const child = spawn('claude', ['--version'], { env: buildSanitizedEnv(), windowsHide: true })
      let done = false
      const finish = (status: AIProviderStatus) => {
        if (!done) {
          done = true
          resolve(status)
        }
      }
      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        finish({ available: false, reason: 'timed out', models: null, detail: null })
      }, 3000)
      child.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timer)
        const notFound = err.code === 'ENOENT'
        finish({
          available: false,
          reason: notFound ? 'claude CLI not found' : err.message,
          models: null,
          detail: notFound ? 'not-installed' : null,
        })
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        finish(
          code === 0
            ? { available: true, reason: null, models: null, detail: 'running' }
            : { available: false, reason: `claude exited with code ${code}`, models: null, detail: null }
        )
      })
    })
  }

  async *stream(req: AIStreamRequest): AsyncIterable<string> {
    const abortController = new AbortController()
    if (req.signal) {
      if (req.signal.aborted) abortController.abort()
      else req.signal.addEventListener('abort', () => abortController.abort(), { once: true })
    }

    const response = query({
      prompt: req.input,
      options: {
        maxTurns: 1,
        includePartialMessages: true,
        env: buildSanitizedEnv(),
        abortController,
        ...(this.opts.model ? { model: this.opts.model } : {}),
      },
    })

    for await (const message of response) {
      if (req.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      if (message.type === 'stream_event') {
        const text = extractTextDelta(message.event)
        if (text) yield text
      }
    }
  }
}

logger.debug('ClaudeSubscriptionProvider module loaded')
