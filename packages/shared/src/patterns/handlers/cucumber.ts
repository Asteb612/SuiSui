import type { PatternType } from '../types'

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

export const cucumberHandler: PatternType = {
  name: 'cucumber',
  priority: 30,
  regex: /\{(string|int|float|any)(?::(\w+))?\}/g,
  specificity: 40, // base; int/float get higher specificity in findBestMatch

  toRegex(match: RegExpExecArray): string {
    const type = match[1]
    switch (type) {
      case 'string':
        return '("[^"]*"|\'[^\']*\'|\\S+)'
      case 'int':
        return '(\\d+)'
      case 'float':
        return '([\\d.]+)'
      case 'any':
        return '(\\S+)'
      default:
        return '(\\S+)'
    }
  },

  resolve(match: RegExpExecArray, arg: { value: string }): string {
    const type = match[1]
    if (type === 'string') {
      return `"${arg.value}"`
    }
    return arg.value
  },

  toArgDef(match: RegExpExecArray, index: number) {
    const type = match[1] as 'string' | 'int' | 'float' | 'any'
    const name = match[2] ?? `arg${index}`
    return {
      name,
      type,
      required: true,
    }
  },

  format(match: RegExpExecArray, _argIndex: number) {
    const type = match[1] as string
    const name = match[2] ?? type
    const escaped = escapeHtml(name)
    return {
      html: `<span class="pattern-variable pattern-${type}">{${escaped}}</span>`,
      plain: `{${name}}`,
      desc: {
        name,
        type: type as 'string' | 'int' | 'float' | 'any',
      },
    }
  },
}
