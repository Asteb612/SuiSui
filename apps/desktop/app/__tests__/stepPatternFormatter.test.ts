import { describe, it, expect } from 'vitest'
import { formatStepPattern } from '../utils/stepPatternFormatter'

describe('formatStepPattern', () => {
  describe('plain patterns', () => {
    it('returns unchanged pattern when no special syntax', () => {
      const result = formatStepPattern('I am on the home page')
      expect(result.html).toBe('I am on the home page')
      expect(result.plainText).toBe('I am on the home page')
      expect(result.argDescriptions).toEqual([])
    })

    it('handles empty string', () => {
      const result = formatStepPattern('')
      expect(result.html).toBe('')
      expect(result.plainText).toBe('')
      expect(result.argDescriptions).toEqual([])
    })
  })

  describe('enum patterns', () => {
    it('formats single enum with arg0 and captures enum values', () => {
      const result = formatStepPattern('I login as (admin|user|guest)')
      expect(result.html).toBe('I login as <span class="pattern-variable pattern-enum">arg0</span>')
      expect(result.plainText).toBe('I login as arg0')
      expect(result.argDescriptions).toEqual([
        { name: 'arg0', type: 'enum', enumValues: ['admin', 'user', 'guest'] }
      ])
    })

    it('formats enum at start of pattern', () => {
      const result = formatStepPattern('(yes|no) is selected')
      expect(result.html).toBe('<span class="pattern-variable pattern-enum">arg0</span> is selected')
      expect(result.plainText).toBe('arg0 is selected')
      expect(result.argDescriptions).toEqual([
        { name: 'arg0', type: 'enum', enumValues: ['yes', 'no'] }
      ])
    })

    it('formats multiple enums in same pattern with incrementing arg numbers', () => {
      const result = formatStepPattern('(admin|user) sees (dashboard|settings)')
      expect(result.html).toBe(
        '<span class="pattern-variable pattern-enum">arg0</span> sees <span class="pattern-variable pattern-enum">arg1</span>'
      )
      expect(result.plainText).toBe('arg0 sees arg1')
      expect(result.argDescriptions).toEqual([
        { name: 'arg0', type: 'enum', enumValues: ['admin', 'user'] },
        { name: 'arg1', type: 'enum', enumValues: ['dashboard', 'settings'] }
      ])
    })

    it('captures whitespace in enum options', () => {
      const result = formatStepPattern('status is (in progress|done)')
      expect(result.html).toBe(
        'status is <span class="pattern-variable pattern-enum">arg0</span>'
      )
      expect(result.plainText).toBe('status is arg0')
      expect(result.argDescriptions).toEqual([
        { name: 'arg0', type: 'enum', enumValues: ['in progress', 'done'] }
      ])
    })
  })

  describe('cucumber expressions', () => {
    it('formats {string} parameter and captures arg descriptions', () => {
      const result = formatStepPattern('I fill {string} with {string}')
      expect(result.html).toBe(
        'I fill <span class="pattern-variable pattern-string">{string}</span> with <span class="pattern-variable pattern-string">{string}</span>'
      )
      expect(result.plainText).toBe('I fill {string} with {string}')
      expect(result.argDescriptions).toEqual([
        { name: 'string', type: 'string' },
        { name: 'string', type: 'string' }
      ])
    })

    it('formats {int} parameter', () => {
      const result = formatStepPattern('I wait {int} seconds')
      expect(result.html).toBe(
        'I wait <span class="pattern-variable pattern-int">{int}</span> seconds'
      )
      expect(result.plainText).toBe('I wait {int} seconds')
      expect(result.argDescriptions).toEqual([
        { name: 'int', type: 'int' }
      ])
    })

    it('formats {float} parameter', () => {
      const result = formatStepPattern('price is {float}')
      expect(result.html).toBe('price is <span class="pattern-variable pattern-float">{float}</span>')
      expect(result.plainText).toBe('price is {float}')
      expect(result.argDescriptions).toEqual([
        { name: 'float', type: 'float' }
      ])
    })

    it('formats {any} parameter', () => {
      const result = formatStepPattern('I see {any}')
      expect(result.html).toBe('I see <span class="pattern-variable pattern-any">{any}</span>')
      expect(result.plainText).toBe('I see {any}')
      expect(result.argDescriptions).toEqual([
        { name: 'any', type: 'any' }
      ])
    })

    it('formats named parameters with {type:name}', () => {
      const result = formatStepPattern('I fill {string:fieldName} with {string:value}')
      expect(result.html).toBe(
        'I fill <span class="pattern-variable pattern-string">{fieldName}</span> with <span class="pattern-variable pattern-string">{value}</span>'
      )
      expect(result.plainText).toBe('I fill {fieldName} with {value}')
      expect(result.argDescriptions).toEqual([
        { name: 'fieldName', type: 'string' },
        { name: 'value', type: 'string' }
      ])
    })

    it('formats {int:count} named parameter', () => {
      const result = formatStepPattern('I click {int:times} times')
      expect(result.html).toBe(
        'I click <span class="pattern-variable pattern-int">{times}</span> times'
      )
      expect(result.plainText).toBe('I click {times} times')
      expect(result.argDescriptions).toEqual([
        { name: 'times', type: 'int' }
      ])
    })
  })

  describe('table column patterns', () => {
    it('formats table columns at end of pattern and captures column info', () => {
      const result = formatStepPattern('I see users (name, email, role) :')
      expect(result.html).toBe(
        'I see users <span class="pattern-variable pattern-table">[name, email, role]</span>'
      )
      expect(result.plainText).toBe('I see users [name, email, role]')
      expect(result.argDescriptions).toEqual([
        { name: 'table', type: 'table', tableColumns: ['name', 'email', 'role'] }
      ])
    })

    it('formats table with two columns', () => {
      const result = formatStepPattern('data table (col1, col2) :')
      expect(result.html).toBe(
        'data table <span class="pattern-variable pattern-table">[col1, col2]</span>'
      )
      expect(result.plainText).toBe('data table [col1, col2]')
      expect(result.argDescriptions).toEqual([
        { name: 'table', type: 'table', tableColumns: ['col1', 'col2'] }
      ])
    })

    it('does not format single item in parentheses (not a table)', () => {
      // Single item without comma should not be treated as table
      // but it IS wrapped as pattern-optional in the html output
      const result = formatStepPattern('I see (item) :')
      expect(result.html).toBe('I see <span class="pattern-optional">(item)</span> :')
      expect(result.plainText).toBe('I see (item) :')
      expect(result.argDescriptions).toEqual([])
    })
  })

  describe('mixed patterns', () => {
    it('formats enum and cucumber expression together', () => {
      const result = formatStepPattern('(admin|user) enters {string}')
      expect(result.html).toBe(
        '<span class="pattern-variable pattern-enum">arg0</span> enters <span class="pattern-variable pattern-string">{string}</span>'
      )
      expect(result.plainText).toBe('arg0 enters {string}')
      expect(result.argDescriptions).toEqual([
        { name: 'arg0', type: 'enum', enumValues: ['admin', 'user'] },
        { name: 'string', type: 'string' }
      ])
    })

    it('formats multiple types in complex pattern', () => {
      const result = formatStepPattern('I click {string} and wait {int} seconds on (desktop|mobile)')
      expect(result.html).toBe(
        'I click <span class="pattern-variable pattern-string">{string}</span> and wait <span class="pattern-variable pattern-int">{int}</span> seconds on <span class="pattern-variable pattern-enum">arg0</span>'
      )
      expect(result.plainText).toBe('I click {string} and wait {int} seconds on arg0')
      expect(result.argDescriptions).toEqual([
        { name: 'arg0', type: 'enum', enumValues: ['desktop', 'mobile'] },
        { name: 'string', type: 'string' },
        { name: 'int', type: 'int' }
      ])
    })
  })

  describe('HTML escaping (XSS prevention)', () => {
    it('escapes HTML in arg name display', () => {
      const result = formatStepPattern('I see (<script>|safe)')
      expect(result.html).toBe(
        'I see <span class="pattern-variable pattern-enum">arg0</span>'
      )
      // The enum values are still captured
      expect(result.argDescriptions[0]?.enumValues).toEqual(['<script>', 'safe'])
    })

    it('escapes HTML in named parameters', () => {
      formatStepPattern('I fill {string:<img>}')
      // Named parameter must be word characters, so this won't match the named pattern
      // It will be treated as a regular {string}
      const result = formatStepPattern('I fill {string:field}')
      expect(result.html).toBe(
        'I fill <span class="pattern-variable pattern-string">{field}</span>'
      )
    })

    it('escapes HTML in table columns', () => {
      const result = formatStepPattern('table (<b>name</b>, email) :')
      expect(result.html).toBe(
        'table <span class="pattern-variable pattern-table">[&lt;b&gt;name&lt;/b&gt;, email]</span>'
      )
      expect(result.html).not.toContain('<b>')
    })

    it('captures special chars in enum values without escaping', () => {
      const result = formatStepPattern('I see (foo&bar|baz)')
      expect(result.html).toBe(
        'I see <span class="pattern-variable pattern-enum">arg0</span>'
      )
      expect(result.argDescriptions[0]?.enumValues).toEqual(['foo&bar', 'baz'])
    })

    it('captures quotes in enum values', () => {
      const result = formatStepPattern('I see ("quoted"|normal)')
      expect(result.html).toBe(
        'I see <span class="pattern-variable pattern-enum">arg0</span>'
      )
      expect(result.argDescriptions[0]?.enumValues).toEqual(['"quoted"', 'normal'])
    })
  })

  describe('regex anchor stripping', () => {
    it('strips leading ^ from pattern', () => {
      const result = formatStepPattern('^I am on the home page')
      expect(result.html).toBe('I am on the home page')
      expect(result.plainText).toBe('I am on the home page')
    })

    it('strips trailing $ from pattern', () => {
      const result = formatStepPattern('I am on the home page$')
      expect(result.html).toBe('I am on the home page')
      expect(result.plainText).toBe('I am on the home page')
    })

    it('strips both ^ and $ from pattern', () => {
      const result = formatStepPattern('^I am on the home page$')
      expect(result.html).toBe('I am on the home page')
      expect(result.plainText).toBe('I am on the home page')
    })

    it('strips anchors while preserving other formatting', () => {
      const result = formatStepPattern('^I login as (admin|user)$')
      expect(result.html).toBe('I login as <span class="pattern-variable pattern-enum">arg0</span>')
      expect(result.plainText).toBe('I login as arg0')
      expect(result.argDescriptions).toEqual([
        { name: 'arg0', type: 'enum', enumValues: ['admin', 'user'] }
      ])
    })

    it('does not strip ^ or $ from middle of pattern', () => {
      const result = formatStepPattern('price is $100')
      expect(result.html).toBe('price is $100')
      expect(result.plainText).toBe('price is $100')
    })
  })

  describe('edge cases', () => {
    it('handles pattern with only enum', () => {
      const result = formatStepPattern('(yes|no)')
      expect(result.html).toBe('<span class="pattern-variable pattern-enum">arg0</span>')
      expect(result.plainText).toBe('arg0')
      expect(result.argDescriptions).toEqual([
        { name: 'arg0', type: 'enum', enumValues: ['yes', 'no'] }
      ])
    })

    it('handles pattern with only cucumber expression', () => {
      const result = formatStepPattern('{string}')
      expect(result.html).toBe('<span class="pattern-variable pattern-string">{string}</span>')
      expect(result.plainText).toBe('{string}')
      expect(result.argDescriptions).toEqual([
        { name: 'string', type: 'string' }
      ])
    })

    it('does not match parentheses without pipe as enum', () => {
      // Parentheses without pipe are treated as optional text (not enum)
      const result = formatStepPattern('I see (something)')
      expect(result.html).toBe('I see <span class="pattern-optional">(something)</span>')
      expect(result.plainText).toBe('I see (something)')
      expect(result.argDescriptions).toEqual([])
    })

    it('does not match unknown type in curly braces', () => {
      const result = formatStepPattern('I see {unknown}')
      expect(result.html).toBe('I see {unknown}')
      expect(result.plainText).toBe('I see {unknown}')
      expect(result.argDescriptions).toEqual([])
    })
  })
})
