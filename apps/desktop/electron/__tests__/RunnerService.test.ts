import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RunnerService } from '../services/RunnerService'
import { FakeCommandRunner } from '../services/CommandRunner'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

// Mock dependent services
vi.mock('../services/WorkspaceService', () => ({
  getWorkspaceService: vi.fn(),
}))

vi.mock('../services/DependencyService', () => ({
  getDependencyService: vi.fn(() => ({
    checkStatus: vi.fn(() => ({ needsInstall: false })),
    install: vi.fn(),
  })),
}))

vi.mock('../services/NodeService', () => ({
  getNodeService: vi.fn(() => ({
    getNodePath: vi.fn(() => '/usr/bin/node'),
  })),
}))

vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('../utils/bddgenErrorParser', () => ({
  parseBddgenErrors: vi.fn(() => []),
  getErrorSummary: vi.fn(() => ''),
}))

describe('RunnerService', () => {
  let tempDir: string
  let fakeRunner: FakeCommandRunner
  let service: RunnerService

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-runner-test-'))
    fakeRunner = new FakeCommandRunner()
    service = new RunnerService(fakeRunner)

    const { getWorkspaceService } = await import('../services/WorkspaceService')
    vi.mocked(getWorkspaceService).mockReturnValue({
      getPath: () => tempDir,
      getFeaturesDir: async () => 'features',
    } as ReturnType<typeof getWorkspaceService>)

    // Create features directory and node_modules with CLI stubs
    await fs.mkdir(path.join(tempDir, 'features'), { recursive: true })
    await fs.mkdir(path.join(tempDir, 'node_modules', 'playwright-bdd', 'dist', 'cli'), {
      recursive: true,
    })
    await fs.writeFile(
      path.join(tempDir, 'node_modules', 'playwright-bdd', 'dist', 'cli', 'index.js'),
      '',
    )
    await fs.mkdir(path.join(tempDir, 'node_modules', '@playwright', 'test'), { recursive: true })
    await fs.writeFile(path.join(tempDir, 'node_modules', '@playwright', 'test', 'cli.js'), '')
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('getWorkspaceTests', () => {
    it('should return empty result when no feature files exist', async () => {
      const result = await service.getWorkspaceTests()
      expect(result.features).toHaveLength(0)
      expect(result.allTags).toHaveLength(0)
      expect(result.folders).toHaveLength(0)
    })

    it('should parse a simple feature file', async () => {
      await fs.writeFile(
        path.join(tempDir, 'features', 'login.feature'),
        `Feature: Login
  Scenario: Successful login
    Given I am on the login page
    When I enter valid credentials
    Then I should be logged in`,
      )

      const result = await service.getWorkspaceTests()
      expect(result.features).toHaveLength(1)
      expect(result.features[0].name).toBe('Login')
      expect(result.features[0].relativePath).toBe('features/login.feature')
      expect(result.features[0].folder).toBe('features')
      expect(result.features[0].scenarios).toHaveLength(1)
      expect(result.features[0].scenarios[0].name).toBe('Successful login')
    })

    it('should extract feature-level tags', async () => {
      await fs.writeFile(
        path.join(tempDir, 'features', 'login.feature'),
        `@smoke @auth
Feature: Login
  Scenario: User logs in
    Given something`,
      )

      const result = await service.getWorkspaceTests()
      expect(result.features[0].tags).toEqual(['smoke', 'auth'])
      expect(result.allTags).toContain('smoke')
      expect(result.allTags).toContain('auth')
    })

    it('should extract scenario-level tags and inherit feature tags', async () => {
      await fs.writeFile(
        path.join(tempDir, 'features', 'login.feature'),
        `@auth
Feature: Login

  @smoke
  Scenario: Quick login
    Given something

  @regression
  Scenario: Full login flow
    Given something`,
      )

      const result = await service.getWorkspaceTests()
      const feature = result.features[0]
      expect(feature.scenarios).toHaveLength(2)
      // Quick login inherits @auth and has its own @smoke
      expect(feature.scenarios[0].tags).toEqual(['auth', 'smoke'])
      // Full login flow inherits @auth and has its own @regression
      expect(feature.scenarios[1].tags).toEqual(['auth', 'regression'])
      expect(result.allTags).toEqual(['auth', 'regression', 'smoke'])
    })

    it('should handle multiple feature files in nested folders', async () => {
      await fs.mkdir(path.join(tempDir, 'features', 'auth'), { recursive: true })
      await fs.mkdir(path.join(tempDir, 'features', 'checkout'), { recursive: true })

      await fs.writeFile(
        path.join(tempDir, 'features', 'auth', 'login.feature'),
        `Feature: Login
  Scenario: User logs in
    Given something`,
      )

      await fs.writeFile(
        path.join(tempDir, 'features', 'checkout', 'cart.feature'),
        `@checkout
Feature: Shopping Cart
  Scenario: Add item to cart
    Given something`,
      )

      await fs.writeFile(
        path.join(tempDir, 'features', 'home.feature'),
        `Feature: Home
  Scenario: View home page
    Given something`,
      )

      const result = await service.getWorkspaceTests()
      expect(result.features).toHaveLength(3)
      expect(result.folders).toContain('features')
      expect(result.folders).toContain('features/auth')
      expect(result.folders).toContain('features/checkout')
    })

    it('should handle Scenario Outline', async () => {
      await fs.writeFile(
        path.join(tempDir, 'features', 'search.feature'),
        `Feature: Search
  Scenario Outline: Search for <term>
    Given I search for "<term>"

    Examples:
      | term   |
      | apples |
      | oranges |`,
      )

      const result = await service.getWorkspaceTests()
      expect(result.features[0].scenarios).toHaveLength(1)
      expect(result.features[0].scenarios[0].name).toBe('Search for <term>')
    })

    it('should return empty when workspace has no path', async () => {
      const { getWorkspaceService } = await import('../services/WorkspaceService')
      vi.mocked(getWorkspaceService).mockReturnValue({
        getPath: () => null,
        getFeaturesDir: async () => 'features',
      } as ReturnType<typeof getWorkspaceService>)

      const result = await service.getWorkspaceTests()
      expect(result.features).toHaveLength(0)
    })

    it('should ignore non-feature files', async () => {
      await fs.writeFile(path.join(tempDir, 'features', 'readme.md'), '# README')
      await fs.writeFile(
        path.join(tempDir, 'features', 'login.feature'),
        'Feature: Login\n  Scenario: Test\n    Given something',
      )

      const result = await service.getWorkspaceTests()
      expect(result.features).toHaveLength(1)
    })
  })

  describe('runBatch', () => {
    const sampleJsonReport = JSON.stringify({
      suites: [
        {
          title: '',
          suites: [
            {
              title: 'Login',
              file: '.features-gen/features/auth/login.feature.spec.js',
              specs: [
                {
                  title: 'User logs in',
                  ok: true,
                  tests: [
                    {
                      expectedStatus: 'passed',
                      status: 'expected',
                      results: [{ status: 'passed', duration: 1500, errors: [] }],
                    },
                  ],
                },
              ],
            },
            {
              title: 'Cart',
              file: '.features-gen/features/checkout/cart.feature.spec.js',
              specs: [
                {
                  title: 'Add item',
                  ok: false,
                  tests: [
                    {
                      expectedStatus: 'passed',
                      status: 'unexpected',
                      results: [
                        {
                          status: 'failed',
                          duration: 2000,
                          errors: [{ message: 'Element not found' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      stats: { startTime: '2026-03-02', duration: 3500, expected: 1, unexpected: 1, skipped: 0, flaky: 0 },
    })

    it('should run batch with no filters (run all)', async () => {
      fakeRunner.setDefaultResponse({ code: 0, stdout: '', stderr: '' }) // bddgen
      fakeRunner.setResponse('cli.js test', { code: 0, stdout: sampleJsonReport, stderr: '' })

      const result = await service.runBatch({
        executionMode: 'sequential',
        mode: 'headless',
      })

      expect(result.status).toBe('failed') // one scenario failed
      expect(result.featureResults).toHaveLength(2)
      expect(result.summary.total).toBe(2)
      expect(result.summary.passed).toBe(1)
      expect(result.summary.failed).toBe(1)
    })

    it('should pass feature paths as positional args', async () => {
      fakeRunner.setDefaultResponse({ code: 0, stdout: sampleJsonReport, stderr: '' })

      await service.runBatch({
        featurePaths: ['features/auth/login.feature', 'features/checkout/cart.feature'],
        executionMode: 'sequential',
        mode: 'headless',
      })

      // Check that playwright was called with converted spec paths
      // bddgen is callHistory[0], playwright is callHistory[1]
      const playwrightCall = fakeRunner.callHistory[1]
      expect(playwrightCall).toBeDefined()
      const argsStr = playwrightCall!.args.join(' ')
      expect(argsStr).toContain('.features-gen/features/auth/login.feature.spec.js')
      expect(argsStr).toContain('.features-gen/features/checkout/cart.feature.spec.js')
    })

    it('should add --grep for tag filtering', async () => {
      fakeRunner.setDefaultResponse({ code: 0, stdout: sampleJsonReport, stderr: '' })

      await service.runBatch({
        tags: ['smoke', 'auth'],
        executionMode: 'sequential',
        mode: 'headless',
      })

      // bddgen is callHistory[0], playwright is callHistory[1]
      const playwrightCall = fakeRunner.callHistory[1]
      const argsStr = playwrightCall!.args.join(' ')
      expect(argsStr).toContain('--grep')
      expect(argsStr).toContain('@smoke|@auth')
    })

    it('should add --grep for name filtering', async () => {
      fakeRunner.setDefaultResponse({ code: 0, stdout: sampleJsonReport, stderr: '' })

      await service.runBatch({
        nameFilter: 'login',
        executionMode: 'sequential',
        mode: 'headless',
      })

      // bddgen is callHistory[0], playwright is callHistory[1]
      const playwrightCall = fakeRunner.callHistory[1]
      const argsStr = playwrightCall!.args.join(' ')
      expect(argsStr).toContain('--grep')
      expect(argsStr).toContain('login')
    })

    it('should use --workers=1 for sequential mode', async () => {
      fakeRunner.setDefaultResponse({ code: 0, stdout: sampleJsonReport, stderr: '' })

      await service.runBatch({
        executionMode: 'sequential',
        mode: 'headless',
      })

      // bddgen is callHistory[0], playwright is callHistory[1]
      const playwrightCall = fakeRunner.callHistory[1]
      const argsStr = playwrightCall!.args.join(' ')
      expect(argsStr).toContain('--workers=1')
    })

    it('should not use --workers=1 for parallel mode', async () => {
      fakeRunner.setDefaultResponse({ code: 0, stdout: sampleJsonReport, stderr: '' })

      await service.runBatch({
        executionMode: 'parallel',
        mode: 'headless',
      })

      // bddgen is callHistory[0], playwright is callHistory[1]
      const playwrightCall = fakeRunner.callHistory[1]
      const argsStr = playwrightCall!.args.join(' ')
      expect(argsStr).not.toContain('--workers=1')
    })

    it('should use --reporter=json,html for headless mode', async () => {
      fakeRunner.setDefaultResponse({ code: 0, stdout: sampleJsonReport, stderr: '' })

      await service.runBatch({
        executionMode: 'sequential',
        mode: 'headless',
      })

      // bddgen is callHistory[0], playwright is callHistory[1]
      const playwrightCall = fakeRunner.callHistory[1]
      const argsStr = playwrightCall!.args.join(' ')
      expect(argsStr).toContain('--reporter=json,html')
    })

    it('should add --ui for ui mode and skip json reporter', async () => {
      fakeRunner.setDefaultResponse({ code: 0, stdout: '', stderr: '' })

      await service.runBatch({
        executionMode: 'sequential',
        mode: 'ui',
      })

      // bddgen is callHistory[0], playwright is callHistory[1]
      const playwrightCall = fakeRunner.callHistory[1]
      const argsStr = playwrightCall!.args.join(' ')
      expect(argsStr).toContain('--ui')
      expect(argsStr).not.toContain('--reporter')
    })

    it('should return error when bddgen fails', async () => {
      fakeRunner.setDefaultResponse({
        code: 1,
        stdout: '',
        stderr: 'bddgen generation failed',
      })

      const result = await service.runBatch({
        executionMode: 'sequential',
        mode: 'headless',
      })

      expect(result.status).toBe('error')
      expect(result.stderr).toContain('bddgen generation failed')
    })

    it('should return error when no workspace selected', async () => {
      const { getWorkspaceService } = await import('../services/WorkspaceService')
      vi.mocked(getWorkspaceService).mockReturnValue({
        getPath: () => null,
        getFeaturesDir: async () => 'features',
      } as ReturnType<typeof getWorkspaceService>)

      const result = await service.runBatch({
        executionMode: 'sequential',
        mode: 'headless',
      })

      expect(result.status).toBe('error')
      expect(result.stderr).toContain('No workspace selected')
    })

    it('should parse feature and scenario results from JSON report', async () => {
      fakeRunner.setDefaultResponse({ code: 0, stdout: '', stderr: '' })
      fakeRunner.setResponse('cli.js test', { code: 1, stdout: sampleJsonReport, stderr: '' })

      const result = await service.runBatch({
        executionMode: 'sequential',
        mode: 'headless',
      })

      // Feature results
      expect(result.featureResults).toHaveLength(2)

      const loginFeature = result.featureResults.find((f) =>
        f.relativePath.includes('login.feature'),
      )
      expect(loginFeature).toBeDefined()
      expect(loginFeature!.status).toBe('passed')
      expect(loginFeature!.scenarioResults).toHaveLength(1)
      expect(loginFeature!.scenarioResults[0].name).toBe('User logs in')
      expect(loginFeature!.scenarioResults[0].status).toBe('passed')

      const cartFeature = result.featureResults.find((f) =>
        f.relativePath.includes('cart.feature'),
      )
      expect(cartFeature).toBeDefined()
      expect(cartFeature!.status).toBe('failed')
      expect(cartFeature!.scenarioResults[0].error).toBe('Element not found')
    })

    it('should combine tag and name filters with AND logic', async () => {
      fakeRunner.setDefaultResponse({ code: 0, stdout: sampleJsonReport, stderr: '' })

      await service.runBatch({
        tags: ['smoke'],
        nameFilter: 'login',
        executionMode: 'sequential',
        mode: 'headless',
      })

      // bddgen is callHistory[0], playwright is callHistory[1]
      const playwrightCall = fakeRunner.callHistory[1]
      const grepIdx = playwrightCall.args.indexOf('--grep')
      const grepArg = playwrightCall.args[grepIdx + 1]
      // Should use lookaheads for AND logic
      expect(grepArg).toContain('(?=')
      expect(grepArg).toContain('@smoke')
      expect(grepArg).toContain('login')
    })

    it('should normalize base URL', async () => {
      fakeRunner.setDefaultResponse({ code: 0, stdout: sampleJsonReport, stderr: '' })

      await service.runBatch({
        executionMode: 'sequential',
        mode: 'headless',
        baseUrl: 'localhost:3000',
      })

      // Check that bddgen was called with normalized BASE_URL
      const bddgenCall = fakeRunner.callHistory[0]
      expect(bddgenCall.options?.env?.BASE_URL).toBe('https://localhost:3000')
    })

    it('should not set FEATURE env var (generates all features)', async () => {
      fakeRunner.setDefaultResponse({ code: 0, stdout: sampleJsonReport, stderr: '' })

      await service.runBatch({
        executionMode: 'sequential',
        mode: 'headless',
      })

      // bddgen call should not have FEATURE env var
      const bddgenCall = fakeRunner.callHistory[0]
      expect(bddgenCall.options?.env?.FEATURE).toBeUndefined()
    })
  })
})
