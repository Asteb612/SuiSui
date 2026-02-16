import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useScenarioStore } from '../stores/scenario'

describe('useScenarioStore actions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('scenario management', () => {
    it('addScenario appends a new scenario and activates it', () => {
      const store = useScenarioStore()
      store.scenarios = [{ name: 'First', tags: [], steps: [] }]
      store.activeScenarioIndex = 0

      store.addScenario('Second')

      expect(store.scenarios).toHaveLength(2)
      expect(store.scenarios[1]?.name).toBe('Second')
      expect(store.activeScenarioIndex).toBe(1)
      expect(store.isDirty).toBe(true)
    })

    it('addScenario with isOutline creates examples table', () => {
      const store = useScenarioStore()
      store.scenarios = [{ name: 'First', tags: [], steps: [] }]

      store.addScenario('Outline', true)

      expect(store.scenarios[1]?.examples).toBeDefined()
      expect(store.scenarios[1]?.examples?.columns).toEqual([])
      expect(store.scenarios[1]?.examples?.rows).toEqual([])
    })

    it('addScenario uses default name when none provided', () => {
      const store = useScenarioStore()
      store.scenarios = [{ name: 'First', tags: [], steps: [] }]

      store.addScenario()

      expect(store.scenarios[1]?.name).toBe('New Scenario')
    })

    it('removeScenario removes scenario and adjusts active index', () => {
      const store = useScenarioStore()
      store.scenarios = [
        { name: 'First', tags: [], steps: [] },
        { name: 'Second', tags: [], steps: [] },
        { name: 'Third', tags: [], steps: [] },
      ]
      store.activeScenarioIndex = 2

      store.removeScenario(1)

      expect(store.scenarios).toHaveLength(2)
      expect(store.scenarios[1]?.name).toBe('Third')
      expect(store.activeScenarioIndex).toBe(1)
      expect(store.isDirty).toBe(true)
    })

    it('removeScenario adjusts index when removing last scenario', () => {
      const store = useScenarioStore()
      store.scenarios = [
        { name: 'First', tags: [], steps: [] },
        { name: 'Second', tags: [], steps: [] },
      ]
      store.activeScenarioIndex = 1

      store.removeScenario(1)

      expect(store.scenarios).toHaveLength(1)
      expect(store.activeScenarioIndex).toBe(0)
    })

    it('removeScenario does nothing when only one scenario', () => {
      const store = useScenarioStore()
      store.scenarios = [{ name: 'Only', tags: [], steps: [] }]

      store.removeScenario(0)

      expect(store.scenarios).toHaveLength(1)
      expect(store.scenarios[0]?.name).toBe('Only')
    })

    it('setActiveScenario changes active index', () => {
      const store = useScenarioStore()
      store.scenarios = [
        { name: 'First', tags: [], steps: [] },
        { name: 'Second', tags: [], steps: [] },
      ]

      store.setActiveScenario(1)

      expect(store.activeScenarioIndex).toBe(1)
      expect(store.validation).toBeNull()
    })

    it('setActiveScenario rejects out-of-range index', () => {
      const store = useScenarioStore()
      store.scenarios = [{ name: 'Only', tags: [], steps: [] }]
      store.activeScenarioIndex = 0

      store.setActiveScenario(5)

      expect(store.activeScenarioIndex).toBe(0)
    })
  })

  describe('step management', () => {
    it('addStep appends a step to the active scenario', () => {
      const store = useScenarioStore()
      store.scenarios = [{ name: 'Test', tags: [], steps: [] }]
      store.activeScenarioIndex = 0

      store.addStep('Given', 'I am on the {string} page', [
        { name: 'page', type: 'string', required: true },
      ])

      expect(store.scenarios[0]?.steps).toHaveLength(1)
      expect(store.scenarios[0]?.steps[0]?.keyword).toBe('Given')
      expect(store.scenarios[0]?.steps[0]?.pattern).toBe('I am on the {string} page')
      expect(store.scenarios[0]?.steps[0]?.args[0]?.value).toBe('')
      expect(store.isDirty).toBe(true)
    })

    it('removeStep removes a step by ID', () => {
      const store = useScenarioStore()
      store.scenarios = [{
        name: 'Test',
        tags: [],
        steps: [
          { id: 'step-1', keyword: 'Given', pattern: 'step one', args: [] },
          { id: 'step-2', keyword: 'When', pattern: 'step two', args: [] },
        ],
      }]
      store.activeScenarioIndex = 0

      store.removeStep('step-1')

      expect(store.scenarios[0]?.steps).toHaveLength(1)
      expect(store.scenarios[0]?.steps[0]?.id).toBe('step-2')
      expect(store.isDirty).toBe(true)
    })

    it('removeStep does nothing for non-existent ID', () => {
      const store = useScenarioStore()
      store.scenarios = [{
        name: 'Test',
        tags: [],
        steps: [{ id: 'step-1', keyword: 'Given', pattern: 'step one', args: [] }],
      }]

      store.removeStep('non-existent')

      expect(store.scenarios[0]?.steps).toHaveLength(1)
    })

    it('insertStepAt inserts a step at the given index', () => {
      const store = useScenarioStore()
      store.scenarios = [{
        name: 'Test',
        tags: [],
        steps: [
          { id: 'step-1', keyword: 'Given', pattern: 'first', args: [] },
          { id: 'step-3', keyword: 'Then', pattern: 'third', args: [] },
        ],
      }]
      store.activeScenarioIndex = 0

      store.insertStepAt(1, 'When', 'second', [])

      expect(store.scenarios[0]?.steps).toHaveLength(3)
      expect(store.scenarios[0]?.steps[1]?.keyword).toBe('When')
      expect(store.scenarios[0]?.steps[1]?.pattern).toBe('second')
    })

    it('moveStep reorders steps correctly', () => {
      const store = useScenarioStore()
      store.scenarios = [{
        name: 'Test',
        tags: [],
        steps: [
          { id: 'a', keyword: 'Given', pattern: 'A', args: [] },
          { id: 'b', keyword: 'When', pattern: 'B', args: [] },
          { id: 'c', keyword: 'Then', pattern: 'C', args: [] },
        ],
      }]
      store.activeScenarioIndex = 0

      store.moveStep(0, 2)

      // splice removes at 0 → [b, c], then inserts at 2 → [b, c, a]
      expect(store.scenarios[0]?.steps[0]?.id).toBe('b')
      expect(store.scenarios[0]?.steps[1]?.id).toBe('c')
      expect(store.scenarios[0]?.steps[2]?.id).toBe('a')
      expect(store.isDirty).toBe(true)
    })

    it('updateStepArg updates an existing argument value', () => {
      const store = useScenarioStore()
      store.scenarios = [{
        name: 'Test',
        tags: [],
        steps: [{
          id: 'step-1',
          keyword: 'Given',
          pattern: 'I am on the {string} page',
          args: [{ name: 'page', type: 'string', value: '' }],
        }],
      }]
      store.activeScenarioIndex = 0

      store.updateStepArg('step-1', 'page', 'home')

      expect(store.scenarios[0]?.steps[0]?.args[0]?.value).toBe('home')
      expect(store.isDirty).toBe(true)
    })

    it('updateStepArg creates argument if it does not exist', () => {
      const store = useScenarioStore()
      store.scenarios = [{
        name: 'Test',
        tags: [],
        steps: [{
          id: 'step-1',
          keyword: 'Given',
          pattern: 'some pattern',
          args: [],
        }],
      }]
      store.activeScenarioIndex = 0

      store.updateStepArg('step-1', 'newArg', 'newValue', 'string')

      expect(store.scenarios[0]?.steps[0]?.args).toHaveLength(1)
      expect(store.scenarios[0]?.steps[0]?.args[0]?.name).toBe('newArg')
      expect(store.scenarios[0]?.steps[0]?.args[0]?.value).toBe('newValue')
    })

    it('updateStep updates partial step fields', () => {
      const store = useScenarioStore()
      store.scenarios = [{
        name: 'Test',
        tags: [],
        steps: [{
          id: 'step-1',
          keyword: 'Given',
          pattern: 'original',
          args: [],
        }],
      }]
      store.activeScenarioIndex = 0

      store.updateStep('step-1', { keyword: 'When' })

      expect(store.scenarios[0]?.steps[0]?.keyword).toBe('When')
      expect(store.scenarios[0]?.steps[0]?.pattern).toBe('original')
    })
  })

  describe('background step management', () => {
    it('addBackgroundStep appends to background', () => {
      const store = useScenarioStore()
      store.background = []

      store.addBackgroundStep('Given', 'I am logged in', [])

      expect(store.background).toHaveLength(1)
      expect(store.background[0]?.keyword).toBe('Given')
      expect(store.background[0]?.pattern).toBe('I am logged in')
      expect(store.isDirty).toBe(true)
    })

    it('removeBackgroundStep removes by ID', () => {
      const store = useScenarioStore()
      store.background = [
        { id: 'bg-1', keyword: 'Given', pattern: 'first', args: [] },
        { id: 'bg-2', keyword: 'And', pattern: 'second', args: [] },
      ]

      store.removeBackgroundStep('bg-1')

      expect(store.background).toHaveLength(1)
      expect(store.background[0]?.id).toBe('bg-2')
    })

    it('insertBackgroundStepAt inserts at position', () => {
      const store = useScenarioStore()
      store.background = [
        { id: 'bg-1', keyword: 'Given', pattern: 'first', args: [] },
      ]

      store.insertBackgroundStepAt(0, 'Given', 'zeroth', [])

      expect(store.background).toHaveLength(2)
      expect(store.background[0]?.pattern).toBe('zeroth')
      expect(store.background[1]?.pattern).toBe('first')
    })

    it('moveBackgroundStep reorders background steps', () => {
      const store = useScenarioStore()
      store.background = [
        { id: 'bg-1', keyword: 'Given', pattern: 'A', args: [] },
        { id: 'bg-2', keyword: 'And', pattern: 'B', args: [] },
      ]

      store.moveBackgroundStep(1, 0)

      expect(store.background[0]?.id).toBe('bg-2')
      expect(store.background[1]?.id).toBe('bg-1')
    })

    it('updateBackgroundStepArg updates existing arg', () => {
      const store = useScenarioStore()
      store.background = [{
        id: 'bg-1',
        keyword: 'Given',
        pattern: 'I am on {string}',
        args: [{ name: 'page', type: 'string', value: '' }],
      }]

      store.updateBackgroundStepArg('bg-1', 'page', 'home')

      expect(store.background[0]?.args[0]?.value).toBe('home')
    })

    it('updateBackgroundStepArg creates arg if missing', () => {
      const store = useScenarioStore()
      store.background = [{
        id: 'bg-1',
        keyword: 'Given',
        pattern: 'some step',
        args: [],
      }]

      store.updateBackgroundStepArg('bg-1', 'newArg', 'val', 'enum', ['val', 'other'])

      expect(store.background[0]?.args).toHaveLength(1)
      expect(store.background[0]?.args[0]?.enumValues).toEqual(['val', 'other'])
    })
  })

  describe('metadata and tags', () => {
    it('setName updates the active scenario name', () => {
      const store = useScenarioStore()
      store.scenarios = [{ name: 'Old', tags: [], steps: [] }]
      store.activeScenarioIndex = 0

      store.setName('New Name')

      expect(store.scenarios[0]?.name).toBe('New Name')
      expect(store.isDirty).toBe(true)
    })

    it('setFeatureName updates feature name', () => {
      const store = useScenarioStore()

      store.setFeatureName('My Feature')

      expect(store.featureName).toBe('My Feature')
      expect(store.isDirty).toBe(true)
    })

    it('setFeatureTags updates feature-level tags', () => {
      const store = useScenarioStore()

      store.setFeatureTags(['smoke', 'regression'])

      expect(store.featureTags).toEqual(['smoke', 'regression'])
      expect(store.isDirty).toBe(true)
    })

    it('setScenarioTags updates active scenario tags', () => {
      const store = useScenarioStore()
      store.scenarios = [{ name: 'Test', tags: [], steps: [] }]
      store.activeScenarioIndex = 0

      store.setScenarioTags(['critical'])

      expect(store.scenarios[0]?.tags).toEqual(['critical'])
      expect(store.isDirty).toBe(true)
    })

    it('setFeatureDescription updates description', () => {
      const store = useScenarioStore()

      store.setFeatureDescription('As a user\nI want to test')

      expect(store.featureDescription).toBe('As a user\nI want to test')
      expect(store.isDirty).toBe(true)
    })
  })

  describe('example table management', () => {
    it('removeExampleColumn removes column and cleans rows', () => {
      const store = useScenarioStore()
      store.scenarios = [{
        name: 'Test',
        tags: [],
        steps: [],
        examples: {
          columns: ['role', 'status'],
          rows: [{ role: 'admin', status: 'active' }],
        },
      }]
      store.activeScenarioIndex = 0

      store.removeExampleColumn('status')

      expect(store.scenarios[0]?.examples?.columns).toEqual(['role'])
      expect(store.scenarios[0]?.examples?.rows[0]).toEqual({ role: 'admin' })
    })

    it('removeExampleRow removes row by index', () => {
      const store = useScenarioStore()
      store.scenarios = [{
        name: 'Test',
        tags: [],
        steps: [],
        examples: {
          columns: ['role'],
          rows: [{ role: 'admin' }, { role: 'user' }],
        },
      }]
      store.activeScenarioIndex = 0

      store.removeExampleRow(0)

      expect(store.scenarios[0]?.examples?.rows).toHaveLength(1)
      expect(store.scenarios[0]?.examples?.rows[0]?.role).toBe('user')
    })

    it('removeExampleRow with invalid index does nothing', () => {
      const store = useScenarioStore()
      store.scenarios = [{
        name: 'Test',
        tags: [],
        steps: [],
        examples: { columns: ['a'], rows: [{ a: '1' }] },
      }]
      store.activeScenarioIndex = 0

      store.removeExampleRow(5)

      expect(store.scenarios[0]?.examples?.rows).toHaveLength(1)
    })
  })

  describe('dirty state tracking', () => {
    it('starts clean', () => {
      const store = useScenarioStore()
      expect(store.isDirty).toBe(false)
    })

    it('createNew sets dirty', () => {
      const store = useScenarioStore()
      store.createNew('New Feature')
      expect(store.isDirty).toBe(true)
    })

    it('clear resets dirty state', () => {
      const store = useScenarioStore()
      store.isDirty = true
      store.clear()
      expect(store.isDirty).toBe(false)
    })
  })

  describe('createNew', () => {
    it('initializes a blank feature with one scenario', () => {
      const store = useScenarioStore()

      store.createNew('Login Feature')

      expect(store.featureName).toBe('Login Feature')
      expect(store.featureTags).toEqual([])
      expect(store.featureDescription).toBe('')
      expect(store.background).toEqual([])
      expect(store.scenarios).toHaveLength(1)
      expect(store.scenarios[0]?.name).toBe('Login Feature')
      expect(store.activeScenarioIndex).toBe(0)
      expect(store.isDirty).toBe(true)
      expect(store.currentFeaturePath).toBeNull()
    })
  })

  describe('replaceStep', () => {
    it('replaces step preserving matching arg values', () => {
      const store = useScenarioStore()
      store.scenarios = [{
        name: 'Test',
        tags: [],
        steps: [{
          id: 'step-1',
          keyword: 'Given',
          pattern: 'I am on the {string} page',
          args: [{ name: 'page', type: 'string', value: 'home' }],
        }],
      }]
      store.activeScenarioIndex = 0

      store.replaceStep('step-1', 'When', 'I click on {string}', [
        { name: 'page', type: 'string', required: true },
      ])

      const step = store.scenarios[0]?.steps[0]
      expect(step?.keyword).toBe('When')
      expect(step?.pattern).toBe('I click on {string}')
      expect(step?.args[0]?.value).toBe('home')
      expect(step?.id).toBe('step-1')
    })

    it('replaceStep clears values for non-matching args', () => {
      const store = useScenarioStore()
      store.scenarios = [{
        name: 'Test',
        tags: [],
        steps: [{
          id: 'step-1',
          keyword: 'Given',
          pattern: 'old',
          args: [{ name: 'oldArg', type: 'string', value: 'old' }],
        }],
      }]
      store.activeScenarioIndex = 0

      store.replaceStep('step-1', 'Given', 'new', [
        { name: 'newArg', type: 'int', required: true },
      ])

      expect(store.scenarios[0]?.steps[0]?.args[0]?.name).toBe('newArg')
      expect(store.scenarios[0]?.steps[0]?.args[0]?.value).toBe('')
    })
  })

  describe('getters', () => {
    it('scenario returns active scenario', () => {
      const store = useScenarioStore()
      store.scenarios = [
        { name: 'First', tags: [], steps: [] },
        { name: 'Second', tags: [], steps: [] },
      ]
      store.activeScenarioIndex = 1

      expect(store.scenario.name).toBe('Second')
    })

    it('scenario returns fallback for empty scenarios', () => {
      const store = useScenarioStore()
      store.scenarios = []

      expect(store.scenario.name).toBe('')
      expect(store.scenario.steps).toEqual([])
    })

    it('hasSteps returns true when steps exist', () => {
      const store = useScenarioStore()
      store.scenarios = [{
        name: 'Test',
        tags: [],
        steps: [{ id: '1', keyword: 'Given', pattern: 'x', args: [] }],
      }]

      expect(store.hasSteps).toBe(true)
    })

    it('hasSteps returns false for empty steps', () => {
      const store = useScenarioStore()
      store.scenarios = [{ name: 'Test', tags: [], steps: [] }]

      expect(store.hasSteps).toBe(false)
    })

    it('errors filters validation issues by severity', () => {
      const store = useScenarioStore()
      store.validation = {
        isValid: false,
        issues: [
          { severity: 'error', message: 'err1' },
          { severity: 'warning', message: 'warn1' },
          { severity: 'error', message: 'err2' },
        ],
      }

      expect(store.errors).toHaveLength(2)
      expect(store.warnings).toHaveLength(1)
    })

    it('isValid defaults to true when no validation', () => {
      const store = useScenarioStore()
      expect(store.isValid).toBe(true)
    })
  })

  describe('toGherkin with background and multiple scenarios', () => {
    it('generates background section', () => {
      const store = useScenarioStore()
      store.featureName = 'Test'
      store.background = [
        { id: '1', keyword: 'Given', pattern: 'I am logged in', args: [] },
      ]
      store.scenarios = [{ name: 'Test', tags: [], steps: [] }]

      const output = store.toGherkin()

      expect(output).toContain('  Background:')
      expect(output).toContain('    Given I am logged in')
    })

    it('generates multiple scenarios', () => {
      const store = useScenarioStore()
      store.featureName = 'Multi'
      store.scenarios = [
        { name: 'First', tags: [], steps: [{ id: '1', keyword: 'Given', pattern: 'step A', args: [] }] },
        { name: 'Second', tags: ['smoke'], steps: [{ id: '2', keyword: 'When', pattern: 'step B', args: [] }] },
      ]

      const output = store.toGherkin()

      expect(output).toContain('  Scenario: First')
      expect(output).toContain('    Given step A')
      expect(output).toContain('  @smoke')
      expect(output).toContain('  Scenario: Second')
      expect(output).toContain('    When step B')
    })
  })

  describe('parseGherkin with multiple scenarios', () => {
    it('parses multiple scenarios from single feature', () => {
      const store = useScenarioStore()
      const content = `Feature: Multi
  Scenario: First
    Given step A

  Scenario: Second
    When step B`

      store.parseGherkin(content)

      expect(store.scenarios).toHaveLength(2)
      expect(store.scenarios[0]?.name).toBe('First')
      expect(store.scenarios[1]?.name).toBe('Second')
    })

    it('parses empty feature with no scenarios into one empty scenario', () => {
      const store = useScenarioStore()
      store.parseGherkin('Feature: Empty')

      expect(store.scenarios).toHaveLength(1)
      expect(store.scenarios[0]?.name).toBe('')
    })
  })
})
