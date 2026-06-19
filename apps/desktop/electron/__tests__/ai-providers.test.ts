import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the Vercel AI SDK so stream() never hits a real model.
vi.mock('ai', () => ({
  streamText: vi.fn((opts: { prompt: string }) => ({
    textStream: (async function* () {
      yield 'Feature: '
      yield opts.prompt.includes('login') ? 'Login' : 'Draft'
    })(),
  })),
}))

// Mock the Claude Agent SDK so no `claude` subprocess is spawned for streaming.
const queryMock = vi.fn()
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}))

// Mock child_process so the Codex provider never spawns a real `codex` CLI.
const spawnMock = vi.fn()
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}))

import { EventEmitter } from 'node:events'
import { VercelAIProvider } from '../services/ai/VercelAIProvider'
import { ClaudeSubscriptionProvider, buildSanitizedEnv } from '../services/ai/ClaudeSubscriptionProvider'
import {
  OpenAiCodexProvider,
  buildSanitizedCodexEnv,
  extractCodexText,
} from '../services/ai/OpenAiCodexProvider'
import type { AIStreamRequest } from '../services/ai/IAIProvider'

const req = (input: string): AIStreamRequest => ({
  kind: 'scenario',
  input,
  context: { steps: [], scenarioText: null, targetStep: null },
})

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const c of stream) out += c
  return out
}

describe('buildSanitizedEnv (FR-006)', () => {
  it('strips all API-billing env keys', () => {
    const env = buildSanitizedEnv({
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'sk-ant-leak',
      ANTHROPIC_AUTH_TOKEN: 'tok',
      CLAUDE_CODE_USE_BEDROCK: '1',
      CLAUDE_CODE_USE_VERTEX: '1',
      CLAUDE_CODE_USE_FOUNDRY: '1',
      HOME: '/home/u',
    })
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBeUndefined()
    expect(env.PATH).toBe('/usr/bin')
    expect(env.HOME).toBe('/home/u')
  })
})

describe('VercelAIProvider — Ollama detection', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('reports running + model list on a 200', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ models: [{ name: 'llama3.2' }, { name: 'qwen' }] }) })
    const provider = new VercelAIProvider({ mode: 'ollama', model: 'llama3.2', baseUrl: 'http://127.0.0.1:11434', getKey: async () => null })
    const status = await provider.status()
    expect(status.available).toBe(true)
    expect(status.models).toEqual(['llama3.2', 'qwen'])
    expect(status.detail).toBe('running')
  })

  it('reports installed-not-running when the probe throws', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('refused'), { cause: { code: 'ECONNREFUSED' } }))
    const provider = new VercelAIProvider({ mode: 'ollama', model: 'llama3.2', baseUrl: 'http://127.0.0.1:11434', getKey: async () => null })
    const status = await provider.status()
    expect(status.available).toBe(false)
    expect(status.detail).toBe('installed-not-running')
  })
})

describe('VercelAIProvider — streaming', () => {
  it('streams text deltas from streamText', async () => {
    const provider = new VercelAIProvider({ mode: 'ollama', model: 'llama3.2', baseUrl: 'http://127.0.0.1:11434', getKey: async () => null })
    expect(await collect(provider.stream(req('a login scenario')))).toBe('Feature: Login')
  })

  it('throws a clear error when no model is selected', async () => {
    const provider = new VercelAIProvider({ mode: 'ollama', model: null, baseUrl: 'http://127.0.0.1:11434', getKey: async () => null })
    await expect(collect(provider.stream(req('x')))).rejects.toThrow('No model selected')
  })
})

describe('ClaudeSubscriptionProvider — streaming with sanitized env (FR-006)', () => {
  beforeEach(() => queryMock.mockReset())

  it('passes an env without ANTHROPIC_API_KEY and yields text deltas', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-should-not-leak'
    queryMock.mockImplementation(() => ({
      async *[Symbol.asyncIterator]() {
        yield { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } } }
        yield { type: 'result', subtype: 'success' }
      },
    }))

    const provider = new ClaudeSubscriptionProvider({ model: null })
    const out = await collect(provider.stream(req('hi')))

    expect(out).toBe('Hello')
    const passedEnv = queryMock.mock.calls[0]![0].options.env as Record<string, string>
    expect(passedEnv.ANTHROPIC_API_KEY).toBeUndefined()
    delete process.env.ANTHROPIC_API_KEY
  })
})

// --- OpenAI Codex CLI provider ---

