import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StepService } from '../services/StepService'
import { FakeCommandRunner } from '../services/CommandRunner'

vi.mock('../services/WorkspaceService', () => ({
  getWorkspaceService: () => ({
    getPath: () => '/test/workspace',
  }),
}))

describe('StepService', () => {
  let service: StepService
  let runner: FakeCommandRunner

  beforeEach(() => {
    runner = new FakeCommandRunner()
    service = new StepService(runner)
  })

  describe('export', () => {
    it('should parse bddgen export output', async () => {
      const bddgenOutput = JSON.stringify({
        steps: [
          { keyword: 'Given', pattern: 'I am on the {string} page', location: 'steps/nav.ts:10' },
          { keyword: 'When', pattern: 'I click on {string}', location: 'steps/actions.ts:5' },
          { keyword: 'Then', pattern: 'I should see {string}', location: 'steps/assertions.ts:8' },
        ],
      })

      runner.setResponse('bddgen export', {
        code: 0,
        stdout: bddgenOutput,
        stderr: '',
      })

      const result = await service.export()

      expect(result.steps).toHaveLength(3)
      const firstStep = result.steps[0]!
      expect(firstStep.keyword).toBe('Given')
      expect(firstStep.pattern).toBe('I am on the {string} page')
      expect(firstStep.args).toHaveLength(1)
      expect(firstStep.args[0]!.type).toBe('string')
    })

    it('should parse step arguments correctly', async () => {
      const bddgenOutput = JSON.stringify({
        steps: [
          { keyword: 'When', pattern: 'I wait for {int} seconds', location: 'steps/wait.ts:1' },
          {
            keyword: 'When',
            pattern: 'I fill {string} with {string}',
            location: 'steps/form.ts:1',
          },
        ],
      })

      runner.setResponse('bddgen export', {
        code: 0,
        stdout: bddgenOutput,
        stderr: '',
      })

      const result = await service.export()

      const firstStep = result.steps[0]!
      expect(firstStep.args).toHaveLength(1)
      expect(firstStep.args[0]!.type).toBe('int')

      const secondStep = result.steps[1]!
      expect(secondStep.args).toHaveLength(2)
      expect(secondStep.args[0]!.type).toBe('string')
      expect(secondStep.args[1]!.type).toBe('string')
    })

    it('should throw error on bddgen failure', async () => {
      runner.setResponse('bddgen export', {
        code: 1,
        stdout: '',
        stderr: 'bddgen not found',
      })

      await expect(service.export()).rejects.toThrow('Failed to export steps')
    })

    it('should cache the result', async () => {
      const bddgenOutput = JSON.stringify({ steps: [] })
      runner.setResponse('bddgen export', { code: 0, stdout: bddgenOutput, stderr: '' })

      await service.export()
      const cached = await service.getCached()

      expect(cached).not.toBeNull()
      expect(cached?.exportedAt).toBeDefined()
    })
  })

  describe('getStepsByKeyword', () => {
    it('should filter steps by keyword', async () => {
      const bddgenOutput = JSON.stringify({
        steps: [
          { keyword: 'Given', pattern: 'step 1', location: 'a.ts:1' },
          { keyword: 'Given', pattern: 'step 2', location: 'a.ts:2' },
          { keyword: 'When', pattern: 'step 3', location: 'a.ts:3' },
          { keyword: 'Then', pattern: 'step 4', location: 'a.ts:4' },
        ],
      })

      runner.setResponse('bddgen export', { code: 0, stdout: bddgenOutput, stderr: '' })
      await service.export()

      const givenSteps = service.getStepsByKeyword('Given')
      const whenSteps = service.getStepsByKeyword('When')
      const thenSteps = service.getStepsByKeyword('Then')

      expect(givenSteps).toHaveLength(2)
      expect(whenSteps).toHaveLength(1)
      expect(thenSteps).toHaveLength(1)
    })
  })

  describe('clearCache', () => {
    it('should clear the cached steps', async () => {
      const bddgenOutput = JSON.stringify({ steps: [] })
      runner.setResponse('bddgen export', { code: 0, stdout: bddgenOutput, stderr: '' })

      await service.export()
      service.clearCache()

      const cached = await service.getCached()
      expect(cached).toBeNull()
    })
  })
})
