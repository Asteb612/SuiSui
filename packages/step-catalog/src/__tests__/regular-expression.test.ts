import { describe, it, expect } from 'vitest'
import { extractCaptureGroups, parseRegexParameters } from '../parsers/regular-expression'
import { deriveParameters } from '../adapters/pattern-analyzer'
import type { RawPattern } from '../internal-types'

const regexp = (source: string, flags = ''): RawPattern => ({
  kind: 'regexp',
  source,
  flags,
  dynamic: false,
})

describe('regular-expression parser (US2)', () => {
  it('extracts capturing groups in order, skipping non-capturing and lookarounds', () => {
    const groups = extractCaptureGroups('^(a)(?:b)(?=c)(d)$')
    expect(groups.map((g) => g.content)).toEqual(['a', 'd'])
  })

  it('recovers named groups', () => {
    const groups = extractCaptureGroups('^(?<role>admin|user)$')
    expect(groups[0]?.name).toBe('role')
    expect(groups[0]?.content).toBe('admin|user')
  })

  it('classifies literal alternations as enums', () => {
    const { parameters } = parseRegexParameters('^I select (admin|user)$')
    expect(parameters[0]?.type).toBe('enum')
    expect(parameters[0]?.enumValues).toEqual(['admin', 'user'])
  })

  it('treats an anonymous non-enum group as a string and reports inferred names', () => {
    const { parameters, diagnostics } = parseRegexParameters('^I see "([^"]+)"$')
    expect(parameters[0]?.type).toBe('string')
    expect(parameters[0]?.precision).toBe('partial')
    expect(diagnostics.some((d) => d.code === 'UNSUPPORTED_REGEX_GROUP')).toBe(true)
  })

  it('parses a mixed regex (enum + string) via deriveParameters', () => {
    const { parameters } = deriveParameters(regexp('^the user sees (success|error) message "([^"]+)"$'))
    expect(parameters.map((p) => p.type)).toEqual(['enum', 'string'])
    expect(parameters[0]?.enumValues).toEqual(['success', 'error'])
  })

  it('reports a parameter/callback count mismatch for regex', () => {
    const { diagnostics } = deriveParameters(regexp('^(a)(b)$'), {
      callbackParamNames: ['only'],
      hasCallback: true,
    })
    expect(diagnostics.some((d) => d.code === 'PARAMETER_COUNT_MISMATCH')).toBe(true)
  })
})
