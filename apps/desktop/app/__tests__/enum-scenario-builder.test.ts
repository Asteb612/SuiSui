import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useScenarioStore } from '~/stores/scenario'
import { useStepsStore } from '~/stores/steps'
import { parseSegments } from '@suisui/shared'
import type { StepDefinition } from '@suisui/shared'

describe('Enum Args: Steps Panel vs Scenario Builder', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const enumStepDef: StepDefinition = {
    id: 'login-as-role',
    keyword: 'Given',
    pattern: '^I am logged in as (manager|internal seller|external seller|client|broker)$',
    args: [
      {
        name: 'arg0',
        type: 'enum',
        required: true,
        enumValues: ['manager', 'internal seller', 'external seller', 'client', 'broker']
      }
    ],
    isGeneric: false,
    location: 'test.steps.ts'
  }

  describe('Steps Panel (StepSelector)', () => {
    it('should show enum step with all enum values', () => {
      const stepsStore = useStepsStore()
      
      // Simulate steps loaded from bddgen export
      stepsStore.steps = [enumStepDef]
      
      // Check the step has enumValues
      const step = stepsStore.steps[0]!
      expect(step.args[0]?.enumValues).toEqual([
        'manager', 'internal seller', 'external seller', 'client', 'broker'
      ])
      
      // Verify parseSegments extracts them correctly for display
      const argsWithValue = step.args.map(arg => ({ ...arg, value: '', type: arg.type as string }))
      const segments = parseSegments(step.pattern, argsWithValue)
      const enumSegment = segments.find(s => s.type === 'arg' && s.arg?.type === 'enum')
      
      expect(enumSegment?.arg?.enumValues).toEqual([
        'manager', 'internal seller', 'external seller', 'client', 'broker'
      ])
    })
  })

  describe('Scenario Builder - Step added from catalog', () => {
    it('should preserve enumValues when adding step from StepSelector', () => {
      const scenarioStore = useScenarioStore()
      scenarioStore.createNew('Test Feature')
      
      // Add step from catalog (StepSelector)
      scenarioStore.addStep(
        enumStepDef.keyword,
        enumStepDef.pattern,
        enumStepDef.args
      )
      
      const addedStep = scenarioStore.scenario.steps[0]!
      
      // Check that enumValues were preserved
      expect(addedStep.args[0]?.enumValues).toEqual([
        'manager', 'internal seller', 'external seller', 'client', 'broker'
      ])
      
      // Verify parseSegments works correctly (convert args to have value)
      const argsWithValue = addedStep.args.map(arg => ({ ...arg, value: arg.value || '' }))
      const segments = parseSegments(addedStep.pattern, argsWithValue)
      const enumSegment = segments.find(s => s.type === 'arg' && s.arg?.type === 'enum')
      
      expect(enumSegment).toBeDefined()
      expect(enumSegment?.arg?.type).toBe('enum')
      expect(enumSegment?.arg?.enumValues).toEqual([
        'manager', 'internal seller', 'external seller', 'client', 'broker'
      ])
    })
  })

  describe('Scenario Builder - Step loaded from Gherkin WITH step definitions', () => {
    it('should have enumValues when loading Gherkin with available step definitions', () => {
      const scenarioStore = useScenarioStore()
      
      const gherkinContent = `Feature: Login Test

  Scenario: Manager logs in
    Given I am logged in as manager
    When I navigate to dashboard
    Then I should see admin panel`
      
      // Parse with step definitions available
      scenarioStore.parseGherkin(gherkinContent, [enumStepDef])
      
      const loadedStep = scenarioStore.scenario.steps[0]!
      
      console.log('Loaded step pattern:', loadedStep.pattern)
      console.log('Loaded step args:', JSON.stringify(loadedStep.args, null, 2))
      
      // Should have matched the enum pattern
      expect(loadedStep.pattern).toBe(enumStepDef.pattern)
      expect(loadedStep.args[0]?.type).toBe('enum')
      expect(loadedStep.args[0]?.value).toBe('manager')
      expect(loadedStep.args[0]?.enumValues).toEqual([
        'manager', 'internal seller', 'external seller', 'client', 'broker'
      ])
      
      // Verify parseSegments works
      const segments = parseSegments(loadedStep.pattern, loadedStep.args)
      const enumSegment = segments.find(s => s.type === 'arg' && s.arg?.type === 'enum')
      
      expect(enumSegment).toBeDefined()
      expect(enumSegment?.arg?.enumValues).toEqual([
        'manager', 'internal seller', 'external seller', 'client', 'broker'
      ])
    })
  })

  describe('Scenario Builder - Step loaded from Gherkin WITHOUT step definitions', () => {
    it('should fallback to simple pattern when no step definitions available', () => {
      const scenarioStore = useScenarioStore()
      
      const gherkinContent = `Feature: Login Test

  Scenario: Manager logs in
    Given I am logged in as manager`
      
      // Parse WITHOUT step definitions (empty array)
      scenarioStore.parseGherkin(gherkinContent, [])
      
      const loadedStep = scenarioStore.scenario.steps[0]!
      
      console.log('Fallback step pattern:', loadedStep.pattern)
      console.log('Fallback step args:', JSON.stringify(loadedStep.args, null, 2))
      
      // Should have created simple pattern
      expect(loadedStep.pattern).toBe('I am logged in as manager')
      expect(loadedStep.args).toHaveLength(0)
      
      // parseSegments won't find enum in this simple pattern
      const segments = parseSegments(loadedStep.pattern, loadedStep.args)
      const enumSegment = segments.find(s => s.type === 'arg' && s.arg?.type === 'enum')
      
      expect(enumSegment).toBeUndefined()
    })

    it('BUG SCENARIO: what if user later manually updates the step pattern?', () => {
      const scenarioStore = useScenarioStore()
      
      // Initial state: loaded from Gherkin without step defs
      scenarioStore.createNew('Test Feature')
      scenarioStore.addStep('Given', 'I am logged in as manager', [])
      
      const step = scenarioStore.scenario.steps[0]!
      console.log('Initial step:', JSON.stringify({ pattern: step.pattern, args: step.args }, null, 2))
      
      // User exports steps and now wants to use the proper enum pattern
      // They might use "Edit Step" dialog to change the pattern
      scenarioStore.replaceStep(
        step.id,
        enumStepDef.keyword,
        enumStepDef.pattern,
        enumStepDef.args
      )
      
      const updatedStep = scenarioStore.scenario.steps[0]!
      console.log('Updated step:', JSON.stringify({ pattern: updatedStep.pattern, args: updatedStep.args }, null, 2))
      
      // Should now have enumValues
      expect(updatedStep.pattern).toBe(enumStepDef.pattern)
      expect(updatedStep.args[0]?.enumValues).toEqual([
        'manager', 'internal seller', 'external seller', 'client', 'broker'
      ])
      
      // parseSegments should work
      const segments = parseSegments(updatedStep.pattern, updatedStep.args)
      const enumSegment = segments.find(s => s.type === 'arg' && s.arg?.type === 'enum')
      
      expect(enumSegment).toBeDefined()
      expect(enumSegment?.arg?.enumValues).toEqual([
        'manager', 'internal seller', 'external seller', 'client', 'broker'
      ])
    })
  })

  describe('ACTUAL BUG: parseSegments should extract enumValues from pattern even when args lack them', () => {
    it('should extract enumValues from pattern when step.args is missing them', () => {
      // This simulates a step that was created/loaded incorrectly
      // or from an old version, where args exist but don't have enumValues
      const problematicStep = {
        id: 'step-1',
        keyword: 'Given' as const,
        pattern: '^I am logged in as (manager|internal seller|external seller|client|broker)$',
        args: [
          {
            name: 'arg0',
            type: 'enum' as const,
            value: 'manager'
            // Missing enumValues!
          }
        ]
      }
      
      console.log('Problematic step:', JSON.stringify(problematicStep, null, 2))
      
      // parseSegments should extract enumValues from the pattern
      const segments = parseSegments(problematicStep.pattern, problematicStep.args)
      console.log('Segments:', JSON.stringify(segments, null, 2))
      
      const enumSegment = segments.find(s => s.type === 'arg' && s.arg?.type === 'enum')
      
      expect(enumSegment).toBeDefined()
      expect(enumSegment?.arg?.type).toBe('enum')
      
      // This should pass if parseSegments correctly extracts from pattern
      expect(enumSegment?.arg?.enumValues).toEqual([
        'manager', 'internal seller', 'external seller', 'client', 'broker'
      ])
    })
  })
})
