import { describe, it, expect } from 'vitest'
import { parseFeatureSteps, authoredStepsFor } from '../run-progress/parseFeatureSteps'

const LOGIN = `Feature: Login

  Background:
    Given the application is running
    And a user account exists

  Scenario: Valid login
    When I log in with valid credentials
    Then I should see the dashboard

  Scenario: Invalid login is rejected
    When I log in with invalid credentials
    Then I should see the dashboard
    And I should see a welcome banner
`

const CHECKOUT = `Feature: Checkout

  Scenario Outline: Buying <count> items
    Given a cart with <count> items
    When I check out
    Then the order total is <total>

    Examples:
      | count | total |
      | 1     | 10    |
      | 3     | 30    |

  Scenario: Slow checkout
    Given a cart with 2 items
    When I wait a while
    Then the order total is 20
`

describe('parseFeatureSteps', () => {
  it('collects background steps separately from scenario steps', () => {
    const index = parseFeatureSteps(LOGIN)

    expect(index.background).toEqual([
      'Given the application is running',
      'And a user account exists',
    ])
    expect(index.scenarios.get('Valid login')).toEqual([
      'When I log in with valid credentials',
      'Then I should see the dashboard',
    ])
  })

  it('stops a Scenario Outline step list at the Examples table', () => {
    const index = parseFeatureSteps(CHECKOUT)

    expect(index.scenarios.get('Buying <count> items')).toEqual([
      'Given a cart with <count> items',
      'When I check out',
      'Then the order total is <total>',
    ])
  })

  it('does not let Examples rows leak into the next scenario', () => {
    const index = parseFeatureSteps(CHECKOUT)

    expect(index.scenarios.get('Slow checkout')).toEqual([
      'Given a cart with 2 items',
      'When I wait a while',
      'Then the order total is 20',
    ])
  })

  it('ignores tags, comments and blank lines', () => {
    const index = parseFeatureSteps(`Feature: F
  @smoke
  # a note

  Scenario: S
    Given a step
`)
    expect(index.scenarios.get('S')).toEqual(['Given a step'])
  })

  it('does not treat doc-string text as steps', () => {
    const index = parseFeatureSteps(`Feature: F

  Scenario: S
    Given a payload
      """
      When this line is not a step
      """
    Then it is stored
`)
    expect(index.scenarios.get('S')).toEqual(['Given a payload', 'Then it is stored'])
  })

  it('normalizes keyword casing to what the reporter emits', () => {
    const index = parseFeatureSteps(`Feature: F

  Scenario: S
    GIVEN a step
    when another
`)
    expect(index.scenarios.get('S')).toEqual(['Given a step', 'When another'])
  })

  it('never throws on malformed content', () => {
    expect(() => parseFeatureSteps('')).not.toThrow()
    expect(() => parseFeatureSteps('nonsense\n|||\nGiven orphan step')).not.toThrow()
  })

  it('drops steps written before any scenario or background', () => {
    // Nothing to attach them to; inventing a scenario would be worse.
    const index = parseFeatureSteps('Feature: F\n  Given a homeless step\n')
    expect(index.scenarios.size).toBe(0)
  })
})

describe('authoredStepsFor', () => {
  it('puts background steps first, matching the reporter ordinals', () => {
    const authored = authoredStepsFor(parseFeatureSteps(LOGIN), 'Valid login')

    expect(authored).toEqual({
      titles: [
        'Given the application is running',
        'And a user account exists',
        'When I log in with valid credentials',
        'Then I should see the dashboard',
      ],
      backgroundCount: 2,
    })
  })

  it('resolves a Scenario Outline row back to its placeholder-authored scenario', () => {
    // The reporter titles the row "Buying 1 items"; the file says "Buying <count> items".
    const index = parseFeatureSteps(CHECKOUT)

    expect(authoredStepsFor(index, 'Buying 1 items')?.titles).toEqual([
      'Given a cart with <count> items',
      'When I check out',
      'Then the order total is <total>',
    ])
    expect(authoredStepsFor(index, 'Buying 3 items')?.titles).toEqual(
      authoredStepsFor(index, 'Buying 1 items')?.titles,
    )
  })

  it('prefers an exact name match over a placeholder match', () => {
    const index = parseFeatureSteps(CHECKOUT)
    expect(authoredStepsFor(index, 'Slow checkout')?.titles).toEqual([
      'Given a cart with 2 items',
      'When I wait a while',
      'Then the order total is 20',
    ])
  })

  it('returns null for a scenario the file does not contain', () => {
    expect(authoredStepsFor(parseFeatureSteps(LOGIN), 'Nope')).toBeNull()
  })

  it('reports zero background steps when the feature has no Background', () => {
    expect(authoredStepsFor(parseFeatureSteps(CHECKOUT), 'Slow checkout')?.backgroundCount).toBe(0)
  })
})
