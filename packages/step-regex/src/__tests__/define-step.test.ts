import { describe, it, expect } from 'vitest'
import { step, str, int, oneOf, cols, opt, defineStep, getStepMetadata, getStepFragments } from '../index'

describe('fragment metadata (US4)', () => {
  it('attaches structured meta to capturing helpers', () => {
    expect(str('field').meta).toEqual({ kind: 'string', name: 'field', captures: true })
    expect(int().meta).toEqual({ kind: 'int', name: undefined, captures: true })
    expect(oneOf(['a', 'b']).meta).toEqual({ kind: 'enum', enumValues: ['a', 'b'], captures: true })
    expect(cols(['A', 'B']).meta).toEqual({ kind: 'table', tableColumns: ['A', 'B'], captures: true })
    expect(opt('s').meta).toEqual({ kind: 'optional', captures: false })
  })

  it('keeps step`` a plain string primitive', () => {
    const pattern = step`I fill ${str('field')} with ${str('value')}`
    expect(typeof pattern).toBe('string')
    expect(pattern).toBe('I fill {string:field} with {string:value}')
  })

  it('records the fragments that built a step`` pattern', () => {
    const pattern = step`I wait for ${int('seconds')} seconds`
    const fragments = getStepFragments(pattern)
    expect(fragments).toEqual([{ kind: 'int', name: 'seconds', captures: true }])
  })
})

describe('defineStep (US4)', () => {
  const fillFieldStep = defineStep({
    pattern: step`I fill ${str('field')} with ${str('value')}`,
    title: 'Fill a form field',
    description: 'Fills a visible form field with a value.',
    category: 'Form',
    tags: ['form', 'input'],
    parameters: {
      field: { label: 'Field', example: 'Email' },
      value: { label: 'Value', example: 'john@example.com' },
    },
  })

  it('returns a string-assignable pattern usable in Given/When/Then', () => {
    const asString: string = fillFieldStep
    expect(typeof asString).toBe('string')
    expect(fillFieldStep).toBe('I fill {string:field} with {string:value}')
  })

  it('registers retrievable metadata', () => {
    const meta = getStepMetadata(fillFieldStep)
    expect(meta?.title).toBe('Fill a form field')
    expect(meta?.category).toBe('Form')
    expect(meta?.tags).toEqual(['form', 'input'])
    expect(meta?.parameters?.field?.label).toBe('Field')
  })
})
