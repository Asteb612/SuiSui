import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useScenarioStore } from '../stores/scenario'

describe('useScenarioStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('parseGherkin', () => {
    it('parses feature tags', () => {
      const store = useScenarioStore()
      const content = `@crm @projects
Feature: CRM Project Management

  Scenario: Test scenario
    Given I am logged in`

      store.parseGherkin(content)

      expect(store.featureTags).toEqual(['crm', 'projects'])
      expect(store.featureName).toBe('CRM Project Management')
    })

    it('parses feature description', () => {
      const store = useScenarioStore()
      const content = `Feature: CRM Project Management

  As a Stakimo manager or seller
  I want to manage projects in the CRM
  So that I can track purchases and commercial activities

  Scenario: Test scenario
    Given I am logged in`

      store.parseGherkin(content)

      expect(store.featureDescription).toContain('As a Stakimo manager or seller')
      expect(store.featureDescription).toContain('I want to manage projects in the CRM')
    })

    it('parses scenario tags', () => {
      const store = useScenarioStore()
      const content = `Feature: Test Feature

  @smoke @critical
  Scenario: Tagged scenario
    Given I am logged in`

      store.parseGherkin(content)

      expect(store.scenarios[0]?.tags).toEqual(['smoke', 'critical'])
    })

    it('parses Scenario Outline with Examples', () => {
      const store = useScenarioStore()
      const content = `Feature: Test Feature

  @smoke
  Scenario Outline: TC_UI_015 - Verify CRM Project page loads
    Given I am logged in as "<role>"
    Then the projects page title should be visible

    Examples:
      | role           |
      | manager        |
      | internalSeller |`

      store.parseGherkin(content)

      const scenario = store.scenarios[0]
      expect(scenario).toBeDefined()
      expect(scenario?.name).toBe('TC_UI_015 - Verify CRM Project page loads')
      expect(scenario?.tags).toEqual(['smoke'])
      expect(scenario?.examples).toBeDefined()
      expect(scenario?.examples?.columns).toEqual(['role'])
      expect(scenario?.examples?.rows).toHaveLength(2)
      expect(scenario?.examples?.rows[0]).toEqual({ role: 'manager' })
      expect(scenario?.examples?.rows[1]).toEqual({ role: 'internalSeller' })
    })

    it('parses complete feature with background, tags, and scenario outline', () => {
      const store = useScenarioStore()
      const content = `@crm @projects
Feature: CRM Project Management

  As a Stakimo manager or seller
  I want to manage projects in the CRM
  So that I can track purchases and commercial activities

  Background:
    Given I am on the CRM projects page
    And the CRM projects page is loaded

  @smoke
  Scenario Outline: TC_UI_015 - Verify CRM Project page loads
    Then the projects page title should be visible

    Examples:
      | role           |
      | manager        |
      | internalSeller |`

      store.parseGherkin(content)

      // Feature tags
      expect(store.featureTags).toEqual(['crm', 'projects'])
      expect(store.featureName).toBe('CRM Project Management')

      // Feature description
      expect(store.featureDescription).toContain('As a Stakimo manager or seller')

      // Background
      expect(store.background).toHaveLength(2)
      expect(store.background[0]?.keyword).toBe('Given')
      expect(store.background[1]?.keyword).toBe('And')

      // Scenario Outline
      const scenario = store.scenarios[0]
      expect(scenario?.tags).toEqual(['smoke'])
      expect(scenario?.examples?.columns).toEqual(['role'])
      expect(scenario?.examples?.rows).toHaveLength(2)
    })

    it('matches step text against step definitions with enum patterns', () => {
      const store = useScenarioStore()
      const content = `Feature: Login
  Scenario: Login test
    Given I am logged in as manager`

      const stepDefinitions = [{
        id: '1',
        pattern: '^I am logged in as (manager|internal seller|external seller|client|broker)$',
        keyword: 'Given' as const,
        location: 'steps.ts:10',
        args: [{
          name: 'role',
          type: 'enum' as const,
          required: true,
          enumValues: ['manager', 'internal seller', 'external seller', 'client', 'broker'],
        }],
      }]

      store.parseGherkin(content, stepDefinitions)

      const step = store.scenarios[0]?.steps[0]
      expect(step?.pattern).toBe('^I am logged in as (manager|internal seller|external seller|client|broker)$')
      expect(step?.args[0]?.type).toBe('enum')
      expect(step?.args[0]?.value).toBe('manager')
      expect(step?.args[0]?.enumValues).toEqual(['manager', 'internal seller', 'external seller', 'client', 'broker'])
    })

    it('matches step text against step definitions with string patterns', () => {
      const store = useScenarioStore()
      const content = `Feature: Login
  Scenario: Login test
    Given I am on the "home" page`

      const stepDefinitions = [{
        id: '1',
        pattern: 'I am on the {string} page',
        keyword: 'Given' as const,
        location: 'steps.ts:10',
        args: [{
          name: 'page',
          type: 'string' as const,
          required: true,
        }],
      }]

      store.parseGherkin(content, stepDefinitions)

      const step = store.scenarios[0]?.steps[0]
      expect(step?.pattern).toBe('I am on the {string} page')
      expect(step?.args[0]?.type).toBe('string')
      expect(step?.args[0]?.value).toBe('home')
    })

    it('falls back to simple pattern when no step definition matches', () => {
      const store = useScenarioStore()
      const content = `Feature: Test
  Scenario: Test
    Given I do something with "value"`

      // Empty step definitions - no match possible
      store.parseGherkin(content, [])

      const step = store.scenarios[0]?.steps[0]
      expect(step?.pattern).toBe('I do something with {string}')
      expect(step?.args[0]?.type).toBe('string')
      expect(step?.args[0]?.value).toBe('value')
    })
  })

  describe('toGherkin', () => {
    it('generates feature tags', () => {
      const store = useScenarioStore()
      store.featureName = 'Test Feature'
      store.featureTags = ['tag1', 'tag2']
      store.scenarios = [{ name: 'Test', tags: [], steps: [] }]

      const output = store.toGherkin()

      expect(output).toContain('@tag1 @tag2')
      expect(output.indexOf('@tag1')).toBeLessThan(output.indexOf('Feature:'))
    })

    it('generates scenario tags', () => {
      const store = useScenarioStore()
      store.featureName = 'Test Feature'
      store.featureTags = []
      store.scenarios = [{ name: 'Test', tags: ['smoke', 'critical'], steps: [] }]

      const output = store.toGherkin()

      expect(output).toContain('@smoke @critical')
      expect(output).toContain('Scenario: Test')
    })

    it('generates Scenario Outline with Examples', () => {
      const store = useScenarioStore()
      store.featureName = 'Test Feature'
      store.featureTags = []
      store.scenarios = [{
        name: 'Verify page loads',
        tags: ['smoke'],
        steps: [{
          id: '1',
          keyword: 'Given',
          pattern: 'I am logged in as {string}',
          args: [{ name: 'arg0', type: 'string', value: '' }],
        }],
        examples: {
          columns: ['role'],
          rows: [
            { role: 'manager' },
            { role: 'internalSeller' },
          ],
        },
      }]

      const output = store.toGherkin()

      expect(output).toContain('Scenario Outline: Verify page loads')
      expect(output).toContain('Examples:')
      expect(output).toContain('| role           |')
      expect(output).toContain('| manager        |')
      expect(output).toContain('| internalSeller |')
    })

    it('generates feature description', () => {
      const store = useScenarioStore()
      store.featureName = 'Test Feature'
      store.featureDescription = 'As a user\nI want to test\nSo that I can verify'
      store.featureTags = []
      store.scenarios = [{ name: 'Test', tags: [], steps: [] }]

      const output = store.toGherkin()

      expect(output).toContain('  As a user')
      expect(output).toContain('  I want to test')
      expect(output).toContain('  So that I can verify')
    })

    it('resolves enum patterns to selected values and strips regex anchors', () => {
      const store = useScenarioStore()
      store.featureName = 'Test Feature'
      store.featureTags = []
      store.scenarios = [{
        name: 'Login test',
        tags: [],
        steps: [{
          id: '1',
          keyword: 'Given',
          pattern: '^I am logged in as (manager|internal seller|external seller|client|broker)$',
          args: [{
            name: 'arg0',
            type: 'enum',
            value: 'manager',
            enumValues: ['manager', 'internal seller', 'external seller', 'client', 'broker'],
          }],
        }],
      }]

      const output = store.toGherkin()

      // Should resolve enum to selected value and strip ^ and $
      expect(output).toContain('Given I am logged in as manager')
      // Should NOT contain the raw pattern
      expect(output).not.toContain('(manager|internal seller')
      expect(output).not.toContain('^I am logged in')
      expect(output).not.toContain('broker)$')
    })

    it('resolves background step enum patterns', () => {
      const store = useScenarioStore()
      store.featureName = 'Test Feature'
      store.featureTags = []
      store.background = [{
        id: '1',
        keyword: 'Given',
        pattern: '^I select (option A|option B|option C)$',
        args: [{
          name: 'arg0',
          type: 'enum',
          value: 'option B',
          enumValues: ['option A', 'option B', 'option C'],
        }],
      }]
      store.scenarios = [{ name: 'Test', tags: [], steps: [] }]

      const output = store.toGherkin()

      expect(output).toContain('Background:')
      expect(output).toContain('Given I select option B')
      expect(output).not.toContain('(option A|option B')
    })
  })

  describe('example management', () => {
    it('adds example column', () => {
      const store = useScenarioStore()
      store.scenarios = [{ name: 'Test', tags: [], steps: [], examples: { columns: [], rows: [] } }]
      store.activeScenarioIndex = 0

      store.addExampleColumn('role')

      expect(store.scenarios[0]?.examples?.columns).toEqual(['role'])
    })

    it('adds example row with empty values for all columns', () => {
      const store = useScenarioStore()
      store.scenarios = [{
        name: 'Test',
        tags: [],
        steps: [],
        examples: { columns: ['role', 'status'], rows: [] },
      }]
      store.activeScenarioIndex = 0

      store.addExampleRow()

      expect(store.scenarios[0]?.examples?.rows).toHaveLength(1)
      expect(store.scenarios[0]?.examples?.rows[0]).toEqual({ role: '', status: '' })
    })

    it('updates example cell', () => {
      const store = useScenarioStore()
      store.scenarios = [{
        name: 'Test',
        tags: [],
        steps: [],
        examples: { columns: ['role'], rows: [{ role: '' }] },
      }]
      store.activeScenarioIndex = 0

      store.updateExampleCell(0, 'role', 'manager')

      expect(store.scenarios[0]?.examples?.rows[0]?.role).toBe('manager')
    })

    it('toggles between scenario and scenario outline', () => {
      const store = useScenarioStore()
      store.scenarios = [{ name: 'Test', tags: [], steps: [] }]
      store.activeScenarioIndex = 0

      // Toggle to outline
      store.toggleScenarioOutline()
      expect(store.scenarios[0]?.examples).toBeDefined()

      // Toggle back to regular scenario
      store.toggleScenarioOutline()
      expect(store.scenarios[0]?.examples).toBeUndefined()
    })
  })
})
