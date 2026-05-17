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
      { name: 'Valid credentials', tags: ['auth', 'happy'] },
      { name: 'No tags here', tags: ['auth'] },
    ])
  })

  it('recognizes Scenario Outline', () => {
    const { scenarios } = parseFeatureMetadata(
      'Feature: F\nScenario Outline: Parametrized\n  Given <x>\n',
    )
    expect(scenarios).toEqual([{ name: 'Parametrized', tags: [] }])
  })

  it('ignores comments and blank lines', () => {
    const content = '# a comment\n\nFeature: F\n# another\nScenario: S\n'
    const { name, scenarios } = parseFeatureMetadata(content)
    expect(name).toBe('F')
    expect(scenarios).toEqual([{ name: 'S', tags: [] }])
  })

  it('clears orphaned pending tags when a non-keyword line appears', () => {
    const content = ['Feature: F', '@orphan', 'Given something', 'Scenario: S'].join('\n')
    const { scenarios } = parseFeatureMetadata(content)
    expect(scenarios).toEqual([{ name: 'S', tags: [] }])
  })

  it('returns empty metadata for content without a feature', () => {
    expect(parseFeatureMetadata('')).toEqual({ name: '', tags: [], scenarios: [] })
  })
})
