import { describe, it, expect } from 'vitest'
import { analyzeSource } from '../catalog'

const PRELUDE =
  `import { step, str, defineStep } from '@suisui/step-regex'\n` +
  `import { test } from 'playwright-bdd'\n` +
  `import { createBdd } from 'playwright-bdd'\n` +
  `const { Given, When, Then } = createBdd(test)\n`

function firstStep(source: string) {
  return analyzeSource({ 'tests/steps/a.steps.ts': PRELUDE + source }).steps[0]
}

describe('suisui-metadata (US4)', () => {
  it('reads exact title/description/category/tags and parameter labels', () => {
    const step = firstStep(
      `const fillFieldStep = defineStep({\n` +
        `  pattern: step\`I fill \${str('field')} with \${str('value')}\`,\n` +
        `  title: 'Fill a form field',\n` +
        `  description: 'Fills a visible form field.',\n` +
        `  category: 'Form',\n` +
        `  tags: ['form', 'input'],\n` +
        `  parameters: { field: { label: 'Field', example: 'Email' } },\n` +
        `})\n` +
        `When(fillFieldStep, async ({ page }, field, value) => {})\n`,
    )
    expect(step?.title).toBe('Fill a form field')
    expect(step?.description).toBe('Fills a visible form field.')
    expect(step?.category).toBe('Form')
    expect(step?.tags).toEqual(['form', 'input'])
    expect(step?.origin).toBe('suisui')
    const field = step?.parameters.find((p) => p.name === 'field')
    expect(field?.label).toBe('Field')
    expect(field?.example).toBe('Email')
    expect(field?.precision).toBe('exact')
  })

  it('supports defineStep inline as the step argument', () => {
    const step = firstStep(
      `When(defineStep({ pattern: step\`I click \${str('target')}\`, title: 'Click' }), async ({ page }, target) => {})\n`,
    )
    expect(step?.title).toBe('Click')
    expect(step?.pattern.source).toBe('I click {string:target}')
  })

  it('flags an invalid defineStep parameter key', () => {
    const step = firstStep(
      `When(defineStep({ pattern: step\`I fill \${str('field')}\`, parameters: { nope: { label: 'X' } } }), async ({ page }, field) => {})\n`,
    )
    expect(step?.diagnostics.some((d) => d.code === 'INVALID_DEFINE_STEP_METADATA')).toBe(true)
  })

  it('detects a parameter type conflict between pattern and callback annotation', () => {
    const step = firstStep(
      `When('I wait {int}', async ({ page }, seconds: string) => {})\n`,
    )
    expect(step?.diagnostics.some((d) => d.code === 'PARAMETER_TYPE_CONFLICT')).toBe(true)
  })
})
