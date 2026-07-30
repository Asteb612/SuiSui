import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/userdata') },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(s)),
    decryptString: vi.fn((b: Buffer) => b.toString()),
  },
}))

import type { AppSettings, StepDefinition } from '@suisui/shared'
import { AIService } from '../../services/ai/AIService'
import { FakeAIProvider } from '../../services/ai/FakeAIProvider'
import type { SettingsService } from '../../services/SettingsService'
import type { AICredentialsService } from '../../services/ai/AICredentialsService'

function fakeSettings(): SettingsService {
  return {
    get: async () => ({}) as AppSettings,
    save: async () => {},
  } as unknown as SettingsService
}

function fakeCreds(): AICredentialsService {
  return {
    hasKey: async () => false,
    getKey: async () => null,
    setKey: async () => {},
    clearKey: async () => {},
  } as unknown as AICredentialsService
}

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const c of stream) out += c
  return out
}

const step = (
  id: string,
  keyword: StepDefinition['keyword'],
  pattern: string,
  isGeneric: boolean,
): StepDefinition => ({
  id,
  keyword,
  pattern,
  location: `features/steps/${isGeneric ? 'generic' : 'app'}.steps.ts:1`,
  args: [],
  isGeneric,
})

const PROJECT_STEPS = [
  step('p1', 'Given', 'I am on the {string} page', false),
  step('p2', 'When', 'I click on {string}', false),
]
const GENERIC_STEPS = [step('g1', 'Then', 'I should see {string}', true)]

async function promptFor(
  steps: StepDefinition[],
  input = 'a customer checks out',
  scenarioText: string | null = null,
): Promise<string> {
  const provider = new FakeAIProvider({ chunks: ['{"scenarios":[],"gaps":[]}'] })
  const service = new AIService({
    provider,
    settingsService: fakeSettings(),
    credentialsService: fakeCreds(),
  })

  await collect(
    service.stream({
      kind: 'scenario-generate',
      input,
      context: { steps, scenarioText, targetStep: null },
    }),
  )

  return provider.callHistory[0]!.input
}

describe('AIService: scenario-generate prompt', () => {
  let prompt: string

  beforeEach(async () => {
    prompt = await promptFor([...PROJECT_STEPS, ...GENERIC_STEPS])
  })

  it('numbers the available steps from zero', async () => {
    expect(prompt).toContain('[0] Given I am on the {string} page')
    expect(prompt).toContain('[1] When I click on {string}')
    expect(prompt).toContain('[2] Then I should see {string}')
  })

  it('instructs the JSON reply shape', async () => {
    expect(prompt).toContain('"scenarios"')
    expect(prompt).toContain('"gaps"')
    expect(prompt).toMatch(/"i"/)
    expect(prompt).toMatch(/"text"/)
  })

  it('forbids inventing steps', async () => {
    expect(prompt.toLowerCase()).toMatch(/only|not invent/)
  })

  it('includes the tester request', async () => {
    expect(prompt).toContain('a customer checks out')
  })

  it('includes the current scenario when editing', async () => {
    const withScenario = await promptFor(
      PROJECT_STEPS,
      'add the declined path',
      'Scenario: Pay\n  Given I am on the "pay" page',
    )
    expect(withScenario).toContain('Given I am on the "pay" page')
  })

  it('never names the tier, so the model cannot reason about it directly', async () => {
    // Preference for project steps is expressed positionally (lowest indices
    // first), not by labelling steps. A model that ignores the instruction
    // still cannot produce a step that does not exist.
    expect(prompt).not.toMatch(/\bgeneric\b/i)
    expect(prompt).not.toMatch(/\bproject step/i)
    expect(prompt).not.toMatch(/\btier\b/i)
  })

  it('instructs a preference for lower-numbered steps', async () => {
    expect(prompt.toLowerCase()).toContain('lower')
  })

  it('instructs one scenario per acceptance criterion (FR-019)', async () => {
    expect(prompt.toLowerCase()).toContain('one')
    expect(prompt.toLowerCase()).toContain('criterion')
  })

  it('is stable for the same input', async () => {
    const again = await promptFor([...PROJECT_STEPS, ...GENERIC_STEPS])
    expect(again).toBe(prompt)
  })

  it('handles an empty step list without crashing', async () => {
    const empty = await promptFor([])
    expect(empty).toContain('(none provided)')
  })
})
