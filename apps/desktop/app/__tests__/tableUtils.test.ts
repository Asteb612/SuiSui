import { describe, it, expect } from 'vitest'
import {
  parseTableValue,
  stringifyTableValue,
  createEmptyRow,
  validateRowColumns,
  toGherkinTable,
  parseGherkinTable,
} from '../utils/tableUtils'

describe('tableUtils', () => {
  describe('parseTableValue', () => {
    it('parses valid JSON array of objects', () => {
      const input = '[{"name":"John","email":"john@example.com"}]'
      const result = parseTableValue(input)

      expect(result).toEqual([{ name: 'John', email: 'john@example.com' }])
    })

    it('parses multiple rows', () => {
      const input = '[{"name":"John"},{"name":"Jane"},{"name":"Bob"}]'
      const result = parseTableValue(input)

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({ name: 'John' })
      expect(result[1]).toEqual({ name: 'Jane' })
      expect(result[2]).toEqual({ name: 'Bob' })
    })

    it('returns empty array for empty string', () => {
      expect(parseTableValue('')).toEqual([])
    })

    it('returns empty array for whitespace-only string', () => {
      expect(parseTableValue('   ')).toEqual([])
      expect(parseTableValue('\n\t')).toEqual([])
    })

    it('returns empty array for invalid JSON', () => {
      expect(parseTableValue('not json')).toEqual([])
      expect(parseTableValue('{ invalid')).toEqual([])
      expect(parseTableValue('{}')).toEqual([]) // Object, not array
    })

    it('returns empty array for JSON that is not an array', () => {
      expect(parseTableValue('{"name":"John"}')).toEqual([])
      expect(parseTableValue('"string"')).toEqual([])
      expect(parseTableValue('123')).toEqual([])
      expect(parseTableValue('null')).toEqual([])
    })

    it('filters out non-object items from array', () => {
      const input = '[{"name":"John"}, "string", 123, null, {"name":"Jane"}]'
      const result = parseTableValue(input)

      expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }])
    })

    it('filters out arrays within the array', () => {
      const input = '[{"name":"John"}, ["nested"], {"name":"Jane"}]'
      const result = parseTableValue(input)

      expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }])
    })

    it('handles rows with various value types', () => {
      // JSON allows various types, but our function accepts them
      const input = '[{"string":"text","number":42,"bool":true,"null":null}]'
      const result = parseTableValue(input)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        string: 'text',
        number: 42,
        bool: true,
        null: null,
      })
    })
  })

  describe('stringifyTableValue', () => {
    it('converts table rows to JSON string', () => {
      const rows = [{ name: 'John', email: 'john@example.com' }]
      const result = stringifyTableValue(rows)

      expect(result).toBe('[{"name":"John","email":"john@example.com"}]')
    })

    it('handles empty array', () => {
      expect(stringifyTableValue([])).toBe('[]')
    })

    it('handles multiple rows', () => {
      const rows = [{ a: '1' }, { a: '2' }, { a: '3' }]
      const result = stringifyTableValue(rows)

      expect(result).toBe('[{"a":"1"},{"a":"2"},{"a":"3"}]')
    })

    it('is reversible with parseTableValue', () => {
      const original = [
        { name: 'John', age: '30' },
        { name: 'Jane', age: '25' },
      ]
      const stringified = stringifyTableValue(original)
      const parsed = parseTableValue(stringified)

      expect(parsed).toEqual(original)
    })
  })

  describe('createEmptyRow', () => {
    it('creates row with all columns set to empty strings', () => {
      const result = createEmptyRow(['name', 'email', 'age'])

      expect(result).toEqual({ name: '', email: '', age: '' })
    })

    it('handles single column', () => {
      const result = createEmptyRow(['id'])

      expect(result).toEqual({ id: '' })
    })

    it('handles empty columns array', () => {
      const result = createEmptyRow([])

      expect(result).toEqual({})
    })

    it('preserves column order in iteration', () => {
      const columns = ['z', 'a', 'm']
      const result = createEmptyRow(columns)

      expect(Object.keys(result)).toEqual(['z', 'a', 'm'])
    })
  })

  describe('validateRowColumns', () => {
    it('returns true when all columns are present', () => {
      const row = { name: 'John', email: 'john@example.com' }
      const columns = ['name', 'email']

      expect(validateRowColumns(row, columns)).toBe(true)
    })

    it('returns true when row has extra columns', () => {
      const row = { name: 'John', email: 'john@example.com', age: '30' }
      const columns = ['name', 'email']

      expect(validateRowColumns(row, columns)).toBe(true)
    })

    it('returns false when column is missing', () => {
      const row = { name: 'John' }
      const columns = ['name', 'email']

      expect(validateRowColumns(row, columns)).toBe(false)
    })

    it('handles empty columns array', () => {
      const row = { name: 'John' }

      expect(validateRowColumns(row, [])).toBe(true)
    })

    it('handles empty row', () => {
      const row = {}
      const columns = ['name']

      expect(validateRowColumns(row, columns)).toBe(false)
    })

    it('checks for presence even with empty string values', () => {
      const row = { name: '' }
      const columns = ['name']

      expect(validateRowColumns(row, columns)).toBe(true)
    })
  })

  describe('toGherkinTable', () => {
    it('converts rows to Gherkin table format', () => {
      const rows = [{ name: 'John', age: '30' }]
      const result = toGherkinTable(rows, ['name', 'age'])

      expect(result).toBe('| name | age |\n| John | 30  |')
    })

    it('pads columns to align properly', () => {
      const rows = [
        { name: 'John', email: 'john@example.com' },
        { name: 'Jane', email: 'jane@ex.com' },
      ]
      const result = toGherkinTable(rows, ['name', 'email'])

      const lines = result.split('\n')
      expect(lines[0]).toBe('| name | email            |')
      expect(lines[1]).toBe('| John | john@example.com |')
      expect(lines[2]).toBe('| Jane | jane@ex.com      |')
    })

    it('handles empty rows array', () => {
      expect(toGherkinTable([], ['name'])).toBe('')
    })

    it('handles empty columns array', () => {
      expect(toGherkinTable([{ name: 'John' }], [])).toBe('')
    })

    it('handles missing values in row', () => {
      const rows = [{ name: 'John' }]
      const result = toGherkinTable(rows, ['name', 'email'])

      expect(result).toBe('| name | email |\n| John |       |')
    })

    it('handles columns longer than values', () => {
      const rows = [{ longcolumnname: 'x' }]
      const result = toGherkinTable(rows, ['longcolumnname'])

      expect(result).toBe('| longcolumnname |\n| x              |')
    })
  })

  describe('parseGherkinTable', () => {
    it('parses Gherkin table string', () => {
      const table = '| name | age |\n| John | 30  |'
      const result = parseGherkinTable(table)

      expect(result.columns).toEqual(['name', 'age'])
      expect(result.rows).toEqual([{ name: 'John', age: '30' }])
    })

    it('parses multiple rows', () => {
      const table = '| name |\n| John |\n| Jane |\n| Bob  |'
      const result = parseGherkinTable(table)

      expect(result.columns).toEqual(['name'])
      expect(result.rows).toHaveLength(3)
      expect(result.rows[0]).toEqual({ name: 'John' })
      expect(result.rows[1]).toEqual({ name: 'Jane' })
      expect(result.rows[2]).toEqual({ name: 'Bob' })
    })

    it('handles empty string', () => {
      const result = parseGherkinTable('')

      expect(result.columns).toEqual([])
      expect(result.rows).toEqual([])
    })

    it('trims whitespace from cells', () => {
      const table = '|  name  |  email  |\n|  John  |  john@example.com  |'
      const result = parseGherkinTable(table)

      expect(result.columns).toEqual(['name', 'email'])
      expect(result.rows[0]).toEqual({ name: 'John', email: 'john@example.com' })
    })

    it('handles table with only header', () => {
      const table = '| name | email |'
      const result = parseGherkinTable(table)

      expect(result.columns).toEqual(['name', 'email'])
      expect(result.rows).toEqual([])
    })

    it('handles lines without pipes', () => {
      const table = 'Some text\n| name |\n| John |\nMore text'
      const result = parseGherkinTable(table)

      expect(result.columns).toEqual(['name'])
      expect(result.rows).toEqual([{ name: 'John' }])
    })

    it('is reversible with toGherkinTable', () => {
      const original = [
        { name: 'John', age: '30' },
        { name: 'Jane', age: '25' },
      ]
      const columns = ['name', 'age']

      const gherkin = toGherkinTable(original, columns)
      const parsed = parseGherkinTable(gherkin)

      expect(parsed.columns).toEqual(columns)
      expect(parsed.rows).toEqual(original)
    })
  })
})
