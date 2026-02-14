import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Scenario, ScenarioStep } from '@suisui/shared'

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

    it('should not error on outline placeholder for int argument', async () => {
      const scenario: Scenario = {
        name: 'Outline Scenario',
        steps: [
          {
            id: 'step-1',
            keyword: 'Given',
            pattern: 'I wait for {int} seconds',
            args: [{ name: 'seconds', type: 'int', value: '<duration>' }],
          },
          {
            id: 'step-2',
            keyword: 'Then',
            pattern: 'I should see {string}',
            args: [{ name: 'text', type: 'string', value: '<message>' }],
          },
        ],
        examples: { columns: ['duration', 'message'], rows: [{ duration: '5', message: 'Done' }] },
      }

      const result = await service.validateScenario(scenario)

      const intErrors = result.issues.filter(i => i.message.includes('must be an integer'))
      expect(intErrors).toHaveLength(0)
    })

    it('should not error on outline placeholder for float argument', async () => {
      const scenario: Scenario = {
        name: 'Outline Scenario',
        steps: [
          {
            id: 'step-1',
            keyword: 'Given',
            pattern: 'the price is {float}',
            args: [{ name: 'price', type: 'float', value: '<amount>' }],
          },
          {
            id: 'step-2',
            keyword: 'Then',
            pattern: 'I should see {string}',
            args: [{ name: 'text', type: 'string', value: 'done' }],
          },
        ],
        examples: { columns: ['amount'], rows: [{ amount: '9.99' }] },
      }

      const result = await service.validateScenario(scenario)

      const floatErrors = result.issues.filter(i => i.message.includes('must be a number'))
      expect(floatErrors).toHaveLength(0)
    })

    it('should not error on outline placeholder as missing argument', async () => {
      const scenario: Scenario = {
        name: 'Outline Scenario',
        steps: [
          {
            id: 'step-1',
            keyword: 'Given',
            pattern: 'I am logged in as {string}',
            args: [{ name: 'role', type: 'string', value: '<role>' }],
          },
          {
            id: 'step-2',
            keyword: 'Then',
            pattern: 'I should see {string}',
            args: [{ name: 'text', type: 'string', value: 'Welcome' }],
          },
        ],
        examples: { columns: ['role'], rows: [{ role: 'admin' }] },
      }

      const result = await service.validateScenario(scenario)

      const missingErrors = result.issues.filter(i => i.message.includes('Missing required argument'))
      expect(missingErrors).toHaveLength(0)
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

  describe('validateBackground', () => {
    it('should pass with empty background', async () => {
      const result = await service.validateBackground([])

      expect(result.isValid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('should fail if background step argument is missing', async () => {
      const background: ScenarioStep[] = [
        {
          id: 'bg-step-1',
          keyword: 'Given',
          pattern: 'the application is on {string}',
          args: [{ name: 'page', type: 'string', value: '' }],
        },
      ]

      const result = await service.validateBackground(background)

      expect(result.isValid).toBe(false)
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: 'Missing required argument: page',
          stepId: 'bg-step-1',
        })
      )
    })

    it('should fail if background step has invalid int argument', async () => {
      const background: ScenarioStep[] = [
        {
          id: 'bg-step-1',
          keyword: 'Given',
          pattern: 'I have {int} items',
          args: [{ name: 'count', type: 'int', value: 'not-a-number' }],
        },
      ]

      const result = await service.validateBackground(background)

      expect(result.isValid).toBe(false)
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: 'Argument "count" must be an integer',
          stepId: 'bg-step-1',
        })
      )
    })

    it('should pass with valid background steps', async () => {
      const background: ScenarioStep[] = [
        {
          id: 'bg-step-1',
          keyword: 'Given',
          pattern: 'the application is running',
          args: [],
        },
        {
          id: 'bg-step-2',
          keyword: 'And',
          pattern: 'I am on the {string} page',
          args: [{ name: 'page', type: 'string', value: 'home' }],
        },
      ]

      const result = await service.validateBackground(background)

      expect(result.isValid).toBe(true)
      expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0)
    })
  })
})
