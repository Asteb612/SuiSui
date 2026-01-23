export type ValidationSeverity = 'error' | 'warning' | 'info'

export interface ValidationIssue {
  severity: ValidationSeverity
  message: string
  stepId?: string
  field?: string
}

export interface ValidationResult {
  isValid: boolean
  issues: ValidationIssue[]
}
