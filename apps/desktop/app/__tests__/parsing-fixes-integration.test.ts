import { describe, it, expect } from 'vitest'
import { parseSegments } from '@suisui/shared'
import type { ScenarioStep } from '@suisui/shared'

describe('Parsing Fixes - Complete Integration', () => {
  it('Complete Scenario Outline with background enum and placeholders', () => {
    console.log('\n=== Complete Feature Test ===')
    console.log('Feature: Login and Dashboard')
    console.log('Background: I am logged in as (manager|seller|client)')
    console.log('Scenario Outline: View dashboard')
    console.log('  Given I am on the <page> page')
    console.log('  When I click on {string}')
    console.log('  Then I should see <expected>')
    console.log('')
    
    // Background step with enum
    const backgroundStep: ScenarioStep = {
      id: 'bg-1',
      keyword: 'Given',
      pattern: '^I am logged in as (manager|seller|client)$',
      args: [
        {
          name: 'arg0',
          type: 'enum',
          value: 'manager',
          enumValues: [] // Empty! Should extract from pattern
        }
      ]
    }
    
    const bgSegments = parseSegments(backgroundStep.pattern, backgroundStep.args)
    const bgEnumSegment = bgSegments.find(s => s.type === 'arg')
    
    expect(bgEnumSegment?.arg?.type).toBe('enum')
    expect(bgEnumSegment?.arg?.enumValues).toEqual(['manager', 'seller', 'client'])
    console.log('✅ Background enum: extracted from pattern')
    
    // Scenario Outline steps with placeholders
    const outlineSteps: ScenarioStep[] = [
      {
        id: 'step-1',
        keyword: 'Given',
        pattern: 'I am on the <page> page',
        args: [{ name: 'page', type: 'string', value: '' }]
      },
      {
        id: 'step-2',
        keyword: 'When',
        pattern: 'I click on {string}',
        args: [{ name: 'arg0', type: 'string', value: 'dashboard' }]
      },
      {
        id: 'step-3',
        keyword: 'Then',
        pattern: 'I should see <expected>',
        args: [{ name: 'expected', type: 'string', value: '' }]
      }
    ]
    
    // Test each step
    const segments1 = parseSegments(outlineSteps[0]!.pattern, outlineSteps[0]!.args)
    const placeholder1 = segments1.find(s => s.type === 'arg')
    expect(placeholder1?.arg?.name).toBe('page')
    console.log('✅ Step 1: <page> placeholder parsed')
    
    const segments2 = parseSegments(outlineSteps[1]!.pattern, outlineSteps[1]!.args)
    const cucumber = segments2.find(s => s.type === 'arg')
    expect(cucumber?.arg?.type).toBe('string')
    console.log('✅ Step 2: {string} cucumber expression parsed')
    
    const segments3 = parseSegments(outlineSteps[2]!.pattern, outlineSteps[2]!.args)
    const placeholder2 = segments3.find(s => s.type === 'arg')
    expect(placeholder2?.arg?.name).toBe('expected')
    console.log('✅ Step 3: <expected> placeholder parsed')
    
    console.log('\n🎉 All three parsing features working together!')
  })

  it('All argument types render correctly in edit mode', () => {
    const argumentTypes = [
      { name: 'Cucumber string', pattern: 'I fill {string}', expectedType: 'string' },
      { name: 'Cucumber int', pattern: 'I wait {int} seconds', expectedType: 'int' },
      { name: 'Enum pattern', pattern: 'I am (admin|user)', expectedType: 'enum' },
      { name: 'Outline placeholder', pattern: 'I see <result>', expectedType: 'string' },
    ]
    
    argumentTypes.forEach(({ name, pattern, expectedType }) => {
      const step: ScenarioStep = {
        id: 'test',
        keyword: 'Given',
        pattern,
        args: []
      }
      
      const segments = parseSegments(step.pattern, step.args)
      const argSegment = segments.find(s => s.type === 'arg')
      
      expect(argSegment).toBeDefined()
      expect(argSegment?.arg?.type).toBe(expectedType)
      
      console.log(`✅ ${name}: ${pattern} → ${expectedType}`)
    })
    
    // Note: Table args (pattern ending with ':') are handled separately
    // They're not inline-editable like other args
  })

  it('parseSegments handles all supported patterns in order of appearance', () => {
    // Real-world complex scenario
    const step: ScenarioStep = {
      id: 'complex',
      keyword: 'When',
      pattern: '<user_type> fills <field_name> with {string} and selects (option1|option2)',
      args: [
        { name: 'user_type', type: 'string', value: 'admin' },
        { name: 'field_name', type: 'string', value: 'email' },
        { name: 'arg0', type: 'string', value: 'test@example.com' },
        { name: 'arg1', type: 'enum', value: 'option1', enumValues: ['option1', 'option2'] }
      ]
    }
    
    const segments = parseSegments(step.pattern, step.args)
    const argSegments = segments.filter(s => s.type === 'arg')
    
    console.log('\nPattern:', step.pattern)
    console.log('Parsed segments:', argSegments.length)
    
    // Should have 4 args in order
    expect(argSegments.length).toBe(4)
    expect(argSegments[0]?.arg?.name).toBe('user_type') // <user_type>
    expect(argSegments[1]?.arg?.name).toBe('field_name') // <field_name>
    expect(argSegments[2]?.arg?.type).toBe('string') // {string}
    expect(argSegments[3]?.arg?.type).toBe('enum') // (option1|option2)
    
    console.log('Arg 1: <user_type> →', argSegments[0]?.arg?.name)
    console.log('Arg 2: <field_name> →', argSegments[1]?.arg?.name)
    console.log('Arg 3: {string} →', argSegments[2]?.arg?.type)
    console.log('Arg 4: (option1|option2) →', argSegments[3]?.arg?.type, 'with', argSegments[3]?.arg?.enumValues?.length, 'options')
    console.log('✅ All 4 argument types in correct order!')
  })
})
