/**
 * Strip regex anchors ^ and $ from a pattern
 */
export function stripAnchors(pattern: string): string {
  return pattern.replace(/^\^/, '').replace(/\$$/, '')
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
