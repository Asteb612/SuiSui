import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import type { ScenarioGenerationOutcome, ScenarioStep } from '@suisui/shared'
import AiScenarioDialog from '../components/AiScenarioDialog.vue'
import { primeVueStubs, mockStepDefinitions } from './testUtils'
import { useScenarioStore } from '../stores/scenario'
import { useAiStore } from '../stores/ai'

/**
 * Feature 012 review UI. The invariant under test throughout: nothing reaches
 * the tester's scenario until they accept, and a redraft — the only destructive
 * outcome — cannot happen on a single click.
 */

const extraStubs = {
  ...primeVueStubs,
  Message: {
    name: 'Message',
    template: '<div class="p-message" :class="severity"><slot /></div>',
    props: ['severity', 'closable'],
  },
  Tag: {
    name: 'Tag',
    template: '<span class="p-tag">{{ value }}</span>',
    props: ['value', 'severity'],
  },
  RadioButton: {
    name: 'RadioButton',
    template:
      '<input type="radio" :value="value" :checked="modelValue === value" @change="$emit(\'update:modelValue\', value)" />',
    props: ['modelValue', 'value', 'inputId'],
    emits: ['update:modelValue'],
  },
  ProgressSpinner: {
    name: 'ProgressSpinner',
    template: '<div class="p-progressspinner" />',
    props: ['style'],
  },
}

const draftedOutcome = (): ScenarioGenerationOutcome => ({
  status: 'drafted',
  truncated: false,
  scenarios: [
    {
      name: 'Visit the home page',
      tags: ['smoke'],
      steps: [
        {
          catalogStepId: 'step-1',
          keyword: 'Given',
          pattern: 'I am on the {string} page',
          tier: 'project',
          args: [{ name: 'page', type: 'string', value: 'home' }],
          unresolvedArgs: [],
        },
        {
          catalogStepId: 'step-2',
          keyword: 'Then',
          pattern: 'I should see {string}',
          tier: 'generic',
          args: [{ name: 'text', type: 'string', value: '' }],
          unresolvedArgs: ['text'],
        },
      ],
      gaps: [{ text: 'verify the confirmation email arrives' }],
      dropped: [{ raw: 'I hack the mainframe', reason: 'out-of-range' }],
      validation: null,
      requirementRef: null,
    },
  ],
})

const existingStep = (id: string, pattern: string): ScenarioStep => ({
  id,
  keyword: 'Given',
  pattern,
  args: [],
})

function createWrapper(
  options: {
    outcome?: ScenarioGenerationOutcome | null
    existingSteps?: ScenarioStep[]
    aiConfigured?: boolean
    steps?: typeof mockStepDefinitions
    applyMode?: 'extend' | 'redraft'
  } = {},
) {
  return render(AiScenarioDialog, {
    props: { visible: true, scenarioText: null },
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: true,
          initialState: {
            ai: {
              config: { type: options.aiConfigured === false ? null : 'ollama' },
              scenarioOutcome: options.outcome ?? null,
              applyMode: options.applyMode ?? 'extend',
              isStreaming: false,
            },
            steps: {
              steps: options.steps ?? mockStepDefinitions,
              catalog: [],
              isLoading: false,
              error: null,
            },
            scenario: {
              scenarios: [
                {
                  name: 'Existing',
                  tags: [],
                  steps: options.existingSteps ?? [],
                },
              ],
              activeScenarioIndex: 0,
            },
          },
        }),
      ],
      stubs: extraStubs,
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Stub only `window.api` — replacing `window` wholesale breaks testing-library's
  // access to the document.
  ;(window as unknown as { api: unknown }).api = {
    validate: { scenario: vi.fn(async () => ({ isValid: true, issues: [] })) },
  }
})

