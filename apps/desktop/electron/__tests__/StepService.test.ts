import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { parseArgs } from '@suisui/shared'
import { StepService, resetStepService } from '../services/StepService'

// Mock electron app
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/mock/app/path',
  },
}))

// Mock workspace service
vi.mock('../services/WorkspaceService', () => ({
  getWorkspaceService: () => ({
    getPath: () => '/test/workspace',
  }),
}))

// Mock fs
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn((p: string) => {
      // Bundle exists
      if (p.includes('playwright-bdd-bundle.js')) return true
      // Playwright config exists
      if (p.includes('playwright.config.ts')) return true
      // Default for node_modules checks
      if (p.includes('node_modules')) return true
      return false
    }),
  },
}))

// Mock the bundled playwright-bdd
const mockExtractSteps = vi.fn()
const mockLoadConfig = vi.fn()
const mockGetEnvConfigs = vi.fn()

vi.mock('/mock/app/path/bundled-deps/playwright-bdd-bundle.js', () => ({
  loadConfig: mockLoadConfig,
  getEnvConfigs: mockGetEnvConfigs,
  TestFilesGenerator: class {
    extractSteps = mockExtractSteps
  },
}))

describe('StepService', () => {
  let service: StepService
  const originalChdir = process.chdir
  const originalCwd = process.cwd

  beforeEach(() => {
    resetStepService()
    service = new StepService()
    vi.clearAllMocks()

    // Mock process.chdir to not actually change directory
    process.chdir = vi.fn()
    process.cwd = vi.fn(() => '/test/workspace')

    // Setup default mock returns
    mockLoadConfig.mockResolvedValue(undefined)
    mockGetEnvConfigs.mockReturnValue({
      default: { outputDir: '.features-gen' },
    })
    mockExtractSteps.mockResolvedValue([])
  })

  afterEach(() => {
    process.chdir = originalChdir
    process.cwd = originalCwd
  })

  // parseArgs tests have moved to packages/shared/src/patterns/__tests__/processor.test.ts
  // StepService now delegates to the shared parseArgs function

  describe('parseDecorator', () => {
    it('should extract decorator from pattern', () => {
      const parseDecorator = (service as unknown as { parseDecorator: (pattern: string) => string | undefined }).parseDecorator.bind(service)

      expect(parseDecorator('@login I am logged in')).toBe('login')
      expect(parseDecorator('@setup the database is ready')).toBe('setup')
    })

    it('should return undefined for patterns without decorator', () => {
      const parseDecorator = (service as unknown as { parseDecorator: (pattern: string) => string | undefined }).parseDecorator.bind(service)

      expect(parseDecorator('I am on the home page')).toBeUndefined()
    })
  })

  describe('getStepsByKeyword', () => {
    it('should return empty array when no cache', () => {
      const givenSteps = service.getStepsByKeyword('Given')
      expect(givenSteps).toHaveLength(0)
    })
  })

  describe('findMatchingStep', () => {
    it('should return undefined when no cache', () => {
      const step = service.findMatchingStep('some pattern')
      expect(step).toBeUndefined()
    })
  })

  describe('getCached', () => {
    it('should return null initially', async () => {
      const cached = await service.getCached()
      expect(cached).toBeNull()
    })
  })

  describe('clearCache', () => {
    it('should clear the cache', async () => {
      // Set up a cached value by directly setting it
      // We need to use any here since cache is private
      (service as unknown as { cache: unknown }).cache = {
        steps: [],
        decorators: [],
        exportedAt: new Date().toISOString(),
      }

      service.clearCache()
      const cached = await service.getCached()
      expect(cached).toBeNull()
    })
  })

  describe('getDecorators', () => {
    it('should return empty array when no cache', async () => {
      const decorators = await service.getDecorators()
      expect(decorators).toHaveLength(0)
    })
  })

  describe('parseExportOutput — regex step patterns', () => {
    function callParseExportOutput(output: string) {
      return (service as unknown as { parseExportOutput: (output: string) => Array<{ keyword: string; pattern: string; location: string }> }).parseExportOutput(output)
    }

    it('should parse simple string step patterns', () => {
      const output = [
        'List of all steps (3):',
        '* Given I am on the home page',
        '* When I click on {string}',
        '* Then I should see {string}',
      ].join('\n')

      const steps = callParseExportOutput(output)
      expect(steps).toHaveLength(3)
      expect(steps[0]).toEqual({ keyword: 'Given', pattern: 'I am on the home page', location: '' })
      expect(steps[1]).toEqual({ keyword: 'When', pattern: 'I click on {string}', location: '' })
    })

    it('should parse regex patterns with anchors (enum alternation)', () => {
      const output = [
        'List of all steps (1):',
        '* Given ^I am logged in as (manager|internal seller)$',
      ].join('\n')

      const steps = callParseExportOutput(output)
      console.log('[DIAG] parseExportOutput for regex enum:', JSON.stringify(steps))
      expect(steps).toHaveLength(1)
      expect(steps[0]!.keyword).toBe('Given')
      expect(steps[0]!.pattern).toBe('^I am logged in as (manager|internal seller)$')
    })

    it('should parse regex patterns with capture groups', () => {
      const output = [
        'List of all steps (3):',
        '* When ^I click on "([^"]*)"$',
        '* Then ^I should see (\\d+) items$',
        '* When ^I fill "([^"]*)" with "([^"]*)"$',
      ].join('\n')

      const steps = callParseExportOutput(output)
      console.log('[DIAG] parseExportOutput for regex captures:', JSON.stringify(steps))
      expect(steps).toHaveLength(3)
      expect(steps[0]!.pattern).toBe('^I click on "([^"]*)"$')
      expect(steps[1]!.pattern).toBe('^I should see (\\d+) items$')
      expect(steps[2]!.pattern).toBe('^I fill "([^"]*)" with "([^"]*)"$')
    })

    it('should parse mixed string and regex patterns', () => {
      const output = [
        'List of all steps (4):',
        '* Given I am on {string} page',
        '* Given ^I am logged in as (admin|user|guest)$',
        '* When I click on {string}',
        '* When ^I type "([^"]*)" into "([^"]*)"$',
      ].join('\n')

      const steps = callParseExportOutput(output)
      console.log('[DIAG] parseExportOutput mixed:', JSON.stringify(steps))
      expect(steps).toHaveLength(4)
      // String patterns
      expect(steps[0]!.pattern).toBe('I am on {string} page')
      // Regex patterns
      expect(steps[1]!.pattern).toBe('^I am logged in as (admin|user|guest)$')
      expect(steps[3]!.pattern).toBe('^I type "([^"]*)" into "([^"]*)"$')
    })

    it('full pipeline: regex enum pattern → parseArgs → step definition', () => {
      const output = '* Given ^I am logged in as (manager|internal seller)$'
      const steps = callParseExportOutput(output)
      expect(steps).toHaveLength(1)

      const step = steps[0]!
      const args = parseArgs(step.pattern)
      console.log('[DIAG] full pipeline — regex enum args:', JSON.stringify(args))

      expect(args).toHaveLength(1)
      expect(args[0].type).toBe('enum')
      expect(args[0].enumValues).toContain('manager')
      expect(args[0].enumValues).toContain('internal seller')
    })

    it('full pipeline: regex capture group → parseArgs → step definition', () => {
      const output = '* When ^I click on "([^"]*)"$'
      const steps = callParseExportOutput(output)
      expect(steps).toHaveLength(1)

      const step = steps[0]!
      const args = parseArgs(step.pattern)
      console.log('[DIAG] full pipeline — regex capture args:', JSON.stringify(args))
      console.log('[DIAG] Number of args detected:', args.length)
      // This reveals whether capture groups like ([^"]*) are detected
    })

    it('full pipeline: regex \\d+ capture → parseArgs → step definition', () => {
      const output = '* Then ^I should see (\\d+) items$'
      const steps = callParseExportOutput(output)
      expect(steps).toHaveLength(1)

      const step = steps[0]!
      const args = parseArgs(step.pattern)
      console.log('[DIAG] full pipeline — regex \\d+ args:', JSON.stringify(args))
      console.log('[DIAG] Number of args detected:', args.length)
    })
  })
})
