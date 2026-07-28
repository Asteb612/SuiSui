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

// --- Line positions (feature 010) -------------------------------------------
// Bulk tag editing splices individual lines, so it needs to know exactly which
// line to touch. These fields are additive and optional; search ignores them.

describe('parseFeatureOutline — line positions', () => {
  const POSITIONED = [
    '@auth @smoke', // 0
    'Feature: Login', // 1
    '', // 2
    '  Background:', // 3
    '    Given a step', // 4
    '', // 5
    '  @happy', // 6
    '  Scenario: With tags', // 7
    '    Given a step', // 8
    '', // 9
    '  Scenario: Without tags', // 10
    '    Given a step', // 11
  ].join('\n')

  it('records the feature tag line', () => {
    expect(parseFeatureOutline(POSITIONED).featureTagLine).toBe(0)
  })

  it('omits featureTagLine when the feature has no tags', () => {
    expect(parseFeatureOutline('Feature: X\n  Scenario: Y').featureTagLine).toBeUndefined()
  })

  it('records the line of each scenario keyword', () => {
    const { scenarios } = parseFeatureOutline(POSITIONED)
    expect(scenarios[0]!.line).toBe(7)
    expect(scenarios[1]!.line).toBe(10)
  })

  it('records the tag line of a tagged scenario', () => {
    expect(parseFeatureOutline(POSITIONED).scenarios[0]!.tagLine).toBe(6)
  })

  it('omits tagLine for a scenario with no tags — the splicer must INSERT there', () => {
    expect(parseFeatureOutline(POSITIONED).scenarios[1]!.tagLine).toBeUndefined()
  })

  it('records positions for a Scenario Outline', () => {
    const outline = parseFeatureOutline('@t\nFeature: F\n  @s\n  Scenario Outline: O\n    Given a step')
    expect(outline.scenarios[0]).toMatchObject({ line: 3, tagLine: 2, isOutline: true })
  })

  it('counts lines correctly with CRLF endings', () => {
    const outline = parseFeatureOutline('@t\r\nFeature: F\r\n  @s\r\n  Scenario: S\r\n')
    expect(outline.featureTagLine).toBe(0)
    expect(outline.scenarios[0]).toMatchObject({ line: 3, tagLine: 2 })
  })

  it('handles several tag lines above one scenario by recording the FIRST', () => {
    // A splice must not orphan the earlier lines, so removal targets the block start.
    const outline = parseFeatureOutline('Feature: F\n  @a\n  @b\n  Scenario: S')
    expect(outline.scenarios[0]!.tagLine).toBe(1)
    expect(outline.scenarios[0]!.tags).toEqual(['a', 'b'])
  })

  it('does not attach a Background tag line to the following scenario', () => {
    const outline = parseFeatureOutline('Feature: F\n  Background:\n    Given a step\n  Scenario: S')
    expect(outline.scenarios[0]!.tagLine).toBeUndefined()
    expect(outline.scenarios[0]!.line).toBe(3)
  })

  it('keeps blank and comment lines in the index count', () => {
    const outline = parseFeatureOutline('# c\n\nFeature: F\n\n  Scenario: S')
    expect(outline.scenarios[0]!.line).toBe(4)
  })
})
