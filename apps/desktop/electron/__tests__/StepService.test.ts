import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
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

  describe('parseArgs', () => {
    it('should parse string arguments', () => {
      // Access private method via casting
      const parseArgs = (service as unknown as { parseArgs: (pattern: string) => unknown[] }).parseArgs.bind(service)

      const args = parseArgs('I am on the {string} page')
      expect(args).toHaveLength(1)
      expect(args[0]).toEqual({ name: 'arg0', type: 'string', required: true })
    })

    it('should parse multiple arguments', () => {
      const parseArgs = (service as unknown as { parseArgs: (pattern: string) => unknown[] }).parseArgs.bind(service)

      const args = parseArgs('I fill {string} with {string}')
      expect(args).toHaveLength(2)
      expect(args[0]).toEqual({ name: 'arg0', type: 'string', required: true })
      expect(args[1]).toEqual({ name: 'arg1', type: 'string', required: true })
    })

    it('should parse int arguments', () => {
      const parseArgs = (service as unknown as { parseArgs: (pattern: string) => unknown[] }).parseArgs.bind(service)

      const args = parseArgs('I wait for {int} seconds')
      expect(args).toHaveLength(1)
      expect(args[0]).toEqual({ name: 'arg0', type: 'int', required: true })
    })

    it('should parse named arguments', () => {
      const parseArgs = (service as unknown as { parseArgs: (pattern: string) => unknown[] }).parseArgs.bind(service)

      const args = parseArgs('I fill {string:fieldName} with {string:value}')
      expect(args).toHaveLength(2)
      expect(args[0]).toEqual({ name: 'fieldName', type: 'string', required: true })
      expect(args[1]).toEqual({ name: 'value', type: 'string', required: true })
    })
  })

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
})
