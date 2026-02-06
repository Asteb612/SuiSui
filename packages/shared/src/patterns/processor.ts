import type { StepArgDefinition, StepDefinition, StepKeyword } from '../types/step'
import type { StepArg } from '../types/feature'
import type { PatternSegment, FormattedPattern } from './types'
import { tableHandler } from './handlers/table'
import { enumHandler } from './handlers/enum'
import { cucumberHandler } from './handlers/cucumber'

/**
 * Strip regex anchors ^ and $ from a pattern
 */
export function stripAnchors(pattern: string): string {
  return pattern.replace(/^\^/, '').replace(/\$$/, '')
}

/**
 * Parse arguments from a step definition pattern.
 * Checks table first (highest priority), then enums and cucumber expressions.
 */
export function parseArgs(pattern: string): StepArgDefinition[] {
  const args: StepArgDefinition[] = []
  let index = 0

  // 1. Check for DataTable (pattern ends with ':')
  if (pattern.trim().endsWith(':')) {
    const tableRegex = new RegExp(tableHandler.regex.source)
    const tableMatch = pattern.match(tableRegex)
    if (tableMatch) {
      args.push(tableHandler.toArgDef(tableMatch as RegExpExecArray, index))
      return args
    }
    // Generic DataTable without column info
    args.push({
      name: 'table',
      type: 'table',
      required: true,
    })
    return args
  }

  // 2. Parse enum values from regex: (value1|value2|value3)
  const enumRegex = new RegExp(enumHandler.regex.source, 'g')
  let enumMatch: RegExpExecArray | null
  while ((enumMatch = enumRegex.exec(pattern)) !== null) {
    args.push(enumHandler.toArgDef(enumMatch, index))
    index++
  }

  // 3. Parse Cucumber expressions: {string}, {int}, etc.
  const cucumberRegex = new RegExp(cucumberHandler.regex.source, 'g')
  let cucumberMatch: RegExpExecArray | null
  while ((cucumberMatch = cucumberRegex.exec(pattern)) !== null) {
    args.push(cucumberHandler.toArgDef(cucumberMatch, index))
    index++
  }

  return args
}

/**
 * Convert a step definition pattern to a RegExp for matching step text.
 * Handles anchors, cucumber expressions, and enum alternations.
 */
export function patternToRegex(pattern: string): RegExp {
  const regexStr = stripAnchors(pattern)
    // Convert Cucumber expressions to placeholders BEFORE escaping
    .replace(/\{string\}/g, '___STRING___')
    .replace(/\{int\}/g, '___INT___')
    .replace(/\{float\}/g, '___FLOAT___')
    .replace(/\{any\}/g, '___ANY___')
    // Also handle named: {string:name} -> same as {string}
    .replace(/\{string:\w+\}/g, '___STRING___')
    .replace(/\{int:\w+\}/g, '___INT___')
    .replace(/\{float:\w+\}/g, '___FLOAT___')
    .replace(/\{any:\w+\}/g, '___ANY___')
    // Escape regex special chars except for ()|
    .replace(/[.*+?[\]\\{}]/g, '\\$&')
    // Restore enum patterns (they were escaped, need to un-escape parens)
    .replace(/\\\(([^)]+)\\\)/g, '($1)')
    // Now replace placeholders with actual regex patterns
    .replace(/___STRING___/g, '("[^"]*"|\'[^\']*\'|\\S+)')
    .replace(/___INT___/g, '(\\d+)')
    .replace(/___FLOAT___/g, '([\\d.]+)')
    .replace(/___ANY___/g, '(\\S+)')

  return new RegExp(`^${regexStr}$`)
}

/**
 * Match step text against a step definition and extract argument values.
 * Returns the matched step with populated args, or null if no match.
 */
