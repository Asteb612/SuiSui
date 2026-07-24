import { spawn } from 'node:child_process'
import type { AIProviderStatus } from '@suisui/shared'
import { createLogger } from '../../utils/logger'
import { CODEX_BILLING_ENV_KEYS as BILLING_ENV_KEYS } from './billingEnv'
import type { IAIProvider, AIStreamRequest } from './IAIProvider'

const logger = createLogger('OpenAiCodexProvider')

/** A text fragment extracted from a codex JSONL event, tagged by how it was carried. */
export interface CodexTextEvent {
  text: string
  /** `delta`: an incremental `agent_message_delta`. `message`: a full `agent_message`. */
  kind: 'delta' | 'message'
}

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
 * Extract assistant text from a single `codex exec --json` JSONL event, tagged with
 * how it was carried so the caller can avoid double-counting.
 * Codex emits `thread.started → turn.started → item.completed* → turn.completed`.
 * Assistant text is carried by `item.completed` events where `item.type === 'agent_message'`
 * (full message). Some versions also stream `item.updated` with an `agent_message_delta`.
 * A version that emits BOTH would otherwise stream the text twice (deltas + the final
 * full message); `stream()` uses the `kind` tag to drop the redundant full message.
 */
export function extractCodexText(event: unknown): CodexTextEvent | null {
  if (typeof event !== 'object' || event === null) return null
  const e = event as {
    type?: string
    item?: { type?: string; text?: string }
    delta?: { type?: string; text?: string }
    text?: string
  }
  // Incremental delta (newer app-server style), if surfaced.
  if (e.type === 'item.updated' && e.delta?.type === 'agent_message_delta' && typeof e.delta.text === 'string') {
    return { text: e.delta.text, kind: 'delta' }
  }
  // Completed assistant message (the reliable `codex exec --json` path).
  if (e.type === 'item.completed' && e.item?.type === 'agent_message' && typeof e.item.text === 'string') {
    return { text: e.item.text, kind: 'message' }
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
  /** The CLI binary to spawn. Defaults to `codex`; overridable (DI) so tests can point at a fake-CLI stub. */
  private readonly command: string

  constructor(private opts: { model?: string | null; command?: string } = {}) {
    this.command = opts.command ?? 'codex'
  }

  async status(): Promise<AIProviderStatus> {
    // Cheap, quota-free check: is the `codex` CLI installed and runnable?
    return new Promise<AIProviderStatus>((resolve) => {
      const child = spawn(this.command, ['--version'], { env: buildSanitizedCodexEnv(), windowsHide: true })
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
    // `--` ends option parsing so a prompt that happens to start with `-` is never
    // mistaken for a codex flag (defense-in-depth; prompts are non-flag today).
    const child = spawn(this.command, ['exec', '--json', ...modelArgs, '--', req.input], {
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
    // Whether any incremental delta was streamed for this turn. If so, the terminal
    // full `agent_message` is the aggregation of those deltas — drop it to avoid
    // emitting the answer twice on codex versions that send both (see extractCodexText).
    let sawDelta = false

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
      const evt = extractCodexText(parsed)
      if (!evt) return
      if (evt.kind === 'delta') sawDelta = true
      else if (sawDelta) return // redundant full message after deltas
      queue.push(evt.text)
      wake()
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