describe('AiScenarioDialog', () => {
  describe('availability (FR-003)', () => {
    it('says why generation is unavailable when the workspace has no steps', () => {
      createWrapper({ steps: [] })
      expect(screen.getByTestId('ai-scenario-no-steps')).toBeTruthy()
      expect(screen.queryByTestId('ai-scenario-description')).toBeNull()
    })
  })

  describe('review of a draft', () => {
    it('lists every proposed step', () => {
      createWrapper({ outcome: draftedOutcome() })
      expect(screen.getAllByTestId('ai-scenario-step')).toHaveLength(2)
    })

    it('badges each step project or generic (FR-011)', () => {
      createWrapper({ outcome: draftedOutcome() })
      const tiers = screen.getAllByTestId('ai-scenario-step-tier').map((el) => el.textContent)
      expect(tiers).toEqual(['project', 'generic'])
    })

    it('flags arguments that need the tester (FR-006)', () => {
      createWrapper({ outcome: draftedOutcome() })
      expect(screen.getByTestId('ai-scenario-step-unresolved').textContent).toContain('text')
    })

    it('reports gaps separately from the steps (FR-007)', () => {
      createWrapper({ outcome: draftedOutcome() })
      expect(screen.getByTestId('ai-scenario-gaps').textContent).toContain(
        'verify the confirmation email arrives',
      )
    })

    it('reports discarded suggestions with a reason (FR-005)', () => {
      createWrapper({ outcome: draftedOutcome() })
      const dropped = screen.getByTestId('ai-scenario-dropped').textContent
      expect(dropped).toContain('I hack the mainframe')
      expect(dropped).toContain('out-of-range')
    })
  })

  describe('outcomes are always explicit (SC-006)', () => {
    it('renders a failure in plain language with a retry (FR-021)', () => {
      createWrapper({ outcome: { status: 'failed', message: 'provider unreachable' } })
      expect(screen.getByTestId('ai-scenario-failed').textContent).toContain('provider unreachable')
      expect(screen.getByTestId('ai-scenario-generate')).toBeTruthy()
      expect(screen.queryByTestId('ai-scenario-draft')).toBeNull()
    })

    it('renders an empty outcome with its reason', () => {
      createWrapper({ outcome: { status: 'empty', reason: 'nothing could be assembled' } })
      expect(screen.getByTestId('ai-scenario-empty').textContent).toContain(
        'nothing could be assembled',
      )
      expect(screen.queryByTestId('ai-scenario-draft')).toBeNull()
    })

    it('warns when the step list was truncated (FR-022)', () => {
      const outcome = draftedOutcome()
      if (outcome.status === 'drafted') outcome.truncated = true
      createWrapper({ outcome })
      expect(screen.getByTestId('ai-scenario-truncated')).toBeTruthy()
    })
  })

  describe('extend vs redraft (FR-024 → FR-028)', () => {
    it('offers no choice when the scenario is empty (FR-028)', () => {
      createWrapper({ outcome: draftedOutcome(), existingSteps: [] })
      expect(screen.queryByTestId('ai-scenario-mode')).toBeNull()
    })

    it('offers the choice when the scenario has steps, with extend pre-selected', () => {
      createWrapper({
        outcome: draftedOutcome(),
        existingSteps: [existingStep('s1', 'I am logged in')],
      })
      expect(screen.getByTestId('ai-scenario-mode')).toBeTruthy()

      const extend = screen.getByTestId('ai-scenario-mode-extend') as HTMLInputElement
      expect(extend.checked).toBe(true)
    })

    it('shows which steps a redraft would replace (FR-026)', () => {
      createWrapper({
        outcome: draftedOutcome(),
        existingSteps: [existingStep('s1', 'I am logged in')],
        applyMode: 'redraft',
      })
      expect(screen.getByTestId('ai-scenario-losing').textContent).toContain('I am logged in')
    })

    it('does not show a replacement warning in extend mode', () => {
      createWrapper({
        outcome: draftedOutcome(),
        existingSteps: [existingStep('s1', 'I am logged in')],
        applyMode: 'extend',
      })
      expect(screen.queryByTestId('ai-scenario-losing')).toBeNull()
    })

    it('applies an extend on the first accept — no extra confirmation', async () => {
      createWrapper({
        outcome: draftedOutcome(),
        existingSteps: [existingStep('s1', 'I am logged in')],
        applyMode: 'extend',
      })
      const scenarioStore = useScenarioStore()

      await fireEvent.click(screen.getByTestId('ai-scenario-accept'))

      expect(scenarioStore.applyDraft).toHaveBeenCalledTimes(1)
      expect(scenarioStore.applyDraft).toHaveBeenCalledWith(expect.anything(), 'extend')
    })

    it('requires a second, distinct confirmation before a redraft (FR-027)', async () => {
      createWrapper({
        outcome: draftedOutcome(),
        existingSteps: [existingStep('s1', 'I am logged in')],
        applyMode: 'redraft',
      })
      const scenarioStore = useScenarioStore()

      // First click only arms the confirmation — nothing is applied.
      await fireEvent.click(screen.getByTestId('ai-scenario-accept'))
      expect(scenarioStore.applyDraft).not.toHaveBeenCalled()
      expect(screen.getByTestId('ai-scenario-redraft-confirm')).toBeTruthy()

      // Second click applies it.
      await fireEvent.click(screen.getByTestId('ai-scenario-accept'))
      expect(scenarioStore.applyDraft).toHaveBeenCalledWith(expect.anything(), 'redraft')
    })
  })

  describe('nothing is applied without acceptance (FR-012, SC-005)', () => {
    it('discard leaves the scenario untouched', async () => {
      createWrapper({ outcome: draftedOutcome() })
      const scenarioStore = useScenarioStore()
      const aiStore = useAiStore()

      await fireEvent.click(screen.getByTestId('ai-scenario-discard'))

      expect(scenarioStore.applyDraft).not.toHaveBeenCalled()
      expect(aiStore.clearScenarioOutcome).toHaveBeenCalled()
    })

    it('closing cancels an in-flight generation and applies nothing', async () => {
      createWrapper({ outcome: null })
      const scenarioStore = useScenarioStore()

      await fireEvent.click(screen.getByTestId('ai-scenario-close'))

      expect(scenarioStore.applyDraft).not.toHaveBeenCalled()
    })

    it('renders no accept action when there is no draft', () => {
      createWrapper({ outcome: null })
      expect(screen.queryByTestId('ai-scenario-accept')).toBeNull()
    })
  })

  describe('multiple drafts (FR-019)', () => {
    it('lets a draft be discarded independently', async () => {
      const outcome = draftedOutcome()
      if (outcome.status === 'drafted') {
        outcome.scenarios = [outcome.scenarios[0]!, { ...outcome.scenarios[0]!, name: 'Second' }]
      }
      createWrapper({ outcome })
      const scenarioStore = useScenarioStore()

      expect(screen.getAllByTestId('ai-scenario-draft')).toHaveLength(2)

      const second = screen.getAllByTestId('ai-scenario-keep-draft')[1] as HTMLInputElement
      second.checked = false
      await fireEvent.change(second)
      await fireEvent.click(screen.getByTestId('ai-scenario-accept'))

      expect(scenarioStore.applyDraft).toHaveBeenCalledTimes(1)
    })
  })
})
