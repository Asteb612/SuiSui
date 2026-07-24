import { describe, it, expect } from 'vitest'
import { deriveParameters } from '../adapters/pattern-analyzer'
import type { RawPattern } from '../internal-types'

const cucumber = (source: string): RawPattern => ({ kind: 'cucumber', source, dynamic: false })

describe('deriveParameters — cucumber patterns (US2)', () => {
  it('parses a named string parameter', () => {
    const { parameters } = deriveParameters(cucumber('I fill {string:field}'))
    expect(parameters).toHaveLength(1)
    expect(parameters[0]).toMatchObject({ name: 'field', type: 'string', required: true })
  })

  it('parses int and float parameters', () => {
    const { parameters } = deriveParameters(cucumber('I wait {int} then {float}'))
    expect(parameters.map((p) => p.type)).toEqual(['int', 'float'])
  })

  it('exposes enum values from an alternation', () => {
    const { parameters } = deriveParameters(cucumber('I log in as (admin|user|guest)'))
    expect(parameters[0]?.type).toBe('enum')
    expect(parameters[0]?.enumValues).toEqual(['admin', 'user', 'guest'])
  })

  it('exposes data-table columns', () => {
    const { parameters } = deriveParameters(cucumber('I submit (Field, Value):'))
    expect(parameters[0]?.type).toBe('table')
    expect(parameters[0]?.tableColumns).toEqual(['Field', 'Value'])
  })

  it('applies exact fragment metadata over pattern inference', () => {
    const { parameters } = deriveParameters(cucumber('I fill {string:field}'), {
      fragments: [{ kind: 'string', name: 'field', captures: true }],
    })
    expect(parameters[0]).toMatchObject({ origin: 'suisui', precision: 'exact' })
  })

  it('adopts callback param names and type annotations', () => {
    const { parameters } = deriveParameters(cucumber('I select (a|b)'), {
      callbackParamNames: ['role'],
      callbackParamTypes: ["'a' | 'b'"],
      hasCallback: true,
    })
    // enum keeps its values; the anonymous name is replaced and typed.
    expect(parameters[0]?.name).toBe('role')
    expect(parameters[0]?.sourceType).toBe("'a' | 'b'")
    expect(parameters[0]?.origin).toBe('typescript')
  })

  it('flags a parameter/callback count mismatch', () => {
    const { diagnostics } = deriveParameters(cucumber('I fill {string} and {string}'), {
      callbackParamNames: ['only'],
      hasCallback: true,
    })
    expect(diagnostics.some((d) => d.code === 'PARAMETER_COUNT_MISMATCH')).toBe(true)
  })
})
