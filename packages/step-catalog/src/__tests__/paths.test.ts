import { describe, it, expect } from 'vitest'
import { analyzeSource } from '../catalog'
import { analyzeFile } from '../adapters/typescript-analyzer'
import { toPosix } from '../discovery'

const PRELUDE =
  `import { createBdd } from 'playwright-bdd'\nconst { Given, When, Then } = createBdd(test)\n`

describe('path normalization + partial parsing (Polish)', () => {
  it('normalizes Windows separators to POSIX', () => {
    expect(toPosix('features\\steps\\login.steps.ts')).toBe('features/steps/login.steps.ts')
    expect(toPosix('already/posix/path.ts')).toBe('already/posix/path.ts')
  })

  it('preserves the provided workspace-relative path in source locations', () => {
    const rel = 'features/steps/login.steps.ts'
    const candidates = analyzeFile(rel, PRELUDE + `Given('I am logged in', async ({ page }) => {})`)
    expect(candidates[0]?.location.file).toBe(rel)
  })

  it('returns partial results when one file fails to parse', () => {
    const result = analyzeSource({
      'features/steps/good.steps.ts': PRELUDE + `Given('I work', async ({ page }) => {})`,
      // Deeply malformed source — analysis of this file must not abort the run.
      'features/steps/broken.steps.ts': 'const = = = ) ) (',
    })
    expect(result.steps.some((s) => s.pattern.source === 'I work')).toBe(true)
    expect(result.analyzedFiles).toBe(2)
  })
})
