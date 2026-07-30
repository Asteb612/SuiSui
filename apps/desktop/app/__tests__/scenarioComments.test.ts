import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setActivePinia, createPinia } from 'pinia'
import { useScenarioStore } from '../stores/scenario'

const FIXTURE = readFileSync(
  join(__dirname, 'fixtures', 'round-trip-baseline.feature'),
  'utf-8',
)

describe('Gherkin round-trip: golden output', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('emits byte-identical output for a comment-free feature file', () => {
    const store = useScenarioStore()
    store.parseGherkin(FIXTURE)

    // Snapshot guards every existing user feature file against churn introduced
    // by the comment support added for feature 012. If this changes, the change
    // rewrites files the user already owns.
    expect(store.toGherkin()).toMatchSnapshot()
  })

  it('is stable across repeated round-trips', () => {
    const store = useScenarioStore()
    store.parseGherkin(FIXTURE)
    const once = store.toGherkin()

    store.parseGherkin(once)
    const twice = store.toGherkin()

    expect(twice).toBe(once)
  })
})

describe('Gherkin round-trip: scenario comments', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const WITH_COMMENTS = `Feature: Checkout

  # Requirement: https://example.test/issues/102
  # Reviewed by QA 2026-07-30
  @smoke
  Scenario: Customer checks out
    Given I am on the "home" page
`

  describe('parsing', () => {
    it('attaches leading comments to the scenario that follows', () => {
      const store = useScenarioStore()
      store.parseGherkin(WITH_COMMENTS)

      expect(store.scenarios[0]!.comments).toEqual([
        '# Requirement: https://example.test/issues/102',
        '# Reviewed by QA 2026-07-30',
      ])
    })

    it('stores comments verbatim, including the leading hash', () => {
      const store = useScenarioStore()
      store.parseGherkin(WITH_COMMENTS)

      expect(store.scenarios[0]!.comments![0]!.startsWith('#')).toBe(true)
    })

    it('never mistakes a comment for a step, tag, or description (FR-033)', () => {
      const store = useScenarioStore()
      store.parseGherkin(WITH_COMMENTS)

      const scenario = store.scenarios[0]!
      expect(scenario.steps).toHaveLength(1)
      expect(scenario.tags).toEqual(['smoke'])
      expect(store.featureDescription).not.toContain('Requirement')
    })

    it('leaves comments undefined when there are none', () => {
      const store = useScenarioStore()
      store.parseGherkin('Feature: F\n\n  Scenario: S\n    Given I am on the "a" page\n')

      expect(store.scenarios[0]!.comments).toBeUndefined()
    })

    it('attaches comments to the right scenario when several follow', () => {
      const store = useScenarioStore()
      store.parseGherkin(`Feature: F

  Scenario: First
    Given I am on the "a" page

  # about the second
  Scenario: Second
    Given I am on the "b" page
`)

      expect(store.scenarios[0]!.comments).toBeUndefined()
      expect(store.scenarios[1]!.comments).toEqual(['# about the second'])
    })
  })

  describe('emitting', () => {
    it('writes comments above the tag line', () => {
      const store = useScenarioStore()
      store.parseGherkin(WITH_COMMENTS)

      const out = store.toGherkin()
      const lines = out.split('\n').map((l) => l.trim())
      const commentIndex = lines.indexOf('# Requirement: https://example.test/issues/102')
      const tagIndex = lines.indexOf('@smoke')
      const scenarioIndex = lines.indexOf('Scenario: Customer checks out')

      expect(commentIndex).toBeGreaterThan(-1)
      expect(commentIndex).toBeLessThan(tagIndex)
      expect(tagIndex).toBeLessThan(scenarioIndex)
    })

    it('emits nothing for a scenario with no comments', () => {
      const store = useScenarioStore()
      store.parseGherkin('Feature: F\n\n  Scenario: S\n    Given I am on the "a" page\n')

      expect(store.toGherkin()).not.toContain('#')
    })
  })

  describe('round-trip invariants', () => {
    it('preserves comments through parse → emit → parse (FR-030)', () => {
      const store = useScenarioStore()
      store.parseGherkin(WITH_COMMENTS)
      const emitted = store.toGherkin()

      store.parseGherkin(emitted)

      expect(store.scenarios[0]!.comments).toEqual([
        '# Requirement: https://example.test/issues/102',
        '# Reviewed by QA 2026-07-30',
      ])
    })

    it('preserves a HAND-WRITTEN comment across an edit and save (FR-031)', () => {
      // Regression test for behaviour that did not exist before feature 012:
      // toGherkin() regenerates the file, so an unmodelled comment was deleted
      // on the tester's first save.
      const store = useScenarioStore()
      store.parseGherkin(`Feature: F

  # TODO: this scenario is flaky, see the tracker
  Scenario: S
    Given I am on the "a" page
`)

      store.addStep('When', 'I click on {string}', [])
      const saved = store.toGherkin()

      expect(saved).toContain('# TODO: this scenario is flaky, see the tracker')
    })

    it('keeps comment order and position stable across repeated round-trips', () => {
      const store = useScenarioStore()
      store.parseGherkin(WITH_COMMENTS)
      const once = store.toGherkin()

      store.parseGherkin(once)
      const twice = store.toGherkin()

      expect(twice).toBe(once)
    })

    it('preserves a comment containing a URL untouched (FR-032)', () => {
      const url = '# Requirement: https://example.test/a?b=c&d=%20e#frag'
      const store = useScenarioStore()
      store.parseGherkin(`Feature: F\n\n  ${url}\n  Scenario: S\n    Given I am on the "a" page\n`)

      expect(store.toGherkin()).toContain(url)
    })
  })
})
