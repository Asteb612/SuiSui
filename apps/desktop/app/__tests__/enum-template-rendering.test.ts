import { describe, it, expect } from 'vitest'
import { parseSegments } from '@suisui/shared'
import type { ScenarioStep } from '@suisui/shared'

describe('Enum Template Rendering - ScenarioBuilder condition check', () => {
  /**
   * This test validates the specific condition used in ScenarioBuilder.vue line 776:
   * v-else-if="segment.arg && segment.arg.type === 'enum' && segment.arg.enumValues"
   */
  
  const enumPattern = '^I am logged in as (manager|internal seller|external seller|client|broker)$'
  
  it('PASS: step with full enum args - Select SHOULD render', () => {
    const step: ScenarioStep = {
      id: 'step-1',
      keyword: 'Given',
      pattern: enumPattern,
      args: [
        {
          name: 'arg0',
          type: 'enum',
          value: 'manager',
          enumValues: ['manager', 'internal seller', 'external seller', 'client', 'broker']
        }
      ]
    }
    
    const segments = parseSegments(step.pattern, step.args)
    const enumSegment = segments.find(s => s.type === 'arg')
    
    // Template condition: segment.arg && segment.arg.type === 'enum' && segment.arg.enumValues
    expect(enumSegment?.arg).toBeDefined()
    expect(enumSegment?.arg?.type).toBe('enum')
    expect(enumSegment?.arg?.enumValues).toBeTruthy()
    expect(Array.isArray(enumSegment?.arg?.enumValues)).toBe(true)
    expect(enumSegment?.arg?.enumValues?.length).toBeGreaterThan(0)
    
    console.log('✅ Select WILL render - all conditions met')
  })
  
  it('FAIL CASE: step with enum type but NO enumValues - Select will NOT render', () => {
    const step: ScenarioStep = {
      id: 'step-1',
      keyword: 'Given',
      pattern: enumPattern,
      args: [
        {
          name: 'arg0',
          type: 'enum',
          value: 'manager'
          // Missing enumValues!
        }
      ]
    }
    
    console.log('Testing problematic step (args missing enumValues):', JSON.stringify(step.args, null, 2))
    
    const segments = parseSegments(step.pattern, step.args)
    console.log('Segments after parseSegments:', JSON.stringify(segments, null, 2))
    
    const enumSegment = segments.find(s => s.type === 'arg')
    
    // The key question: does parseSegments populate enumValues?
    expect(enumSegment?.arg).toBeDefined()
    expect(enumSegment?.arg?.type).toBe('enum')
    
    // THIS IS THE FIX: parseSegments extracts enumValues from pattern
    expect(enumSegment?.arg?.enumValues).toBeTruthy()
    expect(enumSegment?.arg?.enumValues).toEqual([
      'manager', 'internal seller', 'external seller', 'client', 'broker'
    ])
    
    console.log('✅ Select WILL render - parseSegments extracted enumValues from pattern')
  })
  
  it('FAIL CASE: step with empty enumValues array', () => {
    const step: ScenarioStep = {
      id: 'step-1',
      keyword: 'Given',
      pattern: enumPattern,
      args: [
        {
          name: 'arg0',
          type: 'enum',
          value: 'manager',
          enumValues: [] // Empty array!
        }
      ]
    }
    
    const segments = parseSegments(step.pattern, step.args)
    const enumSegment = segments.find(s => s.type === 'arg')
    
    // parseSegments should use pattern to extract values
    expect(enumSegment?.arg?.enumValues).toBeTruthy()
    expect(enumSegment?.arg?.enumValues).toEqual([
      'manager', 'internal seller', 'external seller', 'client', 'broker'
    ])
    
    console.log('✅ Select WILL render - parseSegments overwrote empty array with pattern values')
  })
  
  it('Edge case: pattern has anchors', () => {
    // Test that parseSegments handles patterns with anchors correctly
    const patterns = [
      '^I am logged in as (admin|user)$',
      'I am logged in as (admin|user)',
      '^I am logged in as (admin|user)',
      'I am logged in as (admin|user)$'
    ]
    
    patterns.forEach(pattern => {
      const step: ScenarioStep = {
        id: 'step-1',
        keyword: 'Given',
        pattern,
        args: []
      }
      
      const segments = parseSegments(step.pattern, step.args)
      const enumSegment = segments.find(s => s.type === 'arg')
      
      expect(enumSegment?.arg?.enumValues).toEqual(['admin', 'user'])
      console.log(`✅ Pattern "${pattern}" correctly extracted enumValues`)
    })
  })
  
  it('Edge case: multiple enum args in same pattern', () => {
    const pattern = '(admin|user) performs (create|delete|update) action'
    const step: ScenarioStep = {
      id: 'step-1',
      keyword: 'When',
      pattern,
      args: []
    }
    
    const segments = parseSegments(step.pattern, step.args)
    const enumSegments = segments.filter(s => s.type === 'arg' && s.arg?.type === 'enum')
    
    expect(enumSegments).toHaveLength(2)
    expect(enumSegments[0]?.arg?.enumValues).toEqual(['admin', 'user'])
    expect(enumSegments[1]?.arg?.enumValues).toEqual(['create', 'delete', 'update'])
    
    console.log('✅ Multiple enums correctly extracted')
  })
  
  it('Real-world case: step from bddgen vs step from Gherkin', () => {
    console.log('\n=== Scenario: Steps Panel (from bddgen) ===')
    const stepFromBddgen: ScenarioStep = {
      id: 'step-1',
      keyword: 'Given',
      pattern: enumPattern,
      args: [
        {
          name: 'arg0',
          type: 'enum',
          value: '',
          enumValues: ['manager', 'internal seller', 'external seller', 'client', 'broker']
        }
      ]
    }
    
    const segments1 = parseSegments(stepFromBddgen.pattern, stepFromBddgen.args)
    const enumSegment1 = segments1.find(s => s.type === 'arg')
    
    expect(enumSegment1?.arg?.enumValues).toHaveLength(5)
    console.log('✅ Steps Panel: enum Select will render correctly')
    
    console.log('\n=== Scenario: Scenario Builder (loaded from Gherkin with matchStep) ===')
    const stepFromGherkin: ScenarioStep = {
      id: 'step-2',
      keyword: 'Given',
      pattern: enumPattern,
      args: [
        {
          name: 'arg0',
          type: 'enum',
          value: 'manager',
          enumValues: ['manager', 'internal seller', 'external seller', 'client', 'broker']
        }
      ]
    }
    
    const segments2 = parseSegments(stepFromGherkin.pattern, stepFromGherkin.args)
    const enumSegment2 = segments2.find(s => s.type === 'arg')
    
    expect(enumSegment2?.arg?.enumValues).toHaveLength(5)
    console.log('✅ Scenario Builder: enum Select will render correctly')
    
    console.log('\n=== Both should behave identically ===')
    expect(enumSegment1?.arg?.enumValues).toEqual(enumSegment2?.arg?.enumValues)
  })
})
