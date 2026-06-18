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

import { VercelAIProvider } from '../services/ai/VercelAIProvider'
import { ClaudeSubscriptionProvider, buildSanitizedEnv } from '../services/ai/ClaudeSubscriptionProvider'
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
