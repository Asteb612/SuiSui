/**
 * Utility functions for handling Gherkin data table values
 */

export interface TableRow {
  [key: string]: string
}

/**
 * Parses a JSON string into an array of table rows
 *
 * @param value - JSON string representation of table rows
 * @returns Array of TableRow objects, empty array if parsing fails
 *
 * @example
 * ```ts
 * parseTableValue('[{"name":"John","email":"john@example.com"}]')
 * // Returns: [{ name: 'John', email: 'john@example.com' }]
 *
 * parseTableValue('invalid json')
 * // Returns: []
 * ```
 */
export function parseTableValue(value: string): TableRow[] {
  if (!value || value.trim() === '') {
    return []
  }

  try {
    const parsed = JSON.parse(value)

    // Validate that result is an array
    if (!Array.isArray(parsed)) {
      return []
    }

    // Validate each item is an object with string values
    return parsed.filter(
      (item): item is TableRow =>
        item !== null &&
        typeof item === 'object' &&
        !Array.isArray(item)
    )
  } catch {
    return []
  }
}

/**
 * Converts an array of table rows to a JSON string
 *
 * @param rows - Array of TableRow objects
 * @returns JSON string representation
 *
 * @example
 * ```ts
 * stringifyTableValue([{ name: 'John', email: 'john@example.com' }])
 * // Returns: '[{"name":"John","email":"john@example.com"}]'
 * ```
 */
export function stringifyTableValue(rows: TableRow[]): string {
  return JSON.stringify(rows)
}

/**
 * Creates an empty table row with all columns set to empty strings
 *
 * @param columns - Array of column names
 * @returns A TableRow with empty string values for each column
 *
 * @example
 * ```ts
 * createEmptyRow(['name', 'email'])
 * // Returns: { name: '', email: '' }
 * ```
 */
export function createEmptyRow(columns: string[]): TableRow {
  const row: TableRow = {}
  for (const col of columns) {
    row[col] = ''
  }
  return row
}

/**
 * Validates that a table row has all required columns
 *
 * @param row - The table row to validate
 * @param columns - Required column names
 * @returns True if all columns are present
 */
export function validateRowColumns(row: TableRow, columns: string[]): boolean {
  return columns.every((col) => col in row)
}

/**
 * Converts table rows to Gherkin format string
 *
 * @param rows - Array of table rows
 * @param columns - Column names in desired order
 * @returns Gherkin table string with proper formatting
 *
 * @example
 * ```ts
 * toGherkinTable([{ name: 'John', age: '30' }], ['name', 'age'])
 * // Returns:
 * // | name | age |
 * // | John | 30  |
 * ```
 */
export function toGherkinTable(rows: TableRow[], columns: string[]): string {
  if (rows.length === 0 || columns.length === 0) {
    return ''
  }

  // Calculate column widths
  const widths = columns.map((col) => {
    const values = [col, ...rows.map((row) => row[col] || '')]
    return Math.max(...values.map((v) => v.length))
  })

  // Format header
  const header =
    '| ' +
    columns.map((col, i) => col.padEnd(widths[i] ?? 0)).join(' | ') +
    ' |'

  // Format rows
  const dataRows = rows.map(
    (row) =>
      '| ' +
      columns.map((col, i) => (row[col] || '').padEnd(widths[i] ?? 0)).join(' | ') +
      ' |'
  )

  return [header, ...dataRows].join('\n')
}

/**
 * Parses a Gherkin table string into table rows
 *
 * @param table - Gherkin table string
 * @returns Object with columns array and rows array
 *
 * @example
 * ```ts
 * parseGherkinTable('| name | age |\n| John | 30 |')
 * // Returns: { columns: ['name', 'age'], rows: [{ name: 'John', age: '30' }] }
 * ```
 */
export function parseGherkinTable(table: string): { columns: string[]; rows: TableRow[] } {
  const lines = table
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))

  if (lines.length === 0) {
    return { columns: [], rows: [] }
  }

  const parseRow = (line: string): string[] =>
    line
      .split('|')
      .slice(1, -1) // Remove empty first and last elements
      .map((cell) => cell.trim())

  const columns = parseRow(lines[0] ?? '')
  const rows = lines.slice(1).map((line) => {
    const values = parseRow(line)
    const row: TableRow = {}
    columns.forEach((col, i) => {
      row[col] = values[i] || ''
    })
    return row
  })

  return { columns, rows }
}
