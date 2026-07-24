import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// StepCatalogService transitively imports the Electron `app` (via WorkspaceService
// -> StepService). Mock it so the module loads under Vitest.
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/mock/app' },
}))

import { StepCatalogService } from '../services/StepCatalogService'

const PRELUDE =
  `import { test } from 'playwright-bdd'\n` +
  `import { createBdd } from 'playwright-bdd'\n` +
  `const { Given, When, Then } = createBdd(test)\n`

let workspace: string

function service(): StepCatalogService {
  return new StepCatalogService({
    getWorkspacePath: () => workspace,
    resolveConfigPath: () => null,
  })
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'suisui-catalog-'))
  mkdirSync(join(workspace, 'tests', 'steps'), { recursive: true })
})

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true })
})

describe('StepCatalogService (US1 integration)', () => {
  it('generates a structured catalog from workspace step files', async () => {
    writeFileSync(
      join(workspace, 'tests', 'steps', 'login.steps.ts'),
      PRELUDE +
        `Given('I am logged in', async ({ page }) => {})\n` +
        `When('I enter {string}', async ({ page }, value) => {})\n`,
    )

    const result = await service().generate()

    expect(result.schemaVersion).toBe(1)
    expect(result.steps.length).toBe(2)
    const login = result.steps.find((s) => s.pattern.source === 'I am logged in')
    expect(login?.keyword).toBe('Given')
    expect(login?.source.file).toBe('tests/steps/login.steps.ts')
    expect(login?.source.line).toBeGreaterThan(0)
    expect(result.analyzedFiles).toBe(1)
  })

  it('resolves a step by its stable id', async () => {
    writeFileSync(
      join(workspace, 'tests', 'steps', 'a.steps.ts'),
      PRELUDE + `Then('I should see {string}', async ({ page }, text) => {})\n`,
    )
    const svc = service()
    const result = await svc.generate()
    const id = result.steps[0]!.id
    expect(svc.getStepById(id)?.pattern.source).toBe('I should see {string}')
    expect(svc.getStepById('step_000000000000')).toBeUndefined()
  })

  it('isolates a bad file while cataloging the good ones', async () => {
    writeFileSync(
      join(workspace, 'tests', 'steps', 'good.steps.ts'),
      PRELUDE + `Given('I am on the home page', async ({ page }) => {})\n`,
    )
    writeFileSync(join(workspace, 'tests', 'steps', 'bad.steps.ts'), 'const x = ((((')

    const result = await service().generate()
    expect(result.steps.some((s) => s.pattern.source === 'I am on the home page')).toBe(true)
  })

  it('throws when no workspace is selected', async () => {
    const svc = new StepCatalogService({ getWorkspacePath: () => null })
    await expect(svc.generate()).rejects.toThrow(/No workspace selected/)
  })

  it('findMatchingSteps matches by pattern and keyword', async () => {
    writeFileSync(
      join(workspace, 'tests', 'steps', 'a.steps.ts'),
      PRELUDE + `Given('I am on the home page', async ({ page }) => {})\n`,
    )
    const svc = service()
    await svc.generate()
    expect(svc.findMatchingSteps('I am on the home page', 'Given').length).toBe(1)
    expect(svc.findMatchingSteps('I am on the home page', 'Then').length).toBe(0)
  })
})
