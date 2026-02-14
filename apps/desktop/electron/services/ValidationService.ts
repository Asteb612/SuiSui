import type { Scenario, ValidationResult, ValidationIssue, StepExportResult, ScenarioStep } from '@suisui/shared'
import { patternToRegex, resolvePattern, getOutlinePlaceholder } from '@suisui/shared'
import { getStepService } from './StepService'

export class ValidationService {
  async validateScenario(scenario: Scenario): Promise<ValidationResult> {
    const issues: ValidationIssue[] = []

    if (!scenario.name || scenario.name.trim() === '') {
      issues.push({
        severity: 'error',
        message: 'Scenario name is required',
        field: 'name',
      })
    }

    if (scenario.steps.length === 0) {
      issues.push({
        severity: 'error',
        message: 'Scenario must have at least one step',
      })
    }

    const stepService = getStepService()
    const cachedSteps = await stepService.getCached()

    let hasGiven = false
    let hasWhen = false
    let hasThen = false

    for (const step of scenario.steps) {
      if (step.keyword === 'Given') hasGiven = true
      if (step.keyword === 'When') hasWhen = true// eslint-disable-line @typescript-eslint/no-unused-vars
      if (step.keyword === 'Then') hasThen = true

      this.validateStepArguments(step, issues)
      this.validateStepDefinition(step, cachedSteps, issues)
    }

    if (!hasGiven && scenario.steps.length > 0) {
      issues.push({
        severity: 'warning',
        message: 'Scenario should start with a Given step',
      })
    }

    if (!hasThen && scenario.steps.length > 0) {
      issues.push({
        severity: 'warning',
        message: 'Scenario should have at least one Then step for assertions',
      })
    }

    this.checkForAmbiguities(scenario, cachedSteps, issues)

    return {
      isValid: !issues.some((i) => i.severity === 'error'),
      issues,
    }
  }

  async validateBackground(background: ScenarioStep[]): Promise<ValidationResult> {
    const issues: ValidationIssue[] = []

    if (background.length === 0) {
      return { isValid: true, issues: [] }
    }

    const stepService = getStepService()
    const cachedSteps = await stepService.getCached()

    for (const step of background) {
      this.validateStepArguments(step, issues)
      this.validateStepDefinition(step, cachedSteps, issues)
    }

    this.checkForAmbiguities({ name: '', steps: background }, cachedSteps, issues)

    return {
      isValid: !issues.some((i) => i.severity === 'error'),
      issues,
    }
  }

  private validateStepArguments(step: ScenarioStep, issues: ValidationIssue[]): void {
    for (const arg of step.args) {
      if (arg.value === '' || arg.value === undefined) {
        issues.push({
          severity: 'error',
          message: `Missing required argument: ${arg.name}`,
          stepId: step.id,
          field: arg.name,
        })
      }

      if (arg.type === 'int' && arg.value && !getOutlinePlaceholder(arg.value) && isNaN(parseInt(arg.value, 10))) {
        issues.push({
          severity: 'error',
          message: `Argument "${arg.name}" must be an integer`,
          stepId: step.id,
          field: arg.name,
        })
      }

      if (arg.type === 'float' && arg.value && !getOutlinePlaceholder(arg.value) && isNaN(parseFloat(arg.value))) {
        issues.push({
          severity: 'error',
          message: `Argument "${arg.name}" must be a number`,
          stepId: step.id,
          field: arg.name,
        })
      }
    }
  }

  private validateStepDefinition(
    step: ScenarioStep,
    cachedSteps: StepExportResult | null,
    issues: ValidationIssue[]
  ): void {
    if (cachedSteps) {
      const matchingStep = cachedSteps.steps.find((s) => s.pattern === step.pattern)
      if (!matchingStep) {
        issues.push({
          severity: 'warning',
          message: `Step not found in exported definitions: "${step.pattern}"`,
          stepId: step.id,
        })
      }
    }
  }

  private checkForAmbiguities(
    scenario: Scenario,
    cachedSteps: StepExportResult | null,
    issues: ValidationIssue[]
  ): void {
    if (!cachedSteps) {
      return
    }

    for (const step of scenario.steps) {
      const stepText = resolvePattern(step.pattern, step.args)
      const matchingSteps = cachedSteps.steps.filter((s) => {
        const regex = patternToRegex(s.pattern)
        return regex.test(stepText)
      })

      if (matchingSteps.length > 1) {
        issues.push({
          severity: 'warning',
          message: `Ambiguous step: matches ${matchingSteps.length} definitions`,
          stepId: step.id,
        })
      }
    }
  }

}

let validationServiceInstance: ValidationService | null = null

export function getValidationService(): ValidationService {
  if (!validationServiceInstance) {
    validationServiceInstance = new ValidationService()
  }
  return validationServiceInstance
}
