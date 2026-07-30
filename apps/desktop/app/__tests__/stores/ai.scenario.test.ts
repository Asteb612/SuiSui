import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { StepDefinition, AIStreamChunk, AIStreamDone, AIStreamError } from '@suisui/shared'
import { useAiStore } from '../../stores/ai'

/**
 * Scenario generation through the existing AI stream (feature 012, US1).
 * No provider and no network — the stream is driven by hand, the way a
 * canned `FakeAIProvider` response would drive it.
 */

type ChunkCb = (c: AIStreamChunk) => void
type DoneCb = (d: AIStreamDone) => void
type ErrorCb = (e: AIStreamError) => void

let chunkCb: ChunkCb
let doneCb: DoneCb
let errorCb: ErrorCb
let started: Array<{ requestId: string; kind: string; input: string; context: unknown }>
let cancelled: string[]

const mockApi = {
  ai: {
    start: vi.fn(async (req: { requestId: string; kind: string; input: string; context: unknown }) => {
      started.push(req)
    }),
    cancel: vi.fn(async (id: string) => {
      cancelled.push(id)
    }),
    onChunk: (cb: ChunkCb) => {
      chunkCb = cb
      return () => {}
    },
    onDone: (cb: DoneCb) => {
      doneCb = cb
      return () => {}
    },
    onError: (cb: ErrorCb) => {
      errorCb = cb
      return () => {}
    },
  },
}

const STEPS: StepDefinition[] = [
  {
    id: 'p1',
    keyword: 'Given',
    pattern: 'I am on the {string} page',
    location: 'features/steps/app.steps.ts:1',
    args: [{ name: 'page', type: 'string', required: true }],
    isGeneric: false,
  },
  {
    id: 'g1',
    keyword: 'Then',
    pattern: 'I should see {string}',
    location: 'features/steps/generic.steps.ts:1',
    args: [{ name: 'text', type: 'string', required: true }],
    isGeneric: true,
  },
]

const GOOD_RESPONSE = JSON.stringify({
  scenarios: [
    {
      name: 'Visit home',
      tags: [],
      steps: [{ i: 0, text: 'I am on the "home" page' }],
    },
  ],
  gaps: [],
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  started = []
  cancelled = []
  vi.stubGlobal('window', { api: mockApi })
  vi.stubGlobal('crypto', { randomUUID: () => 'req-1' })
})

/** Drive the stream to completion with the given text. */
function respond(text: string, requestId = 'req-1') {
  chunkCb({ requestId, delta: text })
  doneCb({ requestId, finishReason: 'stop' })
}

describe('ai store — generateScenario', () => {
  it('produces a drafted outcome from a well-formed response', async () => {
    const store = useAiStore()
    const promise = store.generateScenario('visit the home page', STEPS)
    await Promise.resolve()
    respond(GOOD_RESPONSE)

    const outcome = await promise
    expect(outcome?.status).toBe('drafted')
    expect(store.scenarioOutcome?.status).toBe('drafted')
  })

  it('sends the scenario-generate kind with project steps first', async () => {
    const store = useAiStore()
    const promise = store.generateScenario('visit the home page', STEPS)
    await Promise.resolve()
    respond(GOOD_RESPONSE)
    await promise

    expect(started[0]!.kind).toBe('scenario-generate')
    const sent = (started[0]!.context as { steps: StepDefinition[] }).steps
    expect(sent.map((s) => s.id)).toEqual(['p1', 'g1'])
  })

  it('passes the current scenario text and requirement reference through', async () => {
    const store = useAiStore()
    const promise = store.generateScenario('add the declined path', STEPS, {
      scenarioText: 'Scenario: Pay',
      requirementRef: 'GH-102',
    })
    await Promise.resolve()
    respond(GOOD_RESPONSE)
    await promise

    const ctx = started[0]!.context as { scenarioText: string; requirementRef: string }
    expect(ctx.scenarioText).toBe('Scenario: Pay')
    expect(ctx.requirementRef).toBe('GH-102')
  })

  it('produces a failed outcome when the provider errors (FR-021)', async () => {
    const store = useAiStore()
    const promise = store.generateScenario('anything', STEPS)
    await Promise.resolve()
    errorCb({ requestId: 'req-1', message: 'provider unreachable' })

    const outcome = await promise
    expect(outcome?.status).toBe('failed')
    if (outcome?.status !== 'failed') return
    expect(outcome.message).toContain('provider unreachable')
  })

  it('produces an empty outcome when nothing resolved', async () => {
    const store = useAiStore()
    const promise = store.generateScenario('anything', STEPS)
    await Promise.resolve()
    respond(JSON.stringify({ scenarios: [], gaps: ['everything'] }))

    const outcome = await promise
    expect(outcome?.status).toBe('empty')
  })

  it('produces no outcome when the tester cancelled (FR-017)', async () => {
    const store = useAiStore()
    const promise = store.generateScenario('anything', STEPS)
    await Promise.resolve()

    store.cancelScenarioGeneration()
    respond(GOOD_RESPONSE)

    const outcome = await promise
    expect(outcome).toBeNull()
    expect(store.scenarioOutcome).toBeNull()
    expect(cancelled).toContain('req-1')
  })

  it('clears the previous outcome when regenerating, never accumulating', async () => {
    const store = useAiStore()
    const first = store.generateScenario('one', STEPS)
    await Promise.resolve()
    respond(GOOD_RESPONSE)
    await first
    expect(store.scenarioOutcome?.status).toBe('drafted')

    const second = store.generateScenario('two', STEPS)
    // Cleared synchronously, before the second response arrives.
    expect(store.scenarioOutcome).toBeNull()
    await Promise.resolve()
    respond(GOOD_RESPONSE)
    await second

    if (store.scenarioOutcome?.status !== 'drafted') throw new Error('expected a draft')
    expect(store.scenarioOutcome.scenarios).toHaveLength(1)
  })

  it('ignores a response belonging to a superseded request', async () => {
    const store = useAiStore()
    const promise = store.generateScenario('one', STEPS)
    await Promise.resolve()

    // A late chunk from an earlier, superseded generation.
    chunkCb({ requestId: 'stale-request', delta: 'garbage that is not JSON' })
    respond(GOOD_RESPONSE)

    const outcome = await promise
    expect(outcome?.status).toBe('drafted')
  })

  it('defaults applyMode to extend', () => {
    const store = useAiStore()
    expect(store.applyMode).toBe('extend')
  })
})
