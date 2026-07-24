import { describe, it, expect } from 'vitest'
import { analyzeSource } from '../catalog'

const PRELUDE = `import { test } from 'playwright-bdd'\nimport { createBdd } from 'playwright-bdd'\nconst { Given, When, Then } = createBdd(test)\n`

describe('catalog analyzeFiles (US1)', () => {
  it('isolates a single unparseable file and keeps the others', () => {
    const good = PRELUDE + `Given('I am on the home page', async ({ page }) => {})`
    // A syntactically broken file that will throw during analysis of its calls.
    const bad = 'const x = (((('
    const result = analyzeSource({
      'tests/steps/good.steps.ts': good,
      'tests/steps/bad.steps.ts': bad,
    })
    expect(result.steps.some((s) => s.pattern.source === 'I am on the home page')).toBe(true)
    // Either a file-parse diagnostic, or the bad file simply yields no steps —
    // the key guarantee is the good file still produced a step.
    expect(result.analyzedFiles).toBe(2)
  })

  it('flags exact duplicate step definitions', () => {
    const src =
      PRELUDE +
      `Given('I am logged in', async ({ page }) => {})\n` +
      `Given('I am logged in', async ({ page }) => {})\n`
    const result = analyzeSource({ 'tests/steps/dup.steps.ts': src })
    const dupDiagnostics = result.steps.flatMap((s) =>
      s.diagnostics.filter((d) => d.code === 'DUPLICATE_STEP_PATTERN'),
    )
    expect(dupDiagnostics.length).toBe(2)
  })

  it('is JSON-serializable (round-trips unchanged)', () => {
    const src = PRELUDE + `When('I enter {string}', async ({ page }, value) => {})`
    const result = analyzeSource({ 'tests/steps/a.steps.ts': src })
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })

  it('returns an empty step list for a workspace with no step calls', () => {
    const result = analyzeSource({ 'tests/steps/empty.steps.ts': `export const x = 1` })
    expect(result.steps).toEqual([])
    expect(result.analyzedFiles).toBe(1)
  })
})