export function matchStep(
  text: string,
  stepDef: StepDefinition
): { pattern: string; args: StepArg[] } | null {
  const regex = patternToRegex(stepDef.pattern)
  const match = text.match(regex)

  if (!match) return null

  const args: StepArg[] = []
  let captureIndex = 1

  for (const argDef of stepDef.args) {
    let capturedValue = match[captureIndex++] || ''

    // Strip quotes from string values (they may be captured with quotes)
    if (argDef.type === 'string') {
      capturedValue = capturedValue.replace(/^["']|["']$/g, '')
    }

    args.push({
      name: argDef.name,
      type: argDef.type,
      value: capturedValue,
      enumValues: argDef.enumValues,
      tableColumns: argDef.tableColumns,
    })
  }

  return { pattern: stepDef.pattern, args }
}

/**
 * Compute a specificity score for a step definition.
 * Higher specificity = more specific match.
 */
function computeSpecificity(stepDef: StepDefinition): number {
  let score = 0
  for (const arg of stepDef.args) {
    switch (arg.type) {
      case 'table':
        score += 90
        break
      case 'enum':
        score += 80
        break
      case 'int':
      case 'float':
        score += 60
        break
      case 'string':
        score += 40
        break
      case 'any':
        score += 20
        break
    }
  }
  return score
}

/**
 * Find the best matching step definition for the given step text.
 * When multiple definitions match, returns the one with highest specificity.
 * Falls back to creating a simple pattern from the text.
 */
export function findBestMatch(
  text: string,
  keyword: StepKeyword,
  defs: StepDefinition[]
): { pattern: string; args: StepArg[] } {
  // Normalize And/But to the base keyword for matching
  const baseKeyword = keyword === 'And' || keyword === 'But' ? undefined : keyword

  // Collect all matches with their specificity
  const matches: Array<{
    result: { pattern: string; args: StepArg[] }
    specificity: number
  }> = []

  for (const stepDef of defs) {
    // If we know the base keyword, only match same keyword steps
    if (baseKeyword && stepDef.keyword !== baseKeyword) continue

    const result = matchStep(text, stepDef)
    if (result) {
      matches.push({
        result,
        specificity: computeSpecificity(stepDef),
      })
    }
  }

  // Return highest specificity match
  if (matches.length > 0) {
    matches.sort((a, b) => b.specificity - a.specificity)
    return matches[0]!.result
  }

  // Fallback: create simple pattern from text
  const args: StepArg[] = []

  // Extract string arguments (quoted)
  const stringMatches = text.match(/"([^"]*)"/g)
  if (stringMatches) {
    stringMatches.forEach((m, idx) => {
      args.push({
        name: `arg${idx}`,
        value: m.slice(1, -1),
        type: 'string',
      })
    })
  }

  // Extract angle bracket placeholders for scenario outlines (e.g., <role>)
  const placeholderMatches = text.match(/<([^>]+)>/g)
  if (placeholderMatches) {
    placeholderMatches.forEach((m) => {
      const name = m.slice(1, -1)
      if (!args.find(a => a.name === name)) {
        args.push({
          name,
          value: '',
          type: 'string',
        })
      }
    })
  }

  // Convert pattern: replace "..." with {string}, numbers with {int}
  const pattern = text.replace(/"[^"]*"/g, '{string}').replace(/\b\d+\b/g, '{int}')

  return { pattern, args }
}

/**
 * Resolve a step pattern + args to final Gherkin text.
 * Strips anchors, replaces enum patterns with selected values,
 * replaces Cucumber expression placeholders with arg values.
 */
export function resolvePattern(
  pattern: string,
  args: Array<{ type: string; value: string; enumValues?: string[] }>
): string {
  // Strip regex anchors
  let text = stripAnchors(pattern)

  // Track enum args separately (they map to (a|b|c) patterns)
  let enumArgIndex = 0
  const enumArgs = args.filter(arg => arg.type === 'enum')

  // Replace enum patterns (a|b|c) with the selected enum value
  text = text.replace(/\(([^)]+\|[^)]+)\)/g, () => {
    const enumArg = enumArgs[enumArgIndex++]
    if (enumArg) {
      return enumArg.value || enumArg.enumValues?.[0] || ''
    }
    return ''
  })

  // Replace Cucumber expression placeholders {type} or {type:name} with values
  for (const arg of args) {
    if (arg.type === 'enum') continue // Already handled above
    // Match both {type} and {type:name}
    const placeholder = new RegExp(`\\{${arg.type}(:\\w+)?\\}`)
    const value = arg.type === 'string' ? `"${arg.value}"` : arg.value
    text = text.replace(placeholder, value)
  }

  return text
}

/**
 * Parse a step pattern into segments for inline editing.
 * Returns an array of text segments and arg segments that can be rendered
 * with inline input controls.
 */
