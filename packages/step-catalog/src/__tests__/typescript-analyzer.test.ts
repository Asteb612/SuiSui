import { describe, it, expect } from 'vitest'
import { analyzeSource } from '../catalog'

const PRELUDE = `import { test } from 'playwright-bdd'\nimport { createBdd } from 'playwright-bdd'\nconst { Given, When, Then } = createBdd(test)\n`

function firstStep(source: string) {
  const result = analyzeSource({ 'tests/steps/a.steps.ts': PRELUDE + source })
  return result.steps[0]
}

describe('typescript-analyzer (US1)', () => {
  it('extracts a plain-string Given with source location', () => {
    const step = firstStep(`Given('I am logged in', async ({ page }) => {})`)
    expect(step?.keyword).toBe('Given')
    expect(step?.pattern.kind).toBe('plain-string')
    expect(step?.pattern.source).toBe('I am logged in')
    expect(step?.source.file).toBe('tests/steps/a.steps.ts')
    expect(step?.source.line).toBeGreaterThan(0)
    expect(step?.source.column).toBeGreaterThan(0)
    expect(step?.fixtures).toEqual(['page'])
  })

  it('classifies a cucumber-expression pattern and its parameters', () => {
    const step = firstStep(`When('I enter {string}', async ({ page }, value) => {})`)
    expect(step?.pattern.kind).toBe('cucumber')
    expect(step?.parameters).toHaveLength(1)
    expect(step?.parameters[0]?.type).toBe('string')
  })

  it('extracts a regexp pattern with source and flags', () => {
    const step = firstStep(`When(/^I select (admin|user)$/i, async ({ page }, role) => {})`)
    expect(step?.pattern.kind).toBe('regexp')
    expect(step?.pattern.source).toBe('^I select (admin|user)$')
    expect(step?.pattern.flags).toBe('i')
  })

  it('supports aliased Given/When/Then (destructured rename)', () => {
    const src = `import { test } from 'playwright-bdd'\nimport { createBdd } from 'playwright-bdd'\nconst { When: Action } = createBdd(test)\nAction('I open the menu', async ({ page }) => {})\n`
    const result = analyzeSource({ 'tests/steps/b.steps.ts': src })
    expect(result.steps[0]?.keyword).toBe('When')
    expect(result.steps[0]?.pattern.source).toBe('I open the menu')
  })

  it('resolves a locally-declared constant pattern', () => {
    const src = PRELUDE + `const loginPattern = 'I log in as admin'\nGiven(loginPattern, async ({ page }) => {})\n`
    const result = analyzeSource({ 'tests/steps/c.steps.ts': src })
    expect(result.steps[0]?.pattern.source).toBe('I log in as admin')
  })

  it('reconstructs a SuiSui step`` template with named params', () => {
    const src =
      `import { step, str } from '@suisui/step-regex'\n` +
      PRELUDE +
      `When(step\`I fill \${str('field')} with \${str('value')}\`, async ({ page }, field, value) => {})\n`
    const result = analyzeSource({ 'tests/steps/d.steps.ts': src })
    const step = result.steps[0]
    expect(step?.pattern.kind).toBe('suisui-template')
    expect(step?.pattern.source).toBe('I fill {string:field} with {string:value}')
    expect(step?.parameters.map((p) => p.name)).toEqual(['field', 'value'])
    expect(step?.parameters.every((p) => p.precision === 'exact' && p.origin === 'suisui')).toBe(true)
  })

  it('flags a dynamic template-literal pattern', () => {
    const src = PRELUDE + 'const name = "Home"\nGiven(`I am on ${name}`, async ({ page }) => {})\n'
    const result = analyzeSource({ 'tests/steps/e.steps.ts': src })
    const step = result.steps[0]
    expect(step?.pattern.kind).toBe('dynamic')
    expect(step?.diagnostics.some((d) => d.code === 'DYNAMIC_STEP_PATTERN')).toBe(true)
  })

  it('reports a missing callback', () => {
    const step = firstStep(`Given('I have no callback')`)
    expect(step?.diagnostics.some((d) => d.code === 'MISSING_CALLBACK')).toBe(true)
  })
})
