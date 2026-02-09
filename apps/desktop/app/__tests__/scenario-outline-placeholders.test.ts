import { describe, it, expect } from 'vitest'
import { parseSegments, findBestMatch } from '@suisui/shared'
import type { ScenarioStep } from '@suisui/shared'

describe('Scenario Outline Placeholders - <variable> format', () => {
  it('findBestMatch extracts <placeholder> from step text', () => {
    const result = findBestMatch('I login as <role>', 'Given', [])
    
    console.log('findBestMatch result:', JSON.stringify(result, null, 2))
    
    // fallback should extract placeholder args
    expect(result.args.length).toBeGreaterThan(0)
    expect(result.args.find(a => a.name === 'role')).toBeDefined()
  })

  it('FIXED: parseSegments NOW handles <placeholder> format', () => {
    const step: ScenarioStep = {
      id: 'step-1',
      keyword: 'Given',
      pattern: 'I login as <role>',
      args: [
        {
          name: 'role',
          type: 'string',
          value: ''
        }
      ]
    }
    
    const segments = parseSegments(step.pattern, step.args)
    console.log('Segments:', JSON.stringify(segments, null, 2))
    
    // Should now recognize <role> as a placeholder argument!
    const argSegment = segments.find(s => s.type === 'arg')
    
    console.log('Has arg segment?', !!argSegment)
    console.log('✅ FIXED - <role> is now parsed as an argument!')
    
    expect(argSegment).toBeDefined()
    expect(argSegment?.arg?.name).toBe('role')
    expect(argSegment?.arg?.type).toBe('string')
  })

  it('parseSegments should handle multiple <placeholder>s', () => {
    const step: ScenarioStep = {
      id: 'step-1',
      keyword: 'Given',
      pattern: 'I fill <field> with <value>',
      args: [
        {
          name: 'field',
          type: 'string',
          value: 'email'
        },
        {
          name: 'value',
          type: 'string',
          value: 'test@test.com'
        }
      ]
    }
    
    const segments = parseSegments(step.pattern, step.args)
    console.log('Multiple placeholders:', JSON.stringify(segments, null, 2))
    
    // Should have arg segments for <field> and <value>
    const argSegments = segments.filter(s => s.type === 'arg')
    
    console.log('Number of arg segments:', argSegments.length)
    console.log('✅ FIXED - Both placeholders parsed as arguments!')
    
    expect(argSegments.length).toBe(2)
    expect(argSegments[0]?.arg?.name).toBe('field')
    expect(argSegments[0]?.arg?.value).toBe('email')
    expect(argSegments[1]?.arg?.name).toBe('value')
    expect(argSegments[1]?.arg?.value).toBe('test@test.com')
  })

  it('parseSegments extracts placeholder even without existing args', () => {
    // When loading from Gherkin, args might not be populated yet
    const step: ScenarioStep = {
      id: 'step-1',
      keyword: 'Given',
      pattern: 'I login as <role>',
      args: []
    }
    
    const segments = parseSegments(step.pattern, step.args)
    console.log('Segments without args:', JSON.stringify(segments, null, 2))
    
    // Should still extract the placeholder
    const argSegment = segments.find(s => s.type === 'arg')
    
    expect(argSegment).toBeDefined()
    expect(argSegment?.arg?.name).toBe('role')
    expect(argSegment?.arg?.type).toBe('string')
    
    console.log('✅ Placeholder extracted even without pre-existing args')
  })

  it('Complex example: mixed placeholders, enums, and cucumber expressions', () => {
    const step: ScenarioStep = {
      id: 'step-1',
      keyword: 'Given',
      pattern: 'user <username> with role (admin|user) fills {string}',
      args: [
        { name: 'username', type: 'string', value: 'john' },
        { name: 'arg0', type: 'enum', value: 'admin', enumValues: ['admin', 'user'] },
        { name: 'arg1', type: 'string', value: 'email' }
      ]
    }
    
    const segments = parseSegments(step.pattern, step.args)
    console.log('Complex pattern segments:', JSON.stringify(segments, null, 2))
    
    // Should have 3 arg segments
    const argSegments = segments.filter(s => s.type === 'arg')
    expect(argSegments.length).toBe(3)
    
    // Verify each type
    expect(argSegments[0]?.arg?.name).toBe('username') // <username> placeholder
    expect(argSegments[1]?.arg?.type).toBe('enum') // (admin|user)
    expect(argSegments[2]?.arg?.type).toBe('string') // {string}
    
    console.log('✅ All three argument types parsed correctly!')
  })
})
