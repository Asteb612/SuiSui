import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateCatalog } from '../catalog'

/**
 * Performance validation (US5, SC-007): a ~500-step project generates cold in
 * well under 5s, and an unchanged refresh returns from cache in under 500ms.
 * Bounds are generous to stay reliable across machines/CI.
 */
let ws: string
const FILES = 50
const STEPS_PER_FILE = 10 // 500 steps total

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), 'suisui-perf-'))
  const dir = join(ws, 'tests', 'steps')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(ws, 'package.json'), '{"name":"perf"}')
  for (let f = 0; f < FILES; f++) {
    let src = `import { createBdd } from 'playwright-bdd'\nconst { Given, When, Then } = createBdd(test)\n`
    for (let s = 0; s < STEPS_PER_FILE; s++) {
      src += `When('I perform action ${f}_${s} with {string}', async ({ page }, value) => {})\n`
    }
    writeFileSync(join(dir, `f${f}.steps.ts`), src)
  }
})
afterEach(() => rmSync(ws, { recursive: true, force: true }))

describe('catalog performance (US5)', () => {
  it('generates ~500 steps cold in under 5s and cached in under 500ms', async () => {
    const t0 = Date.now()
    const cold = await generateCatalog({ workspacePath: ws, force: true })
    const coldMs = Date.now() - t0
    expect(cold.steps.length).toBe(FILES * STEPS_PER_FILE)
    expect(coldMs).toBeLessThan(5000)

    const t1 = Date.now()
    const cached = await generateCatalog({ workspacePath: ws })
    const cachedMs = Date.now() - t1
    expect(cached.steps.length).toBe(FILES * STEPS_PER_FILE)
    expect(cachedMs).toBeLessThan(500)
  })
})
