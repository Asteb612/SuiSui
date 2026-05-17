import { describe, it, expect } from 'vitest'
import {
  step,
  str,
  int,
  oneOf,
  opt,
  cols,
  alt,
  bindSteps,
} from '../step'
import { patternToRegex } from '../regex'

describe('step tagged template', () => {
  it('assembles a plain pattern string from literals + fragments', () => {
    const p = step`I log in as ${oneOf(['admin', 'user', 'guest'])}`
    expect(p).toBe('I log in as (admin|user|guest)')
  })

  it('normalizes whitespace', () => {
    const p = step`I   wait  for ${int()}    seconds`
    expect(p).toBe('I wait for {int} seconds')
  })

  it('supports named cucumber args', () => {
    const p = step`I fill ${str('field')} with ${str('value')}`
    expect(p).toBe('I fill {string:field} with {string:value}')
  })

  it('supports optional and alternative non-capturing fragments', () => {
    expect(step`I wait for ${int()} second${opt('s')}`).toBe(
      'I wait for {int} second(s)',
    )
    expect(step`I have a ${alt(['belly', 'stomach'])} ache`).toBe(
      'I have a belly/stomach ache',
    )
  })

  it('supports a trailing DataTable suffix', () => {
    expect(step`I submit ${cols(['Field', 'Value'])}`).toBe(
      'I submit (Field, Value):',
    )
  })

  it('round-trips through patternToRegex', () => {
    const role = step`I log in as ${oneOf(['admin', 'user', 'guest'])}`
    const wait = step`I wait for ${int()} second${opt('s')}`
    const fill = step`I fill ${str('field')} with ${str('value')}`

    expect(patternToRegex(role).test('I log in as admin')).toBe(true)
    expect(patternToRegex(role).test('I log in as root')).toBe(false)
    expect(patternToRegex(wait).test('I wait for 5 seconds')).toBe(true)
    expect(patternToRegex(wait).test('I wait for 1 second')).toBe(true)
    expect(
      patternToRegex(fill).test('I fill "email" with "a@b.co"'),
    ).toBe(true)
  })

  it('result is usable as a plain string', () => {
    const p: string = step`I see ${int()} items`
    expect(typeof p).toBe('string')
    expect(p).toBe('I see {int} items')
  })
})

describe('bindSteps', () => {
  it('is the identity at runtime (only re-types)', () => {
    const Given = (_p: string, _cb: (...a: unknown[]) => unknown) => 'ok'
    const trio = { Given }
    const bound = bindSteps(trio)
    expect(bound.Given).toBe(Given)
    expect(bound.Given('x', () => undefined)).toBe('ok')

    const single = bindSteps(Given)
    expect(single).toBe(Given)
  })
})
