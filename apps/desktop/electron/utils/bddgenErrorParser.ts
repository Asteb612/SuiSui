import type { RunError, RunErrorType } from '@suisui/shared'

/**
 * Parses bddgen output to extract structured error messages
 */
export function parseBddgenErrors(stdout: string, stderr: string): RunError[] {
  const errors: RunError[] = []
  const combined = `${stdout}\n${stderr}`

  // Parse undefined step errors
  // Pattern: "Missing step definition for..."
  // Pattern: "Undefined. Implement with the following snippet:"
  const undefinedStepPatterns = [
    /Missing step definition for[:\s]*["']?(.+?)["']?\s*(?:in\s+(.+?)(?::(\d+))?)?/gi,
    /Undefined\.?\s*Implement with the following snippet:/gi,
    /Step "(.+?)" is not defined/gi,
    /Unknown step[:\s]*["']?(.+?)["']?/gi,
  ]

  for (const pattern of undefinedStepPatterns) {
    let match
    while ((match = pattern.exec(combined)) !== null) {
      const stepText = match[1] || 'Unknown step'
      if (!errors.some((e) => e.type === 'undefined_step' && e.step === stepText)) {
        errors.push({
          type: 'undefined_step',
          message: `Undefined step: "${stepText}"`,
          step: stepText,
          file: match[2],
          line: match[3] ? parseInt(match[3], 10) : undefined,
          suggestion: 'Add a step definition for this step or select an existing one from the catalog.',
        })
      }
    }
  }

  // Parse ambiguous step errors
  // Pattern: "Multiple step definitions match..."
  const ambiguousPattern = /(?:Multiple|Ambiguous) step definitions? match[:\s]*["']?(.+?)["']?/gi
  let match
  while ((match = ambiguousPattern.exec(combined)) !== null) {
    errors.push({
      type: 'ambiguous_step',
      message: `Ambiguous step: "${match[1]}"`,
      step: match[1],
      suggestion: 'Multiple step definitions match this step. Make the step pattern more specific.',
    })
  }

  // Parse syntax errors in feature files
  // Pattern: "Parser errors:" followed by details
  // Pattern: "SyntaxError:" or "Parse error"
  const syntaxPatterns = [
    /Parser errors?[:\s]*\n?([\s\S]*?)(?=\n\n|\n[A-Z]|$)/gi,
    /SyntaxError[:\s]*(.+?)(?:\n|$)/gi,
    /Parse error[:\s]*(.+?)(?:\n|$)/gi,
    /Gherkin syntax error[:\s]*(.+?)(?:\n|$)/gi,
    /(?:at|in)\s+(.+?\.feature):(\d+)/gi,
  ]

  for (const pattern of syntaxPatterns) {
    while ((match = pattern.exec(combined)) !== null) {
      const message = match[1]?.trim()
      if (message && !errors.some((e) => e.type === 'syntax_error' && e.message.includes(message.slice(0, 50)))) {
        errors.push({
          type: 'syntax_error',
          message: `Syntax error: ${message}`,
          file: match[2] || undefined,
          line: match[3] ? parseInt(match[3], 10) : undefined,
          suggestion: 'Check the feature file for Gherkin syntax errors.',
        })
      }
    }
  }

  // Parse missing decorator errors
  // Pattern: "@Given/@When/@Then decorator not found"
  const decoratorPattern =
    /@(Given|When|Then|And|But)\s+decorator\s+(?:not found|missing)|Missing\s+@(Given|When|Then)/gi
  while ((match = decoratorPattern.exec(combined)) !== null) {
    errors.push({
      type: 'missing_decorator',
      message: `Missing step decorator: @${match[1] || match[2]}`,
      suggestion: 'Ensure step definitions have the correct @Given/@When/@Then decorators.',
    })
  }

  // Parse configuration errors
  const configPatterns = [
    /Cannot find (?:module|config)[:\s]*["']?(.+?)["']?/gi,
    /Config(?:uration)? error[:\s]*(.+?)(?:\n|$)/gi,
    /playwright\.config\.(ts|js)\s+(?:not found|missing)/gi,
    /cucumber\.json?\s+(?:not found|missing|invalid)/gi,
  ]

  for (const pattern of configPatterns) {
    while ((match = pattern.exec(combined)) !== null) {
      errors.push({
        type: 'config_error',
        message: `Configuration error: ${match[1] || match[0]}`,
        suggestion: 'Check your playwright.config.ts and cucumber.json configuration files.',
      })
    }
  }

  // Parse generic error messages if no specific errors found
  if (errors.length === 0) {
    // Look for Error: messages
    const errorLinePattern = /Error[:\s]+(.+?)(?:\n|$)/gi
    while ((match = errorLinePattern.exec(combined)) !== null) {
      const msg = match[1].trim()
      if (msg && msg.length > 5) {
        errors.push({
          type: 'unknown',
          message: msg,
        })
      }
    }

    // If still no errors, add a generic one based on stderr content
    if (errors.length === 0 && stderr.trim()) {
      // Extract the most relevant error line
      const lines = stderr.split('\n').filter((l) => l.trim())
      const errorLine = lines.find((l) => /error|fail|invalid|cannot|missing/i.test(l)) || lines[0]
      if (errorLine) {
        errors.push({
          type: 'unknown',
          message: errorLine.trim(),
        })
      }
    }
  }

  return errors
}

/**
 * Formats parsed errors for display
 */
export function formatErrorsForDisplay(errors: RunError[]): string[] {
  return errors.map((error) => {
    let msg = error.message
    if (error.file) {
      msg += ` (${error.file}${error.line ? `:${error.line}` : ''})`
    }
    if (error.suggestion) {
      msg += `\n  → ${error.suggestion}`
    }
    return msg
  })
}

/**
 * Get a summary of errors by type
 */
export function getErrorSummary(errors: RunError[]): string {
  if (errors.length === 0) return 'Unknown error'

  const byType: Record<RunErrorType, number> = {
    undefined_step: 0,
    syntax_error: 0,
    missing_decorator: 0,
    ambiguous_step: 0,
    config_error: 0,
    unknown: 0,
  }

  for (const error of errors) {
    byType[error.type]++
  }

  const parts: string[] = []
  if (byType.undefined_step > 0) {
    parts.push(`${byType.undefined_step} undefined step${byType.undefined_step > 1 ? 's' : ''}`)
  }
  if (byType.syntax_error > 0) {
    parts.push(`${byType.syntax_error} syntax error${byType.syntax_error > 1 ? 's' : ''}`)
  }
  if (byType.ambiguous_step > 0) {
    parts.push(`${byType.ambiguous_step} ambiguous step${byType.ambiguous_step > 1 ? 's' : ''}`)
  }
  if (byType.config_error > 0) {
    parts.push(`${byType.config_error} config error${byType.config_error > 1 ? 's' : ''}`)
  }
  if (byType.missing_decorator > 0) {
    parts.push(`${byType.missing_decorator} missing decorator${byType.missing_decorator > 1 ? 's' : ''}`)
  }
  if (parts.length === 0 && byType.unknown > 0) {
    parts.push(`${byType.unknown} error${byType.unknown > 1 ? 's' : ''}`)
  }

  return parts.join(', ')
}
