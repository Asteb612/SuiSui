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
 * Strip escape backslashes for Cucumber expression escaping.
 * Converts \{ → {, \( → (, \/ → /
 */
function stripEscapes(text: string): string {
  return text.replace(/\\([{}()/])/g, '$1')
}

/**
 * Parse arguments from a step definition pattern.
 * Checks table first (highest priority), then enums, cucumber expressions, and anonymous {}.
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

  // Protect escape sequences so \{string\} is not detected as {string}
  const protectedPattern = pattern.replace(/\\[{}()\\/]/g, '  ')

  // Collect all args with their positions for correct ordering
  const positionedArgs: Array<{ position: number; arg: StepArgDefinition }> = []

  // 2. Parse enum values from regex: (value1|value2|value3)
  const enumRegex = new RegExp(enumHandler.regex.source, 'g')
  let enumMatch: RegExpExecArray | null
  while ((enumMatch = enumRegex.exec(protectedPattern)) !== null) {
    positionedArgs.push({
      position: enumMatch.index,
      arg: enumHandler.toArgDef(enumMatch, index),
    })
    index++
  }

  // 3. Parse Cucumber expressions: {string}, {int}, {word}, etc.
  const cucumberRegex = new RegExp(cucumberHandler.regex.source, 'g')
  let cucumberMatch: RegExpExecArray | null
  while ((cucumberMatch = cucumberRegex.exec(protectedPattern)) !== null) {
    positionedArgs.push({
      position: cucumberMatch.index,
      arg: cucumberHandler.toArgDef(cucumberMatch, index),
    })
    index++
  }

  // 4. Parse anonymous {} parameters
  const anonRegex = /\{(\})/g
  let anonMatch: RegExpExecArray | null
  while ((anonMatch = anonRegex.exec(protectedPattern)) !== null) {
    // Make sure this isn't already captured by cucumber handler
    const pos = anonMatch.index
    const alreadyCaptured = positionedArgs.some(
      (pa) => pa.position === pos
    )
    if (!alreadyCaptured) {
      positionedArgs.push({
        position: pos,
        arg: {
          name: `arg${index}`,
          type: 'any',
          required: true,
        },
      })
      index++
    }
  }

  // Sort by position and extract args
  positionedArgs.sort((a, b) => a.position - b.position)
  // Re-index names
  for (let i = 0; i < positionedArgs.length; i++) {
    const pa = positionedArgs[i]!
    // Only rename auto-generated names (argN), keep named ones
    if (/^arg\d+$/.test(pa.arg.name)) {
      pa.arg.name = `arg${i}`
    }
    args.push(pa.arg)
  }

  return args
}

/**
 * Convert a step definition pattern to a RegExp for matching step text.
 * Uses a multi-stage protect-then-restore pipeline to handle:
 * - Escape sequences: \{, \(, \/
 * - Cucumber expressions: {string}, {int}, {float}, {word}, {any}, {type:name}
 * - Anonymous parameters: {}
 * - Enum alternations: (a|b|c)
 * - Optional text: (s) — parens without pipe
 * - Alternative text: belly/stomach
 */
export function patternToRegex(pattern: string): RegExp {
  let str = stripAnchors(pattern)

  // Stage 1: Protect escape sequences
  str = str
    .replace(/\\\{/g, '___ESC_LBRACE___')
    .replace(/\\\}/g, '___ESC_RBRACE___')
    .replace(/\\\(/g, '___ESC_LPAREN___')
    .replace(/\\\)/g, '___ESC_RPAREN___')
    .replace(/\\\//g, '___ESC_FSLASH___')

  // Stage 1b: Strip table column suffix — table patterns don't participate in text matching
  str = str.replace(/\s*\(([^)]+(?:,\s*[^)]+)+)\)\s*:\s*$/, ':')

  // Stage 2: Protect cucumber expressions (named and unnamed)
  str = str
    .replace(/\{string(?::\w+)?\}/g, '___STRING___')
    .replace(/\{int(?::\w+)?\}/g, '___INT___')
    .replace(/\{float(?::\w+)?\}/g, '___FLOAT___')
    .replace(/\{word(?::\w+)?\}/g, '___WORD___')
    .replace(/\{any(?::\w+)?\}/g, '___ANY___')

  // Stage 2b: Protect anonymous {} parameters
  str = str.replace(/\{\}/g, '___ANON___')

  // Stage 3: Protect enum patterns (parens with | inside)
  const enums: string[] = []
  str = str.replace(/\(([^)]+\|[^)]+)\)/g, (_, content: string) => {
    enums.push(content)
    return `___ENUM_${enums.length - 1}___`
  })

  // Stage 4: Protect optional text (parens without |)
  const optionals: string[] = []
  str = str.replace(/\(([^)|]+)\)/g, (_, content: string) => {
    optionals.push(content)
    return `___OPT_${optionals.length - 1}___`
  })

  // Stage 5: Protect alternative text (word/word chains)
  const alternatives: string[] = []
  str = str.replace(/\b([\w-]+(?:\/[\w-]+)+)\b/g, (match) => {
    // Only treat as alternative if not inside a placeholder
    if (match.startsWith('___')) return match
    alternatives.push(match)
    return `___ALT_${alternatives.length - 1}___`
  })

  // Stage 6: Escape remaining regex special chars
  str = str.replace(/[.*+?[\]\\{}()^$|]/g, '\\$&')

  // Stage 7: Restore in reverse order
  // Alternatives → (?:word1|word2)
  for (let i = 0; i < alternatives.length; i++) {
    const parts = alternatives[i]!.split('/').map(p => p.replace(/[.*+?[\]\\{}()^$|]/g, '\\$&'))
    str = str.replace(`___ALT_${i}___`, `(?:${parts.join('|')})`)
  }

  // Optionals → (?:text)?
  for (let i = 0; i < optionals.length; i++) {
    const escaped = optionals[i]!.replace(/[.*+?[\]\\{}()^$|]/g, '\\$&')
    str = str.replace(`___OPT_${i}___`, `(?:${escaped})?`)
  }

  // Enums → (value1|value2)
  for (let i = 0; i < enums.length; i++) {
    str = str.replace(`___ENUM_${i}___`, `(${enums[i]})`)
  }

  // Cucumber expressions → actual regex patterns
  str = str
    .replace(/___STRING___/g, '("[^"]*"|\'[^\']*\'|\\S+)')
    .replace(/___INT___/g, '(-?\\d+)')
    .replace(/___FLOAT___/g, '(-?\\d*\\.?\\d+)')
    .replace(/___WORD___/g, '([^\\s]+)')
    .replace(/___ANY___/g, '(\\S+)')

  // Anonymous → (.+)
  str = str.replace(/___ANON___/g, '(.+)')

  // Escape sequences → literal chars
  str = str
    .replace(/___ESC_LBRACE___/g, '\\{')
    .replace(/___ESC_RBRACE___/g, '\\}')
    .replace(/___ESC_LPAREN___/g, '\\(')
    .replace(/___ESC_RPAREN___/g, '\\)')
    .replace(/___ESC_FSLASH___/g, '/')

  return new RegExp(`^${str}$`)
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
    // Table args have no capture group in the regex
    if (argDef.type === 'table') {
      args.push({
        name: argDef.name,
        type: argDef.type,
        value: '',
        tableColumns: argDef.tableColumns,
      })
      continue
    }

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
      case 'word':
        score += 30
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
          value: m,
          type: 'string',
        })
      }
    })
  }

  // Convert pattern: replace "..." with {string}, numbers with {int}, <var> with {string}
  const fallbackPattern = text.replace(/"[^"]*"/g, '{string}').replace(/\b\d+\b/g, '{int}').replace(/<[^>]+>/g, '{string}')

  return { pattern: fallbackPattern, args }
}

