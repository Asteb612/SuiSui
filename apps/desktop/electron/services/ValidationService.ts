import type { Scenario, ValidationResult, ValidationIssue, StepExportResult } from '@suisui/shared'
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
      if (step.keyword === 'When') hasWhen = true
      if (step.keyword === 'Then') hasThen = true

      for (const arg of step.args) {
        if (arg.value === '' || arg.value === undefined) {
          issues.push({
            severity: 'error',
            message: `Missing required argument: ${arg.name}`,
            stepId: step.id,
            field: arg.name,
          })
        }

        if (arg.type === 'int' && arg.value && isNaN(parseInt(arg.value, 10))) {
          issues.push({
            severity: 'error',
            message: `Argument "${arg.name}" must be an integer`,
            stepId: step.id,
            field: arg.name,
          })
        }

        if (arg.type === 'float' && arg.value && isNaN(parseFloat(arg.value))) {
          issues.push({
            severity: 'error',
            message: `Argument "${arg.name}" must be a number`,
            stepId: step.id,
            field: arg.name,
          })
        }
      }

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

  private checkForAmbiguities(
    scenario: Scenario,
    cachedSteps: StepExportResult | null,
    issues: ValidationIssue[]
  ): void {
    if (!cachedSteps) {
      return
    }

    for (const step of scenario.steps) {
      const matchingSteps = cachedSteps.steps.filter((s) => {
        const regex = this.patternToRegex(s.pattern)
        return regex.test(this.stepToText(step))
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

  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\{string\\}/g, '"[^"]*"')
      .replace(/\\{int\\}/g, '\\d+')
      .replace(/\\{float\\}/g, '\\d+\\.?\\d*')
      .replace(/\\{any\\}/g, '.*')
    return new RegExp(`^${escaped}$`)
  }

  private stepToText(step: { pattern: string; args: Array<{ value: string; type: string }> }): string {
    let text = step.pattern
    for (const arg of step.args) {
      const placeholder = `{${arg.type}}`
      const value = arg.type === 'string' ? `"${arg.value}"` : arg.value
      text = text.replace(placeholder, value)
    }
    return text
  }
}

let validationServiceInstance: ValidationService | null = null

export function getValidationService(): ValidationService {
  if (!validationServiceInstance) {
    validationServiceInstance = new ValidationService()
  }
  return validationServiceInstance
}