/** Minimal fake `codex` child process: an EventEmitter with stdout/stderr emitters + kill(). */
function makeFakeCodexChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter & { setEncoding: (e: string) => void }
    stderr: EventEmitter & { setEncoding: (e: string) => void }
    kill: ReturnType<typeof vi.fn>
    killed: boolean
  }
  child.stdout = Object.assign(new EventEmitter(), { setEncoding: () => {} })
  child.stderr = Object.assign(new EventEmitter(), { setEncoding: () => {} })
  child.killed = false
  child.kill = vi.fn(() => {
    child.killed = true
    return true
  })
  return child
}

const tick = () => new Promise<void>((r) => setImmediate(r))

describe('buildSanitizedCodexEnv (FR-006)', () => {
  it('strips OPENAI_API_KEY and CODEX_API_KEY but keeps the rest', () => {
    const env = buildSanitizedCodexEnv({
      PATH: '/usr/bin',
      OPENAI_API_KEY: 'sk-leak',
      CODEX_API_KEY: 'force-api-billing',
      HOME: '/home/u',
    })
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.CODEX_API_KEY).toBeUndefined()
    expect(env.PATH).toBe('/usr/bin')
    expect(env.HOME).toBe('/home/u')
  })
})

describe('extractCodexText', () => {
  it('reads text from a completed agent_message item', () => {
    expect(extractCodexText({ type: 'item.completed', item: { type: 'agent_message', text: 'Hi' } })).toBe('Hi')
  })
  it('reads an incremental agent_message_delta', () => {
    expect(extractCodexText({ type: 'item.updated', delta: { type: 'agent_message_delta', text: 'x' } })).toBe('x')
  })
  it('ignores non-assistant events', () => {
    expect(extractCodexText({ type: 'turn.completed' })).toBeNull()
    expect(extractCodexText({ type: 'item.completed', item: { type: 'reasoning', text: 'thinking' } })).toBeNull()
  })
})

describe('OpenAiCodexProvider — streaming with sanitized env (FR-006)', () => {
  beforeEach(() => spawnMock.mockReset())

  it('spawns `codex exec --json` without OPENAI_API_KEY/CODEX_API_KEY and yields agent_message text', async () => {
    process.env.OPENAI_API_KEY = 'sk-should-not-leak'
    process.env.CODEX_API_KEY = 'should-not-leak'
    const child = makeFakeCodexChild()
    spawnMock.mockReturnValue(child)

    const provider = new OpenAiCodexProvider({ model: null })
    const p = collect(provider.stream(req('a login scenario')))
    await tick() // let the generator attach stdout/close handlers

    child.stdout.emit('data', JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Feature: Login' } }) + '\n')
    child.emit('close', 0)

    expect(await p).toBe('Feature: Login')

    const [cmd, args, opts] = spawnMock.mock.calls[0]! as [string, string[], { env: Record<string, string> }]
    expect(cmd).toBe('codex')
    expect(args).toEqual(['exec', '--json', 'a login scenario'])
    expect(opts.env.OPENAI_API_KEY).toBeUndefined()
    expect(opts.env.CODEX_API_KEY).toBeUndefined()

    delete process.env.OPENAI_API_KEY
    delete process.env.CODEX_API_KEY
  })

  it('passes the model via -m when configured', async () => {
    const child = makeFakeCodexChild()
    spawnMock.mockReturnValue(child)
    const provider = new OpenAiCodexProvider({ model: 'gpt-5-codex' })
    const p = collect(provider.stream(req('x')))
    await tick()
    child.emit('close', 0)
    await p
    expect(spawnMock.mock.calls[0]![1]).toEqual(['exec', '--json', '-m', 'gpt-5-codex', 'x'])
  })

  it('kills the child and throws AbortError when the signal aborts', async () => {
    const child = makeFakeCodexChild()
    spawnMock.mockReturnValue(child)
    const controller = new AbortController()
    controller.abort()
    const provider = new OpenAiCodexProvider({ model: null })

    await expect(collect(provider.stream({ ...req('x'), signal: controller.signal }))).rejects.toThrow('Aborted')
    expect(child.kill).toHaveBeenCalled()
  })

  it('surfaces a non-zero exit as a clear error (FR-015)', async () => {
    const child = makeFakeCodexChild()
    spawnMock.mockReturnValue(child)
    const provider = new OpenAiCodexProvider({ model: null })
    const p = collect(provider.stream(req('x')))
    await tick()
    child.stderr.emit('data', 'not logged in')
    child.emit('close', 1)
    await expect(p).rejects.toThrow('not logged in')
  })
})
