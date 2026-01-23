import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Scenario } from '@suisui/shared'

vi.mock('../services/StepService', () => ({
  getStepService: () => ({
    getCached: () => Promise.resolve(null),
  }),
}))

const { ValidationService } = await import('../services/ValidationService')

describe('ValidationService', () => {
  let service: InstanceType<typeof ValidationService>

  beforeEach(() => {
    service = new ValidationService()
  })

  describe('validateScenario', () => {
    it('should fail if scenario name is empty', async () => {
      const scenario: Scenario = {
        name: '',
        steps: [],
      }

      const result = await service.validateScenario(scenario)

      expect(result.isValid).toBe(false)
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: 'Scenario name is required',
        })
      )
    })

    it('should fail if scenario has no steps', async () => {
      const scenario: Scenario = {
        name: 'Test Scenario',
        steps: [],
      }

      const result = await service.validateScenario(scenario)

      expect(result.isValid).toBe(false)
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: 'Scenario must have at least one step',
        })
      )
    })

    it('should fail if required argument is missing', async () => {
      const scenario: Scenario = {
        name: 'Test Scenario',
        steps: [
          {
            id: 'step-1',
            keyword: 'Given',
            pattern: 'I am on the {string} page',
            args: [{ name: 'page', type: 'string', value: '' }],
          },
        ],
      }

      const result = await service.validateScenario(scenario)

      expect(result.isValid).toBe(false)
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: 'Missing required argument: page',
          stepId: 'step-1',
        })
      )
    })

    it('should fail if int argument is not a number', async () => {
      const scenario: Scenario = {
        name: 'Test Scenario',
        steps: [
          {
            id: 'step-1',
            keyword: 'When',
            pattern: 'I wait for {int} seconds',
            args: [{ name: 'seconds', type: 'int', value: 'abc' }],
          },
        ],
      }

      const result = await service.validateScenario(scenario)

      expect(result.isValid).toBe(false)
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: 'Argument "seconds" must be an integer',
        })
      )
    })

    it('should warn if no Given step', async () => {
      const scenario: Scenario = {
        name: 'Test Scenario',
        steps: [
          {
            id: 'step-1',
            keyword: 'When',
            pattern: 'I click on {string}',
            args: [{ name: 'element', type: 'string', value: 'button' }],
          },
        ],
      }

      const result = await service.validateScenario(scenario)

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          message: 'Scenario should start with a Given step',
        })
      )
    })

    it('should warn if no Then step', async () => {
      const scenario: Scenario = {
        name: 'Test Scenario',
        steps: [
          {
            id: 'step-1',
            keyword: 'Given',
            pattern: 'I am on the {string} page',
            args: [{ name: 'page', type: 'string', value: 'home' }],
          },
        ],
      }

      const result = await service.validateScenario(scenario)

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          message: 'Scenario should have at least one Then step for assertions',
        })
      )
    })

    it('should pass with valid scenario', async () => {
      const scenario: Scenario = {
        name: 'Valid Scenario',
        steps: [
          {
            id: 'step-1',
            keyword: 'Given',
            pattern: 'I am on the {string} page',
            args: [{ name: 'page', type: 'string', value: 'home' }],
          },
          {
            id: 'step-2',
            keyword: 'When',
            pattern: 'I click on {string}',
            args: [{ name: 'element', type: 'string', value: 'login' }],
          },
          {
            id: 'step-3',
            keyword: 'Then',
            pattern: 'I should see {string}',
            args: [{ name: 'text', type: 'string', value: 'Welcome' }],
          },
        ],
      }

      const result = await service.validateScenario(scenario)

      expect(result.isValid).toBe(true)
      expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0)
    })
  })
})