export function parseSegments(
  pattern: string,
  args?: Array<{ name: string; type: string; value: string; enumValues?: string[]; tableColumns?: string[] }>
): PatternSegment[] {
  const segments: PatternSegment[] = []
  let argIndex = 0

  // Combined regex to match:
  // 1. Cucumber expressions: {string}, {int}, {float}, {any}, {type:name}
  // 2. Regex enum patterns: (value1|value2|value3) - must have at least one |
  const combinedRegex = /\{([a-zA-Z]+)(:[^}]+)?\}|\(([^)]+\|[^)]+)\)/g
  let lastIndex = 0
  let match

  while ((match = combinedRegex.exec(pattern)) !== null) {
    // Add text before placeholder
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: pattern.slice(lastIndex, match.index),
      })
    }

    const existingArg = args?.[argIndex]

    if (match[1]) {
      // Cucumber expression: {type} or {type:options}
      const argType = match[1].toLowerCase() as string
      const mergedArg: PatternSegment['arg'] = {
        name: existingArg?.name || `arg${argIndex}`,
        type: existingArg?.type || argType,
        value: existingArg?.value ?? '',
        enumValues: existingArg?.enumValues,
        tableColumns: existingArg?.tableColumns,
      }
      segments.push({
        type: 'arg',
        value: match[0],
        arg: mergedArg,
      })
    } else if (match[3]) {
      // Regex enum pattern: (value1|value2|...)
      const patternEnumValues = match[3].split('|').map(v => v.trim())
      const mergedArg: PatternSegment['arg'] = {
        name: existingArg?.name || `arg${argIndex}`,
        type: 'enum',
        value: existingArg?.value ?? '',
        enumValues: existingArg?.enumValues || patternEnumValues,
      }
      segments.push({
        type: 'arg',
        value: match[0],
        arg: mergedArg,
      })
    }

    argIndex++
    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < pattern.length) {
    segments.push({
      type: 'text',
      value: pattern.slice(lastIndex),
    })
  }

  return segments
}

function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return str.replace(/[&<>"']/g, (c) => map[c] || c)
}

/**
 * Format a step pattern for display with syntax highlighting.
 * Returns HTML with styled spans, plain text, and argument descriptions.
 */
export function formatPattern(pattern: string): FormattedPattern {
  // Strip regex anchors ^ and $ from the pattern
  const cleanedPattern = stripAnchors(pattern)

  let html = cleanedPattern
  let plainText = cleanedPattern
  const argDescriptions: FormattedPattern['argDescriptions'] = []
  let argIndex = 0

  // Replace (enum|values) with styled variable - show argN
  html = html.replace(/\(([^)]+\|[^)]+)\)/g, (_, content: string) => {
    const values = content.split('|').map((v) => v.trim())
    const argName = `arg${argIndex}`
    argDescriptions.push({
      name: argName,
      type: 'enum',
      enumValues: values,
    })
    argIndex++
    const escaped = escapeHtml(argName)
    return `<span class="pattern-variable pattern-enum">${escaped}</span>`
  })

  // Reset for plainText processing
  let plainTextArgIndex = 0
  plainText = plainText.replace(/\(([^)]+\|[^)]+)\)/g, () => {
    const argName = `arg${plainTextArgIndex}`
    plainTextArgIndex++
    return argName
  })

  // Replace {type} or {type:name} with styled variable
  html = html.replace(/\{(string|int|float|any)(?::(\w+))?\}/g, (_, type: string, name?: string) => {
    const displayName = name || type
    const escaped = escapeHtml(displayName)
    argDescriptions.push({
      name: displayName,
      type: type as 'string' | 'int' | 'float' | 'any',
    })
    return `<span class="pattern-variable pattern-${type}">{${escaped}}</span>`
  })
  plainText = plainText.replace(/\{(string|int|float|any)(?::(\w+))?\}/g, (_, type: string, name?: string) => {
    const displayName = name || type
    return `{${displayName}}`
  })

  // Replace (columns) : with table indicator (must have comma for multiple columns)
  html = html.replace(/\(([^)]+(?:,\s*[^)]+)+)\)\s*:\s*$/, (_, columns: string) => {
    const escaped = escapeHtml(columns)
    const columnList = columns.split(',').map((c) => c.trim())
    argDescriptions.push({
      name: 'table',
      type: 'table',
      tableColumns: columnList,
    })
    return `<span class="pattern-variable pattern-table">[${escaped}]</span>`
  })
  plainText = plainText.replace(/\(([^)]+(?:,\s*[^)]+)+)\)\s*:\s*$/, (_, columns: string) => {
    return `[${columns}]`
  })

  return { html, plainText, argDescriptions }
}
