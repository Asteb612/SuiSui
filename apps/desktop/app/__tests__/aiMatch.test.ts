import { describe, it, expect } from 'vitest'
import type { StepDefinition } from '@suisui/shared'
import { reconcileSuggestedStep } from '../utils/aiMatch'

const step = (keyword: StepDefinition['keyword'], pattern: string, id = pattern): StepDefinition =>
  ({ id, keyword, pattern, args: [], isGeneric: false }) as unknown as StepDefinition

const STEPS: StepDefinition[] = [
  step('Given', 'I am logged in as {string}'),
  step('When', 'I click on {string}'),
  step('Then', 'I should see {string}'),
]

describe('reconcileSuggestedStep (FR-010)', () => {
  it('returns the step when the model copies the pattern verbatim', () => {
    expect(reconcileSuggestedStep('I click on {string}', STEPS)).toBe(STEPS[1])
  })

  it('matches a verbatim copy that includes the keyword prefix', () => {
    expect(reconcileSuggestedStep('Then I should see {string}', STEPS)).toBe(STEPS[2])
  })

  it('reconciles a concrete phrase to the matching pattern via matchStep', () => {
    expect(reconcileSuggestedStep('I click on "Login"', STEPS)).toBe(STEPS[1])
  })

  it('tolerates surrounding quotes from the model', () => {
    expect(reconcileSuggestedStep('"I should see {string}"', STEPS)).toBe(STEPS[2])
  })

  it('returns null when the model replies NONE', () => {
    expect(reconcileSuggestedStep('NONE', STEPS)).toBeNull()
    expect(reconcileSuggestedStep('  none  ', STEPS)).toBeNull()
  })

  it('returns null when nothing reconciles (no fabricated fallback)', () => {
    expect(reconcileSuggestedStep('I do something entirely unrelated', STEPS)).toBeNull()
  })

  it('returns null on an empty reply', () => {
    expect(reconcileSuggestedStep('', STEPS)).toBeNull()
  })
})
