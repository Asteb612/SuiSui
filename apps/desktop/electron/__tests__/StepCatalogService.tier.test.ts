import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/userdata') },
}))

const readCacheMock = vi.fn()
vi.mock('@suisui/step-catalog', () => ({
  generateCatalog: vi.fn(),
  readCache: (...args: unknown[]) => readCacheMock(...args),
  clearCache: vi.fn(),
}))

import type { CatalogStep, StepCatalogResult } from '@suisui/shared'
import { StepCatalogService } from '../services/StepCatalogService'

/**
 * Authorship tier (feature 012, FR-008). The only provenance signal available
 * is the step's source file: a step is `generic` when it provably came from the
 * step-definition file the app provisions, and `project` otherwise.
 */

const step = (id: string, file: string): CatalogStep => ({
  id,
  keyword: 'Given',
  pattern: { kind: 'cucumber', source: `step ${id}` },
  tags: [],
  parameters: [],
  fixtures: [],
  source: { file, line: 1, column: 1 },
  origin: 'typescript',
  precision: 'exact',
  diagnostics: [],
})

const result = (steps: CatalogStep[]): StepCatalogResult =>
  ({
    version: 1,
    generatedAt: '2026-07-30T00:00:00Z',
    steps,
    analyzedFiles: 1,
    durationMs: 1,
    diagnostics: [],
  }) as unknown as StepCatalogResult

function makeService(options: {
  steps: CatalogStep[]
  featuresDir?: string
  featuresDirThrows?: boolean
}) {
  return new StepCatalogService({
    generate: async () => result(options.steps),
    getWorkspacePath: () => '/ws',
    resolveConfigPath: () => null,
    getFeaturesDir: async () => {
      if (options.featuresDirThrows) throw new Error('no workspace')
      return options.featuresDir ?? 'features'
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  readCacheMock.mockReturnValue(null)
})

describe('StepCatalogService — step tier', () => {
  it('classifies the provisioned steps file as generic', async () => {
    const service = makeService({
      steps: [step('g1', 'features/steps/generic.steps.ts')],
    })

    const out = await service.generate()

    expect(out.steps[0]!.tier).toBe('generic')
  })

  it('classifies every other file as project', async () => {
    const service = makeService({
      steps: [
        step('p1', 'features/steps/checkout.steps.ts'),
        step('p2', 'src/test/steps/auth.steps.ts'),
      ],
    })

    const out = await service.generate()

    expect(out.steps.map((s) => s.tier)).toEqual(['project', 'project'])
  })

  it('resolves the provisioned file against a custom features directory', async () => {
    const service = makeService({
      steps: [
        step('g1', 'e2e/steps/generic.steps.ts'),
        // Same filename under the DEFAULT dir is project-authored here, because
        // this workspace's provisioned file lives under e2e/.
        step('p1', 'features/steps/generic.steps.ts'),
      ],
      featuresDir: 'e2e',
    })

    const out = await service.generate()

    expect(out.steps.map((s) => s.tier)).toEqual(['generic', 'project'])
  })

  it('does not treat a similarly-named file as generic', async () => {
    const service = makeService({
      steps: [
        step('p1', 'features/steps/generic.steps.helper.ts'),
        step('p2', 'features/steps/my-generic.steps.ts'),
        step('p3', 'features/other/steps/generic.steps.ts'),
      ],
    })

    const out = await service.generate()

    expect(out.steps.every((s) => s.tier === 'project')).toBe(true)
  })

  it('normalises Windows-style source paths', async () => {
    const service = makeService({
      steps: [step('g1', 'features\\steps\\generic.steps.ts')],
    })

    const out = await service.generate()

    expect(out.steps[0]!.tier).toBe('generic')
  })

  it('handles a trailing slash on the features directory', async () => {
    const service = makeService({
      steps: [step('g1', 'features/steps/generic.steps.ts')],
      featuresDir: 'features/',
    })

    const out = await service.generate()

    expect(out.steps[0]!.tier).toBe('generic')
  })

  it('falls back to project when the features directory cannot be resolved', async () => {
    // Safe direction: never demote a team's own step on missing information.
    const service = makeService({
      steps: [step('g1', 'features/steps/generic.steps.ts')],
      featuresDirThrows: true,
    })

    const out = await service.generate()

    expect(out.steps[0]!.tier).toBe('project')
  })

  describe('cache path', () => {
    it('re-stamps the tier when serving from the on-disk cache', async () => {
      // A cache written before this feature existed carries no tier at all.
      readCacheMock.mockReturnValue({
        result: result([step('g1', 'features/steps/generic.steps.ts')]),
      })

      const service = makeService({ steps: [] })
      const out = await service.getCached()

      expect(out?.steps[0]!.tier).toBe('generic')
    })

    it('re-stamps against the CURRENT features directory, not the cached one', async () => {
      readCacheMock.mockReturnValue({
        result: result([
          { ...step('s1', 'features/steps/generic.steps.ts'), tier: 'generic' } as CatalogStep,
        ]),
      })

      // The workspace has since moved its features directory to e2e/, so that
      // file is no longer the provisioned one.
      const service = makeService({ steps: [], featuresDir: 'e2e' })
      const out = await service.getCached()

      expect(out?.steps[0]!.tier).toBe('project')
    })
  })
})
