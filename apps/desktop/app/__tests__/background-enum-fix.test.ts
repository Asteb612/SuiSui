import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useScenarioStore } from '~/stores/scenario'
import { parseSegments } from '@suisui/shared'
import type { StepDefinition } from '@suisui/shared'

describe('Background Steps - Enum Args Fix', () => {
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

  it('should extract enumValues from background step pattern', () => {
    const scenarioStore = useScenarioStore()
    
    scenarioStore.createNew('Test Feature')
    
    // Add background step with enum pattern
    scenarioStore.addBackgroundStep(
      enumStepDef.keyword,
      enumStepDef.pattern,
      enumStepDef.args
    )
    
    const backgroundStep = scenarioStore.background[0]!
    
    console.log('Background step:', JSON.stringify(backgroundStep, null, 2))
    
    // Verify the step has enumValues
    expect(backgroundStep.args[0]?.type).toBe('enum')
    expect(backgroundStep.args[0]?.enumValues).toEqual([
      'manager', 'internal seller', 'external seller', 'client', 'broker'
    ])
    
    // Verify parseSegments works correctly for background steps
    const argsWithValue = backgroundStep.args.map(arg => ({ ...arg, value: arg.value || '', type: arg.type as string }))
    const segments = parseSegments(backgroundStep.pattern, argsWithValue)
    
    console.log('Segments:', JSON.stringify(segments, null, 2))
    
    const enumSegment = segments.find(s => s.type === 'arg' && s.arg?.type === 'enum')
    
    expect(enumSegment).toBeDefined()
    expect(enumSegment?.arg?.enumValues).toEqual([
      'manager', 'internal seller', 'external seller', 'client', 'broker'
    ])
    
    console.log('✅ Background step enum Select will render correctly')
  })

  it('should handle background step with empty enumValues array', () => {
    const scenarioStore = useScenarioStore()
    
    scenarioStore.createNew('Test Feature')
    
    // Add background step with args that have empty enumValues
    scenarioStore.addBackgroundStep(
      'Given',
      enumStepDef.pattern,
      [{
        name: 'arg0',
        type: 'enum',
        required: true,
        enumValues: [] // Empty!
      }]
    )
    
    const backgroundStep = scenarioStore.background[0]!
    
    // parseSegments should extract enumValues from pattern even when args has empty array
    const argsWithValue = backgroundStep.args.map(arg => ({ ...arg, value: arg.value || '', type: arg.type as string }))
    const segments = parseSegments(backgroundStep.pattern, argsWithValue)
    
    const enumSegment = segments.find(s => s.type === 'arg' && s.arg?.type === 'enum')
    
    expect(enumSegment).toBeDefined()
    expect(enumSegment?.arg?.enumValues).toEqual([
      'manager', 'internal seller', 'external seller', 'client', 'broker'
    ])
    
    console.log('✅ Background step with empty enumValues fixed by parseSegments')
  })

  it('should update background step enum arg value', () => {
    const scenarioStore = useScenarioStore()
    
    scenarioStore.createNew('Test Feature')
    
    scenarioStore.addBackgroundStep(
      enumStepDef.keyword,
      enumStepDef.pattern,
      enumStepDef.args
    )
    
    const backgroundStep = scenarioStore.background[0]!
    const initialValue = backgroundStep.args[0]?.value || ''
    
    console.log('Initial value:', initialValue)
    
    // Update the enum arg value (simulating user selecting from dropdown)
    scenarioStore.updateBackgroundStepArg(
      backgroundStep.id,
      'arg0',
      'internal seller',
      'enum',
      enumStepDef.args[0]?.enumValues
    )
    
    const updatedStep = scenarioStore.background[0]!
    const updatedValue = updatedStep.args[0]?.value
    
    console.log('Updated value:', updatedValue)
    
    expect(updatedValue).toBe('internal seller')
    expect(updatedStep.args[0]?.enumValues).toEqual([
      'manager', 'internal seller', 'external seller', 'client', 'broker'
    ])
    
    console.log('✅ Background step enum value updated successfully')
  })

  it('should load background steps from Gherkin with enum values preserved', () => {
    const scenarioStore = useScenarioStore()
    
    const gherkinContent = `Feature: Login Test

  Background:
    Given I am logged in as manager

  Scenario: Check dashboard
    When I navigate to dashboard
    Then I should see admin panel`
    
    // Parse with step definitions available
    scenarioStore.parseGherkin(gherkinContent, [enumStepDef])
    
    const backgroundStep = scenarioStore.background[0]!
    
    console.log('Loaded background step:', JSON.stringify(backgroundStep, null, 2))
    
    expect(backgroundStep).toBeDefined()
    expect(backgroundStep.pattern).toBe(enumStepDef.pattern)
    expect(backgroundStep.args[0]?.type).toBe('enum')
    expect(backgroundStep.args[0]?.value).toBe('manager')
    expect(backgroundStep.args[0]?.enumValues).toEqual([
      'manager', 'internal seller', 'external seller', 'client', 'broker'
    ])
    
    // Verify parseSegments works
    const argsWithValue = backgroundStep.args.map(arg => ({ ...arg, value: arg.value || '', type: arg.type as string }))
    const segments = parseSegments(backgroundStep.pattern, argsWithValue)
    const enumSegment = segments.find(s => s.type === 'arg' && s.arg?.type === 'enum')
    
    expect(enumSegment?.arg?.enumValues).toEqual([
      'manager', 'internal seller', 'external seller', 'client', 'broker'
    ])
    
    console.log('✅ Background step from Gherkin has enum values')
  })
})
