import { describe, expect, it } from 'vitest'
import { FakeAIProvider } from '../services/ai/FakeAIProvider'
import type { AIStreamRequest } from '../services/ai/IAIProvider'

const req = (overrides: Partial<AIStreamRequest> = {}): AIStreamRequest => ({
  kind: 'scenario',
  input: 'hi',
  context: { steps: [], scenarioText: null, targetStep: null },
  ...overrides,
})

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = []
  for await (const c of stream) out.push(c)
  return out
}

describe('FakeAIProvider', () => {
  it('yields default chunks and records the request', async () => {
    const p = new FakeAIProvider()
    const r = req()
    expect(await collect(p.stream(r))).toEqual(['Feature: ', 'Fake', '\n'])
    expect(p.callHistory).toEqual([r])
  })

  it('yields configured chunks', async () => {
    const p = new FakeAIProvider({ chunks: ['a', 'b'] })
    expect(await collect(p.stream(req()))).toEqual(['a', 'b'])
  })

  it('setChunks replaces the scripted output', async () => {
    const p = new FakeAIProvider()
    p.setChunks(['x'])
    expect(await collect(p.stream(req()))).toEqual(['x'])
  })

  it('reports the default (available) status; setStatus overrides it', async () => {
    const p = new FakeAIProvider()
    expect((await p.status()).available).toBe(true)
    p.setStatus({ available: false, reason: 'down', models: null, detail: null })
    expect(await p.status()).toMatchObject({ available: false, reason: 'down' })
  })

  it('returns a configured status object', async () => {
    const p = new FakeAIProvider({ status: { available: true, reason: null, models: ['m'], detail: 'running' } })
    expect((await p.status()).models).toEqual(['m'])
  })

  describe('responder (request-aware output)', () => {
    it('uses the responder return value instead of chunks', async () => {
      const p = new FakeAIProvider({
        responder: (r) => (r.kind === 'step-match' ? ['NONE'] : ['gherkin']),
      })
      expect(await collect(p.stream(req({ kind: 'scenario' })))).toEqual(['gherkin'])
      expect(await collect(p.stream(req({ kind: 'step-match' })))).toEqual(['NONE'])
    })

    it('passes the full request (context) to the responder', async () => {
      let seen: AIStreamRequest | null = null
      const p = new FakeAIProvider({
        responder: (r) => {
          seen = r
          return ['ok']
        },
      })
      const r = req({ kind: 'arg-fill', input: 'x' })
      await collect(p.stream(r))
      expect(seen).toBe(r)
    })
  })

  describe('failure simulation', () => {
    it('throws the configured error after `throwAfter` chunks (interrupted stream)', async () => {
      const p = new FakeAIProvider({ chunks: ['a', 'b', 'c'], throwAfter: 2, error: new Error('boom') })
      const got: string[] = []
      await expect(
        (async () => {
          for await (const c of p.stream(req())) got.push(c)
        })()
      ).rejects.toThrow('boom')
      // Two chunks were yielded before the failure.
      expect(got).toEqual(['a', 'b'])
    })

    it('throws a default error when `throwAfter` is set without `error`', async () => {
      const p = new FakeAIProvider({ chunks: ['a'], throwAfter: 0 })
      await expect(collect(p.stream(req()))).rejects.toThrow('FakeAIProvider simulated failure')
    })
  })

  describe('cancellation', () => {
    it('throws AbortError immediately when the signal is already aborted', async () => {
      const p = new FakeAIProvider({ chunks: ['a', 'b'] })
      const controller = new AbortController()
      controller.abort()
      await expect(collect(p.stream(req({ signal: controller.signal })))).rejects.toMatchObject({
        name: 'AbortError',
      })
    })

    it('stops yielding once the signal aborts mid-stream', async () => {
      const p = new FakeAIProvider({ chunks: ['a', 'b', 'c'] })
      const controller = new AbortController()
      const got: string[] = []
      await expect(
        (async () => {
          for await (const c of p.stream(req({ signal: controller.signal }))) {
            got.push(c)
            controller.abort() // abort after the first chunk
          }
        })()
      ).rejects.toMatchObject({ name: 'AbortError' })
      expect(got).toEqual(['a'])
    })
  })
})
