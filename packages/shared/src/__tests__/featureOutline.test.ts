import { describe, it, expect } from 'vitest'
import { parseFeatureOutline } from '../search/featureOutline'

const FEATURE = `@auth @smoke
Feature: User login
  As a user I want to log in

  Background:
    Given I am on the "/login" page

  @happy-path
  Scenario: Successful login
    When I fill "user" with "admin"
    Then I should see "Welcome"

  @edge @slow
  Scenario Outline: Login with <role>
    When I fill "role" with "<role>"
    Examples:
      | role  |
      | admin |
      | guest |
`

describe('parseFeatureOutline', () => {
  it('extracts the feature name and feature-level tags', () => {
    const outline = parseFeatureOutline(FEATURE)
    expect(outline.name).toBe('User login')
    expect(outline.tags).toEqual(['auth', 'smoke'])
  })

  it('strips the leading @ from tags', () => {
    expect(parseFeatureOutline('@a @b\nFeature: X').tags).toEqual(['a', 'b'])
  })

  it('extracts scenarios with their own tags', () => {
    const { scenarios } = parseFeatureOutline(FEATURE)
    expect(scenarios).toHaveLength(2)
    expect(scenarios[0]).toMatchObject({
      name: 'Successful login',
      tags: ['happy-path'],
      isOutline: false,
    })
    expect(scenarios[1]).toMatchObject({
      name: 'Login with <role>',
      tags: ['edge', 'slow'],
      isOutline: true,
    })
  })

  it('does not leak feature-level tags onto scenarios', () => {
    const { scenarios } = parseFeatureOutline(FEATURE)
    expect(scenarios[0]!.tags).not.toContain('auth')
  })

  it('does not treat Background as a scenario', () => {
    const { scenarios } = parseFeatureOutline(FEATURE)
    expect(scenarios.map((s) => s.name)).not.toContain('')
    expect(scenarios).toHaveLength(2)
  })

  it('does not index Examples rows as scenarios', () => {
    const { scenarios } = parseFeatureOutline(FEATURE)
    expect(scenarios).toHaveLength(2)
    expect(scenarios.some((s) => s.name.includes('admin'))).toBe(false)
  })

  it('reports no parse errors for a well-formed file', () => {
    expect(parseFeatureOutline(FEATURE).hasParseErrors).toBe(false)
  })

  it('handles a scenario with an empty name', () => {
    const { scenarios } = parseFeatureOutline('Feature: X\n  @t\n  Scenario:\n    Given a step')
    expect(scenarios).toHaveLength(1)
    expect(scenarios[0]!.name).toBe('')
    expect(scenarios[0]!.tags).toEqual(['t'])
  })

  it('handles a file with no Feature: line', () => {
    const outline = parseFeatureOutline('Scenario: Orphan\n  Given a step')
    expect(outline.name).toBe('')
    expect(outline.scenarios).toHaveLength(1)
  })

  it('handles an empty file without throwing', () => {
    const outline = parseFeatureOutline('')
    expect(outline.name).toBe('')
    expect(outline.scenarios).toEqual([])
  })

  it('never throws on malformed input and flags parse errors', () => {
    const malformed = '@@@\nFeature\n  Scenario\n    ???\n|||broken'
    expect(() => parseFeatureOutline(malformed)).not.toThrow()
    expect(parseFeatureOutline(malformed).hasParseErrors).toBe(true)
  })

  it('ignores comment lines', () => {
    const outline = parseFeatureOutline('# a comment\nFeature: X\n  Scenario: Y')
    expect(outline.name).toBe('X')
    expect(outline.hasParseErrors).toBe(false)
  })

  it('tolerates CRLF line endings', () => {
    const outline = parseFeatureOutline('@t\r\nFeature: X\r\n  Scenario: Y\r\n')
    expect(outline.name).toBe('X')
    expect(outline.tags).toEqual(['t'])
    expect(outline.scenarios[0]!.name).toBe('Y')
  })

  it('supports multiple tags on separate lines above a scenario', () => {
    const outline = parseFeatureOutline('Feature: X\n  @a\n  @b\n  Scenario: Y')
    expect(outline.scenarios[0]!.tags).toEqual(['a', 'b'])
  })
})
