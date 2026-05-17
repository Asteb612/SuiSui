import { describe, it, expect } from 'vitest'
import {
  cucumberArg,
  enumPattern,
  tableSuffix,
  optional,
  alternatives,
  buildStepPattern,
} from '../builders'

describe('cucumberArg', () => {
  it('builds unnamed expressions', () => {
    expect(cucumberArg('string')).toBe('{string}')
    expect(cucumberArg('int')).toBe('{int}')
  })

  it('builds named expressions', () => {
    expect(cucumberArg('string', 'email')).toBe('{string:email}')
  })
})

describe('enumPattern', () => {
  it('joins values with a pipe inside parens', () => {
    expect(enumPattern(['admin', 'user', 'guest'])).toBe('(admin|user|guest)')
  })

  it('trims values', () => {
    expect(enumPattern([' a ', ' b '])).toBe('(a|b)')
  })

  it('throws with fewer than 2 values', () => {
    expect(() => enumPattern(['only'])).toThrow(/at least 2/)
  })
})

describe('tableSuffix', () => {
  it('builds a trailing DataTable suffix', () => {
    expect(tableSuffix(['Field', 'Value'])).toBe('(Field, Value):')
  })

  it('throws with fewer than 2 columns', () => {
    expect(() => tableSuffix(['one'])).toThrow(/at least 2/)
  })
})

describe('optional / alternatives', () => {
  it('wraps optional text in parens', () => {
    expect(optional('s')).toBe('(s)')
  })

  it('joins alternatives with a slash', () => {
    expect(alternatives(['belly', 'stomach'])).toBe('belly/stomach')
  })
})

describe('buildStepPattern', () => {
  it('joins and normalizes whitespace', () => {
    expect(
      buildStepPattern('I log in as', enumPattern(['admin', 'user'])),
    ).toBe('I log in as (admin|user)')
  })
})
