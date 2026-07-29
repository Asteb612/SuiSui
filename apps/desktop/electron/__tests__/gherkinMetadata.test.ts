import { describe, it, expect } from 'vitest'
import { parseFeatureMetadata } from '../utils/gherkinMetadata'

describe('parseFeatureMetadata', () => {
  it('extracts the feature name', () => {
    const { name } = parseFeatureMetadata('Feature: Login flow\n')
    expect(name).toBe('Login flow')
  })

  it('collects feature-level tags declared above the Feature keyword', () => {
    const content = '@smoke @auth\nFeature: Login\n'
    const { tags } = parseFeatureMetadata(content)
    expect(tags).toEqual(['smoke', 'auth'])
  })

  it('inherits feature tags into every scenario and adds scenario tags', () => {
    const content = [
      '@auth',
      'Feature: Login',
      '',
      '@happy',
      'Scenario: Valid credentials',
      '  Given I am on the login page',
      '',
      'Scenario: No tags here',
      '  Given I am on the login page',
    ].join('\n')

    const { scenarios } = parseFeatureMetadata(content)
    expect(scenarios).toEqual([
      { name: 'Valid credentials', tags: ['auth', 'happy'], testCount: 1 },
      { name: 'No tags here', tags: ['auth'], testCount: 1 },
    ])
  })

  it('recognizes Scenario Outline', () => {
    const { scenarios } = parseFeatureMetadata(
      'Feature: F\nScenario Outline: Parametrized\n  Given <x>\n',
    )
    expect(scenarios).toEqual([{ name: 'Parametrized', tags: [], testCount: 1 }])
  })

  it('ignores comments and blank lines', () => {
    const content = '# a comment\n\nFeature: F\n# another\nScenario: S\n'
    const { name, scenarios } = parseFeatureMetadata(content)
    expect(name).toBe('F')
    expect(scenarios).toEqual([{ name: 'S', tags: [], testCount: 1 }])
  })

  it('clears orphaned pending tags when a non-keyword line appears', () => {
    const content = ['Feature: F', '@orphan', 'Given something', 'Scenario: S'].join('\n')
    const { scenarios } = parseFeatureMetadata(content)
    expect(scenarios).toEqual([{ name: 'S', tags: [], testCount: 1 }])
  })

  it('returns empty metadata for content without a feature', () => {
    expect(parseFeatureMetadata('')).toEqual({ name: '', tags: [], scenarios: [] })
  })
})

describe('parseFeatureMetadata — how many tests a scenario runs', () => {
  // One authored `Scenario Outline` is ONE entry (that is the unit the name and
  // tag filters work on) but Playwright runs one test per example row. Counting
  // the entries made the runner promise 118 tests and then run 140.
  it('counts one test per example row, not one per outline', () => {
    const content = [
      'Feature: Access',
      '',
      'Scenario Outline: The <subroute> route bounces back to the hub',
      '  Given I am signed in',
      '  When I open /<subroute>',
      '',
      '  Examples:',
      '    | subroute          |',
      '    | cerfa             |',
      '    | matrix            |',
      '    | existing-building |',
    ].join('\n')

    const { scenarios } = parseFeatureMetadata(content)
    expect(scenarios).toHaveLength(1)
    expect(scenarios[0]!.testCount).toBe(3)
  })

  it('adds up several Examples blocks under one outline', () => {
    const content = [
      'Feature: F',
      'Scenario Outline: Parametrized',
      '  Given <x>',
      '  Examples: happy',
      '    | x |',
      '    | 1 |',
      '    | 2 |',
      '  Examples: sad',
      '    | x |',
      '    | 3 |',
    ].join('\n')

    expect(parseFeatureMetadata(content).scenarios[0]!.testCount).toBe(3)
  })

  it('stops counting rows at the next scenario', () => {
    const content = [
      'Feature: F',
      'Scenario Outline: Outlined',
      '  Given <x>',
      '  Examples:',
      '    | x |',
      '    | 1 |',
      'Scenario: Plain',
      '  Given something',
      '  And a table argument:',
      '    | col |',
      '    | val |',
    ].join('\n')

    const { scenarios } = parseFeatureMetadata(content)
    // The plain scenario's step DATA TABLE is not an example row.
    expect(scenarios.map((s) => s.testCount)).toEqual([1, 1])
  })

  it('does not count a Background data table towards the outline above it', () => {
    const content = [
      'Feature: F',
      'Scenario Outline: Outlined',
      '  Given <x>',
      '  Examples:',
      '    | x |',
      '    | 1 |',
      '    | 2 |',
      'Background:',
      '  Given a table:',
      '    | a |',
      '    | b |',
    ].join('\n')

    expect(parseFeatureMetadata(content).scenarios[0]!.testCount).toBe(2)
  })

  it('treats an outline with no Examples table as one test', () => {
    // It is still one authored scenario; reporting 0 would erase it from the count.
    const content = 'Feature: F\nScenario Outline: Unfinished\n  Given <x>\n'
    expect(parseFeatureMetadata(content).scenarios[0]!.testCount).toBe(1)
  })

  it('ignores table-looking lines inside a doc string', () => {
    const content = [
      'Feature: F',
      'Scenario Outline: Outlined',
      '  Given a payload:',
      '    """',
      '    | not | a | row |',
      '    | nor | is | this |',
      '    """',
      '  Examples:',
      '    | x |',
      '    | 1 |',
    ].join('\n')

    expect(parseFeatureMetadata(content).scenarios[0]!.testCount).toBe(1)
  })
})
