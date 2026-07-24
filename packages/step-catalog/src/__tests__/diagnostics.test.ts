import { describe, it, expect } from 'vitest'
import { analyzeSource } from '../catalog'

const PRELUDE =
  `import { test } from 'playwright-bdd'\n` +
  `import { createBdd } from 'playwright-bdd'\n` +
  `const { Given, When, Then } = createBdd(test)\n`

function steps(source: string) {
  return analyzeSource({ 'tests/steps/a.steps.ts': PRELUDE + source }).steps
}

describe('diagnostics & precision (US3)', () => {
  it('flags ambiguity when a parameterized step subsumes a specific one', () => {
    const result = steps(
      `Given('I have {int} items', async ({ page }, n) => {})\n` +
        `Given('I have 5 items', async ({ page }) => {})\n`,
    )
    const general = result.find((s) => s.pattern.source === 'I have {int} items')
    expect(general?.diagnostics.some((d) => d.code === 'AMBIGUOUS_STEP_PATTERN')).toBe(true)
  })

  it('does not flag ambiguity between unrelated steps', () => {
    const result = steps(
      `Given('I open the door', async ({ page }) => {})\n` +
        `Given('I close the window', async ({ page }) => {})\n`,
    )
    expect(result.every((s) => s.diagnostics.every((d) => d.code !== 'AMBIGUOUS_STEP_PATTERN'))).toBe(
      true,
    )
  })

  it('marks exact fragment metadata as exact precision', () => {
    const src =
      `import { step, str } from '@suisui/step-regex'\n` +
      PRELUDE +
      `When(step\`I fill \${str('field')}\`, async ({ page }, field) => {})\n`
    const [only] = analyzeSource({ 'tests/steps/b.steps.ts': src }).steps
    expect(only?.precision).toBe('exact')
    expect(only?.origin).toBe('suisui')
  })

  it('marks a bare cucumber string param as inferred and warns on inferred names', () => {
    const [only] = steps(`When('I enter {string}', async ({ page }) => {})`)
    expect(only?.precision).toBe('inferred')
    // {string} with no name -> arg0 -> inferred-names note
    expect(only?.diagnostics.some((d) => d.severity === 'info')).toBe(true)
  })

  it('marks regex-derived params as partial', () => {
    const [only] = steps(`Then(/^I see "([^"]+)"$/, async ({ page }, text) => {})`)
    expect(only?.precision).toBe('partial')
  })
})
