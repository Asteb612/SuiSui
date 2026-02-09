import type { PatternType } from '../types'

export const enumHandler: PatternType = {
  name: 'enum',
  priority: 20,
  regex: /\(([^)]+\|[^)]+)\)/g,
  specificity: 80,

  toRegex(match: RegExpExecArray): string {
    // Enum alternation is already valid regex: (value1|value2|value3)
    return `(${match[1]})`
  },

  resolve(_match: RegExpExecArray, arg: { value: string; enumValues?: string[] }): string {
    return arg.value || arg.enumValues?.[0] || ''
  },

  toArgDef(match: RegExpExecArray, index: number) {
    const enumValues = match[1]!.split('|').map(v => v.trim())
    return {
      name: `arg${index}`,
      type: 'enum' as const,
      required: true,
      enumValues,
    }
  },

  format(match: RegExpExecArray, argIndex: number) {
    const enumValues = match[1]!.split('|').map(v => v.trim())
    const argName = `arg${argIndex}`
    return {
      html: `<span class="pattern-variable pattern-enum">${argName}</span>`,
      plain: argName,
      desc: {
        name: argName,
        type: 'enum' as const,
        enumValues,
      },
    }
  },
}
