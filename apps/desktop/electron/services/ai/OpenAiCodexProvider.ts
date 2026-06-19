import { spawn } from 'node:child_process'
import type { AIProviderStatus } from '@suisui/shared'
import { createLogger } from '../../utils/logger'
import type { IAIProvider, AIStreamRequest } from './IAIProvider'

const logger = createLogger('OpenAiCodexProvider')

/**
 * Environment variables that, if present, would cause the spawned `codex` CLI to
 * bill an OpenAI API account (per-token) instead of drawing from the user's
 * ChatGPT/Codex subscription. They MUST be absent for the subscription path (spec FR-006).
 * - `OPENAI_API_KEY`: auto-discovered and silently billed.
 * - `CODEX_API_KEY`: the documented way to FORCE api-key billing for `codex exec`.
 */
const BILLING_ENV_KEYS = ['OPENAI_API_KEY', 'CODEX_API_KEY']

/** Build a sanitized env (no API-billing keys) for the subscription path. */
export function buildSanitizedCodexEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(source)) {
    if (v === undefined) continue
    if (BILLING_ENV_KEYS.includes(k)) continue
    env[k] = v
  }
  return env
}

/**
 * Extract assistant text from a single `codex exec --json` JSONL event.
 * Codex emits `thread.started → turn.started → item.completed* → turn.completed`.
 * Assistant text is carried by `item.completed` events where `item.type === 'agent_message'`
 * (full message). Some versions also stream `item.updated` with an `agent_message_delta`.
 * We yield whichever is present without depending on the exact (evolving) schema.
 */
export function extractCodexText(event: unknown): string | null {
  if (typeof event !== 'object' || event === null) return null
  const e = event as {
    type?: string
    item?: { type?: string; text?: string }
    delta?: { type?: string; text?: string }
    text?: string
  }
  // Incremental delta (newer app-server style), if surfaced.
  if (e.type === 'item.updated' && e.delta?.type === 'agent_message_delta' && typeof e.delta.text === 'string') {
    return e.delta.text
  }
  // Completed assistant message (the reliable `codex exec --json` path).
  if (e.type === 'item.completed' && e.item?.type === 'agent_message' && typeof e.item.text === 'string') {
    return e.item.text
  }
  return null
}

/**
 * Drives the user's locally-installed `codex` (OpenAI Codex CLI, subscription session)
 * via `codex exec --json` (streaming JSONL).
 *
 * BEST-EFFORT (see research Decision 3b): subscription-based programmatic use is
 * evolving; the reliable path is a BYOK OpenAI-compatible API key through the
 * OpenAI-compatible provider. This provider runs with a SANITIZED env so it never
 * silently bills the API (FR-006) and uses a streaming `exec` invocation rather than
 * a one-shot headless mode (FR-019). Cancellation kills the child process (the SDK has
 * no clean abort yet — openai/codex#5494).
 */
export class OpenAiCodexProvider implements IAIProvider {
  constructor(private opts: { model?: string | null } = {}) {}

  async status(): Promise<AIProviderStatus> {
    // Cheap, quota-free check: is the `codex` CLI installed and runnable?
    return new Promise<AIProviderStatus>((resolve) => {
      const child = spawn('codex', ['--version'], { env: buildSanitizedCodexEnv(), windowsHide: true })
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
          reason: notFound ? 'codex CLI not found' : err.message,
          models: null,
          detail: notFound ? 'not-installed' : null,
        })
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        finish(
          code === 0
            ? { available: true, reason: null, models: null, detail: 'running' }
            : { available: false, reason: `codex exited with code ${code}`, models: null, detail: null }
        )
      })
    })
  }

  async *stream(req: AIStreamRequest): AsyncIterable<string> {
    const modelArgs = this.opts.model ? ['-m', this.opts.model] : []
    const child = spawn('codex', ['exec', '--json', ...modelArgs, req.input], {
      env: buildSanitizedCodexEnv(),
      windowsHide: true,
    })

    const kill = () => {
      if (!child.killed) child.kill('SIGTERM')
    }
    if (req.signal) {
      if (req.signal.aborted) kill()
      else req.signal.addEventListener('abort', kill, { once: true })
    }

    // Bridge the child's line-delimited stdout into an async queue the generator drains.
    const queue: string[] = []
    let resolveNext: (() => void) | null = null
    let finished = false
    let error: Error | null = null
    let pending = ''

    const wake = () => {
      if (resolveNext) {
        const r = resolveNext
        resolveNext = null
        r()
      }
    }

    const handleLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed) return
      let parsed: unknown
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        return // ignore non-JSON noise
      }
      const text = extractCodexText(parsed)
      if (text) {
        queue.push(text)
        wake()
      }
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (data: string) => {
      pending += data
      let nl: number
      while ((nl = pending.indexOf('\n')) !== -1) {
        handleLine(pending.slice(0, nl))
        pending = pending.slice(nl + 1)
      }
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (data: string) => {
      stderr += data
    })
    child.on('error', (err: NodeJS.ErrnoException) => {
      error = err.code === 'ENOENT' ? new Error('codex CLI not found') : err
      finished = true
      wake()
    })
    child.on('close', (code) => {
      if (pending.trim()) handleLine(pending)
      if (code !== 0 && !req.signal?.aborted && error === null) {
        error = new Error(stderr.trim() || `codex exited with code ${code}`)
      }
      finished = true
      wake()
    })

    try {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!
          continue
        }
        if (req.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        if (error) throw error
        if (finished) return
        await new Promise<void>((resolve) => {
          resolveNext = resolve
        })
      }
    } finally {
      kill()
    }
  }
}

logger.debug('OpenAiCodexProvider module loaded')
