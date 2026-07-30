import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { ScenarioDraft } from '@suisui/shared'
import { useScenarioStore } from '../../stores/scenario'

/**
 * Applying an accepted draft (feature 012, US3).
 *
 * The invariant that matters: `extend` cannot lose anything. It is the default,
 * so it is the path most drafts take.
 */

const draft = (overrides: Partial<ScenarioDraft> = {}): ScenarioDraft => ({
  name: 'Drafted scenario',
  tags: [],
  steps: [
    {
      catalogStepId: 'c1',
      keyword: 'When',
      pattern: 'I click on {string}',
      tier: 'project',
      args: [{ name: 'label', type: 'string', value: 'Checkout' }],
      unresolvedArgs: [],
    },
  ],
  gaps: [],
  dropped: [],
  validation: null,
  requirementRef: null,
  ...overrides,
})

beforeEach(() => {
  setActivePinia(createPinia())
})

function storeWithExistingScenario() {
  const store = useScenarioStore()
  store.createNew('Existing scenario')
  store.scenarios[0]!.steps = [
    {
      id: 'existing-1',
      keyword: 'Given',
      pattern: 'I am logged in as {string}',
      args: [{ name: 'role', type: 'string', value: 'admin' }],
    },
  ]
  store.isDirty = false
  return store
}

describe('scenarioStore.applyDraft', () => {
  describe('extend (SC-008)', () => {
    it('appends the draft steps after the existing ones', () => {
      const store = storeWithExistingScenario()

      store.applyDraft(draft(), 'extend')

      expect(store.scenarios[0]!.steps.map((s) => s.pattern)).toEqual([
        'I am logged in as {string}',
        'I click on {string}',
      ])
    })

    it('preserves every existing argument value', () => {
      const store = storeWithExistingScenario()

      store.applyDraft(draft(), 'extend')

      expect(store.scenarios[0]!.steps[0]!.args).toEqual([
        { name: 'role', type: 'string', value: 'admin' },
      ])
    })

    it('carries the drafted argument values through', () => {
      const store = storeWithExistingScenario()

      store.applyDraft(draft(), 'extend')

      expect(store.scenarios[0]!.steps[1]!.args).toEqual([
        { name: 'label', type: 'string', value: 'Checkout' },
      ])
    })

    it('does not rename a scenario the tester already named', () => {
      const store = storeWithExistingScenario()

      store.applyDraft(draft({ name: 'Something else' }), 'extend')

      expect(store.scenarios[0]!.name).toBe('Existing scenario')
    })

    it('names an unnamed scenario from the draft', () => {
      const store = useScenarioStore()
      store.createNew('')
      store.scenarios[0]!.name = ''

      store.applyDraft(draft({ name: 'Drafted scenario' }), 'extend')

      expect(store.scenarios[0]!.name).toBe('Drafted scenario')
    })

    it('is the default mode', () => {
      const store = storeWithExistingScenario()

      store.applyDraft(draft())

      expect(store.scenarios[0]!.steps).toHaveLength(2)
    })

    it('gives each applied step a fresh id', () => {
      const store = storeWithExistingScenario()

      store.applyDraft(draft(), 'extend')

      const ids = store.scenarios[0]!.steps.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  describe('redraft', () => {
    it('replaces the existing steps', () => {
      const store = storeWithExistingScenario()

      store.applyDraft(draft(), 'redraft')

      expect(store.scenarios[0]!.steps.map((s) => s.pattern)).toEqual(['I click on {string}'])
    })

    it('takes the draft name', () => {
      const store = storeWithExistingScenario()

      store.applyDraft(draft({ name: 'A fresh start' }), 'redraft')

      expect(store.scenarios[0]!.name).toBe('A fresh start')
    })
  })

  describe('tags and traceability', () => {
    it('merges draft tags without duplicating existing ones', () => {
      const store = storeWithExistingScenario()
      store.scenarios[0]!.tags = ['smoke']

      store.applyDraft(draft({ tags: ['smoke', 'checkout'] }), 'extend')

      expect(store.scenarios[0]!.tags).toEqual(['smoke', 'checkout'])
    })

    it('records a requirement reference as a leading comment (FR-029)', () => {
      const store = storeWithExistingScenario()

      store.applyDraft(draft({ requirementRef: 'https://example.test/issues/102' }), 'extend')

      expect(store.scenarios[0]!.comments).toEqual([
        '# Requirement: https://example.test/issues/102',
      ])
    })

    it('does not duplicate a requirement comment that is already present', () => {
      const store = storeWithExistingScenario()
      store.scenarios[0]!.comments = ['# Requirement: GH-102']

      store.applyDraft(draft({ requirementRef: 'GH-102' }), 'extend')

      expect(store.scenarios[0]!.comments).toEqual(['# Requirement: GH-102'])
    })

    it('records no comment when no reference was supplied', () => {
      const store = storeWithExistingScenario()

      store.applyDraft(draft(), 'extend')

      expect(store.scenarios[0]!.comments).toBeUndefined()
    })
  })

  describe('persistence (FR-014)', () => {
    it('marks the scenario dirty without writing to disk', () => {
      const store = storeWithExistingScenario()

      store.applyDraft(draft(), 'extend')

      expect(store.isDirty).toBe(true)
      expect(store.currentFeaturePath).toBeNull()
    })
  })
})