/**
 * Resolve a step pattern + args to final Gherkin text.
 * Strips anchors, replaces enum patterns with selected values,
 * replaces Cucumber expression placeholders with arg values.
 * Also expands optional text and picks first alternative.
 */
export function resolvePattern(
  pattern: string,
  args: Array<{ type: string; value: string; enumValues?: string[] }>
): string {
  // Strip regex anchors
  let text = stripAnchors(pattern)

  // Strip escape backslashes
  text = stripEscapes(text)

  // Strip table column spec before optional text handler
  text = text.replace(/\s*\(([^)]+(?:,\s*[^)]+)+)\)\s*:\s*$/, ':')

  // Expand optional text: (s) → s (show expanded form)
  text = text.replace(/\(([^)|]+)\)/g, '$1')

  // Pick first alternative: belly/stomach → belly
  text = text.replace(/\b([\w-]+(?:\/[\w-]+)+)\b/g, (match) => {
    return match.split('/')[0]!
  })

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

  // Replace anonymous {} with arg values
  let anonArgIndex = 0
  const nonEnumArgs = args.filter(arg => arg.type !== 'enum')
  text = text.replace(/\{\}/g, () => {
    // Find the next non-enum arg that corresponds to an anonymous parameter
    // Anonymous {} args are typed as 'any' internally
    while (anonArgIndex < nonEnumArgs.length) {
      const arg = nonEnumArgs[anonArgIndex]!
      // Check if this is a named cucumber expression first
      if (text.includes(`{${arg.type}}`) || text.includes(`{${arg.type}:`)) {
        anonArgIndex++
        continue
      }
      anonArgIndex++
      return arg.value
    }
    return ''
  })

  // Replace Cucumber expression placeholders {type} or {type:name} with values
  for (const arg of args) {
    if (arg.type === 'enum') continue // Already handled above
    // Match both {type} and {type:name}
    const placeholder = new RegExp(`\\{${arg.type}(:\\w+)?\\}`)
    let value: string
    if (getOutlinePlaceholder(arg.value)) {
      value = arg.value // Output raw <var> without quoting
    } else {
      value = arg.type === 'string' ? `"${arg.value}"` : arg.value
    }
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
  // 1. Anonymous parameters: {}
  // 2. Cucumber expressions: {string}, {int}, {float}, {word}, {any}, {type:name}
  // 3. Regex enum patterns: (value1|value2|value3) - must have at least one |
  // 4. Scenario Outline placeholders: <variable>
  const combinedRegex = /\{\}|\{([a-zA-Z]+)(:[^}]+)?\}|\(([^)]+\|[^)]+)\)|<([a-zA-Z_]\w*)>/g
  let lastIndex = 0
  let match

  while ((match = combinedRegex.exec(pattern)) !== null) {
    // Skip escaped sequences
    if (match.index > 0 && pattern[match.index - 1] === '\\') {
      continue
    }

    // Add text before placeholder
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: pattern.slice(lastIndex, match.index),
      })
    }

    const existingArg = args?.[argIndex]

    if (match[0] === '{}') {
      // Anonymous parameter
      const mergedArg: PatternSegment['arg'] = {
        name: existingArg?.name || `arg${argIndex}`,
        type: existingArg?.type || 'any',
        value: existingArg?.value ?? '',
        enumValues: existingArg?.enumValues,
        tableColumns: existingArg?.tableColumns,
      }
      segments.push({
        type: 'arg',
        value: match[0],
        arg: mergedArg,
      })
    } else if (match[1]) {
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
        // Use existing enumValues only if it has items, otherwise extract from pattern
        enumValues: (existingArg?.enumValues && existingArg.enumValues.length > 0)
          ? existingArg.enumValues
          : patternEnumValues,
      }
      segments.push({
        type: 'arg',
        value: match[0],
        arg: mergedArg,
      })
    } else if (match[4]) {
      // Scenario Outline placeholder: <variable>
      const placeholderName = match[4]
      const mergedArg: PatternSegment['arg'] = {
        name: existingArg?.name || placeholderName,
        type: existingArg?.type || 'string',
        value: existingArg?.value ?? '',
        enumValues: existingArg?.enumValues,
        tableColumns: existingArg?.tableColumns,
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
 * Check if a step arg value is a Scenario Outline placeholder (e.g., `<button>`).
 * Returns the placeholder name without angle brackets, or null if not a placeholder.
 */
export function getOutlinePlaceholder(value: string): string | null {
  const match = value.match(/^<([a-zA-Z_]\w*)>$/)
  return match ? match[1]! : null
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

  // Strip escape backslashes for display
  html = stripEscapes(html)
  plainText = stripEscapes(plainText)

  // Format optional text: (s) → styled span (no | inside)
  html = html.replace(/\(([^)|]+)\)/g, (fullMatch) => {
    // Don't match if this could be a table pattern (has comma and ends with :)
    if (fullMatch.includes(',')) return fullMatch
    return `<span class="pattern-optional">${fullMatch}</span>`
  })
  // For plainText, keep optional as-is

  // Format alternative text: word/word → styled span (only word chars around /)
  html = html.replace(/\b([\w-]+(?:\/[\w-]+)+)\b/g, (match) => {
    return `<span class="pattern-alternative">${escapeHtml(match)}</span>`
  })
  // For plainText, keep alternatives as-is

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

  // Replace anonymous {} with styled variable
  html = html.replace(/\{\}/g, () => {
    const argName = `arg${argIndex}`
    argDescriptions.push({
      name: argName,
      type: 'any',
    })
    argIndex++
    const escaped = escapeHtml(argName)
    return `<span class="pattern-variable pattern-any">{${escaped}}</span>`
  })
  plainText = plainText.replace(/\{\}/g, () => {
    const argName = `arg${plainTextArgIndex}`
    plainTextArgIndex++
    return `{${argName}}`
  })

  // Replace {type} or {type:name} with styled variable
  html = html.replace(/\{(string|int|float|word|any)(?::(\w+))?\}/g, (_, type: string, name?: string) => {
    const displayName = name || type
    const escaped = escapeHtml(displayName)
    argDescriptions.push({
      name: displayName,
      type: type as 'string' | 'int' | 'float' | 'word' | 'any',
    })
    return `<span class="pattern-variable pattern-${type}">{${escaped}}</span>`
  })
  plainText = plainText.replace(/\{(string|int|float|word|any)(?::(\w+))?\}/g, (_, type: string, name?: string) => {
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
