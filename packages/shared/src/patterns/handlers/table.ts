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

export const tableHandler: PatternType = {
  name: 'table',
  priority: 10,
  regex: /\(([^)]+(?:,\s*[^)]+)+)\)\s*:$/,
  specificity: 90,

  toRegex(_match: RegExpExecArray): string {
    // Table patterns don't participate in text matching
    return ''
  },

  resolve(_match: RegExpExecArray, _arg: { value: string }): string {
    // Table data is rendered separately (as a Gherkin DataTable below the step)
    return ''
  },

  toArgDef(match: RegExpExecArray, _index: number) {
    const columns = match[1]!.split(',').map(c => c.trim())
    return {
      name: 'table',
      type: 'table' as const,
      required: true,
      tableColumns: columns,
    }
  },

  format(match: RegExpExecArray, _argIndex: number) {
    const columns = match[1]!
    const columnList = columns.split(',').map(c => c.trim())
    const escaped = escapeHtml(columns)
    return {
      html: `<span class="pattern-variable pattern-table">[${escaped}]</span>`,
      plain: `[${columns}]`,
      desc: {
        name: 'table',
        type: 'table' as const,
        tableColumns: columnList,
      },
    }
  },
}
