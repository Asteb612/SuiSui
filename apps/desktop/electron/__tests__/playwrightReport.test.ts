import { describe, it, expect } from 'vitest'
import {
  extractFeatureRelativePath,
  parsePlaywrightJsonReport,
} from '../utils/playwrightReport'

describe('extractFeatureRelativePath', () => {
  it('maps a generated spec path back to the feature path', () => {
    expect(
      extractFeatureRelativePath('.features-gen/features/auth/login.feature.spec.js'),
    ).toBe('features/auth/login.feature')
  })

  it('returns the input unchanged when it does not match', () => {
    expect(extractFeatureRelativePath('some/other/file.js')).toBe('some/other/file.js')
  })
})

describe('parsePlaywrightJsonReport', () => {
  it('returns an error result for invalid JSON', () => {
    const result = parsePlaywrightJsonReport('not json', 'raw out', '', 1234)
    expect(result.status).toBe('error')
    expect(result.featureResults).toEqual([])
    expect(result.duration).toBe(1234)
    expect(result.stderr).toBe('Failed to parse JSON reporter output')
  })

  it('aggregates nested suites into feature and scenario results', () => {
    const report = {
      stats: { duration: 4200 },
      suites: [
        {
          title: 'root',
          suites: [
            {
              title: 'login.feature',
              file: '.features-gen/features/auth/login.feature.spec.js',
              specs: [
                {
                  title: 'valid login',
                  ok: true,
                  tests: [{ results: [{ status: 'passed', duration: 100 }] }],
                },
                {
                  title: 'invalid login',
                  ok: false,
                  tests: [
                    {
                      results: [
                        { status: 'failed', duration: 50, errors: [{ message: 'expected true' }] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }

    const result = parsePlaywrightJsonReport(JSON.stringify(report), 'out', 'err', 9999)

    expect(result.status).toBe('failed')
    expect(result.duration).toBe(4200)
    expect(result.summary).toEqual({
      total: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
      features: 1,
    })
    expect(result.featureResults).toHaveLength(1)
    const feature = result.featureResults[0]
    expect(feature.relativePath).toBe('features/auth/login.feature')
    expect(feature.status).toBe('failed')
    expect(feature.duration).toBe(150)
    expect(feature.scenarioResults[1].error).toBe('expected true')
  })

  it('marks a feature skipped when all scenarios are skipped', () => {
    const report = {
      suites: [
        {
          title: 'root',
          file: '.features-gen/features/x.feature.spec.ts',
          specs: [
            {
              title: 'pending',
              ok: true,
              tests: [{ results: [{ status: 'skipped', duration: 0 }] }],
            },
          ],
        },
      ],
    }

    const result = parsePlaywrightJsonReport(JSON.stringify(report), '', '', 10)
    expect(result.status).toBe('passed')
    expect(result.featureResults[0].status).toBe('skipped')
    expect(result.summary.skipped).toBe(1)
  })

  it('falls back to the measured duration when stats are absent', () => {
    const result = parsePlaywrightJsonReport(JSON.stringify({ suites: [] }), '', '', 777)
    expect(result.duration).toBe(777)
    expect(result.status).toBe('passed')
    expect(result.summary.features).toBe(0)
  })
})
