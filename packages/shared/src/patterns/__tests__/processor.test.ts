import { describe, it, expect } from 'vitest'
import {
  stripAnchors,
  parseArgs,
  patternToRegex,
  matchStep,
  findBestMatch,
  resolvePattern,
  parseSegments,
  formatPattern,
  getOutlinePlaceholder,
} from '../processor'
import type { StepDefinition } from '../../types/step'

describe('PatternProcessor', () => {
  describe('stripAnchors', () => {
    it('strips leading ^', () => {
      expect(stripAnchors('^I am on the page')).toBe('I am on the page')
    })

    it('strips trailing $', () => {
      expect(stripAnchors('I am on the page$')).toBe('I am on the page')
    })

    it('strips both ^ and $', () => {
      expect(stripAnchors('^I am on the page$')).toBe('I am on the page')
    })

    it('does not strip ^ or $ from middle of pattern', () => {
      expect(stripAnchors('price is $100')).toBe('price is $100')
    })

    it('returns empty string unchanged', () => {
      expect(stripAnchors('')).toBe('')
    })
  })

  describe('parseArgs', () => {
    it('parses Cucumber {string} expressions', () => {
      const args = parseArgs('I fill {string} with {string}')
      expect(args).toHaveLength(2)
      expect(args[0]).toEqual({ name: 'arg0', type: 'string', required: true })
      expect(args[1]).toEqual({ name: 'arg1', type: 'string', required: true })
    })

    it('parses {int} arguments', () => {
      const args = parseArgs('I wait for {int} seconds')
      expect(args).toHaveLength(1)
      expect(args[0]).toEqual({ name: 'arg0', type: 'int', required: true })
    })

    it('parses named arguments {string:fieldName}', () => {
      const args = parseArgs('I fill {string:fieldName} with {string:value}')
      expect(args).toHaveLength(2)
      expect(args[0]).toEqual({ name: 'fieldName', type: 'string', required: true })
      expect(args[1]).toEqual({ name: 'value', type: 'string', required: true })
    })

    it('parses enum values from regex (value1|value2|value3)', () => {
      const args = parseArgs('I am logged in as (admin|user|guest)')
      expect(args).toHaveLength(1)
      expect(args[0]).toEqual({
        name: 'arg0',
        type: 'enum',
        required: true,
        enumValues: ['admin', 'user', 'guest'],
      })
    })

    it('parses enum with anchors', () => {
      const args = parseArgs('^I am logged in as (manager|internal seller)$')
      expect(args).toHaveLength(1)
      expect(args[0]).toEqual({
        name: 'arg0',
        type: 'enum',
        required: true,
        enumValues: ['manager', 'internal seller'],
      })
    })

    it('parses enum with whitespace variations', () => {
      const args = parseArgs('I login as ( admin | user | guest )')
      expect(args).toHaveLength(1)
      expect(args[0]).toEqual({
        name: 'arg0',
        type: 'enum',
        required: true,
        enumValues: ['admin', 'user', 'guest'],
      })
    })

    it('parses multiple enums', () => {
      const args = parseArgs('user (admin|user) can (create|delete)')
      expect(args).toHaveLength(2)
      expect(args[0]).toEqual({
        name: 'arg0',
        type: 'enum',
        required: true,
        enumValues: ['admin', 'user'],
      })
      expect(args[1]).toEqual({
        name: 'arg1',
        type: 'enum',
        required: true,
        enumValues: ['create', 'delete'],
      })
    })

    it('parses table columns from pattern ending with :', () => {
      const args = parseArgs('the following users (email, role) :')
      expect(args).toHaveLength(1)
      expect(args[0]).toEqual({
        name: 'table',
        type: 'table',
        required: true,
        tableColumns: ['email', 'role'],
      })
    })

    it('parses table with multiple columns', () => {
      const args = parseArgs('the following users (id, name, email, role) :')
      expect(args).toHaveLength(1)
      expect(args[0]).toEqual({
        name: 'table',
        type: 'table',
        required: true,
        tableColumns: ['id', 'name', 'email', 'role'],
      })
    })

    it('handles DataTable without column info', () => {
      const args = parseArgs('the following data:')
      expect(args).toHaveLength(1)
      expect(args[0]).toEqual({
        name: 'table',
        type: 'table',
        required: true,
      })
    })

    it('parses mixed enum and Cucumber expressions', () => {
      const args = parseArgs('(admin|user) fills {string}')
      expect(args).toHaveLength(2)
      expect(args[0]).toEqual({
        name: 'arg0',
        type: 'enum',
        required: true,
        enumValues: ['admin', 'user'],
      })
      expect(args[1]).toEqual({
        name: 'arg1',
        type: 'string',
        required: true,
      })
    })

    it('parses mixed enum and int', () => {
      const args = parseArgs('user (admin|user|guest) waits {int} seconds')
      expect(args).toHaveLength(2)
      expect(args[0]).toEqual({
        name: 'arg0',
        type: 'enum',
        required: true,
        enumValues: ['admin', 'user', 'guest'],
      })
      expect(args[1]).toEqual({
        name: 'arg1',
        type: 'int',
        required: true,
      })
    })

    it('returns empty array for simple pattern', () => {
      const args = parseArgs('I am on the home page')
      expect(args).toHaveLength(0)
    })
  })

  describe('patternToRegex', () => {
    it('matches {string} with quoted text', () => {
      const regex = patternToRegex('I click on {string}')
      expect(regex.test('I click on "button"')).toBe(true)
      expect(regex.test('I click on \'button\'')).toBe(true)
      expect(regex.test('I click on button')).toBe(true)
    })

    it('matches {int} with integers', () => {
      const regex = patternToRegex('I wait {int} seconds')
      expect(regex.test('I wait 5 seconds')).toBe(true)
      expect(regex.test('I wait abc seconds')).toBe(false)
    })

    it('matches {float} with decimal numbers', () => {
      const regex = patternToRegex('price is {float}')
      expect(regex.test('price is 9.99')).toBe(true)
      expect(regex.test('price is 10')).toBe(true)
    })

    it('matches enum alternation from regex patterns', () => {
      const regex = patternToRegex('^I am logged in as (manager|seller)$')
      expect(regex.test('I am logged in as manager')).toBe(true)
      expect(regex.test('I am logged in as seller')).toBe(true)
      expect(regex.test('I am logged in as admin')).toBe(false)
    })

    it('strips anchors before matching', () => {
      const regex = patternToRegex('^I see the page$')
      expect(regex.test('I see the page')).toBe(true)
    })

    it('handles named cucumber expressions', () => {
      const regex = patternToRegex('I fill {string:field} with {string:value}')
      expect(regex.test('I fill "email" with "test@test.com"')).toBe(true)
    })

    it('does not match partial text', () => {
      const regex = patternToRegex('I click on {string}')
      expect(regex.test('I click on "button" and more')).toBe(false)
      expect(regex.test('before I click on "button"')).toBe(false)
    })
  })

  describe('matchStep', () => {
    it('matches step text and extracts args', () => {
      const stepDef: StepDefinition = {
        id: 'step-1',
        keyword: 'When',
        pattern: 'I click on {string}',
        location: '',
        args: [{ name: 'element', type: 'string', required: true }],
      }

      const result = matchStep('I click on "button"', stepDef)
      expect(result).not.toBeNull()
      expect(result!.pattern).toBe('I click on {string}')
      expect(result!.args[0]!.value).toBe('button')
    })

    it('matches enum patterns and extracts selected value', () => {
      const stepDef: StepDefinition = {
        id: 'step-2',
        keyword: 'Given',
        pattern: '^I am logged in as (admin|user)$',
        location: '',
        args: [{ name: 'arg0', type: 'enum', required: true, enumValues: ['admin', 'user'] }],
      }

      const result = matchStep('I am logged in as admin', stepDef)
      expect(result).not.toBeNull()
      expect(result!.args[0]!.value).toBe('admin')
    })

    it('returns null for non-matching text', () => {
      const stepDef: StepDefinition = {
        id: 'step-3',
        keyword: 'Given',
        pattern: 'I am on {string}',
        location: '',
        args: [{ name: 'page', type: 'string', required: true }],
      }

      const result = matchStep('I click on "button"', stepDef)
      expect(result).toBeNull()
    })

    it('strips quotes from string captures', () => {
      const stepDef: StepDefinition = {
        id: 'step-4',
        keyword: 'When',
        pattern: 'I fill {string} with {string}',
        location: '',
        args: [
          { name: 'field', type: 'string', required: true },
          { name: 'value', type: 'string', required: true },
        ],
      }

      const result = matchStep('I fill "email" with "test@test.com"', stepDef)
      expect(result).not.toBeNull()
      expect(result!.args[0]!.value).toBe('email')
      expect(result!.args[1]!.value).toBe('test@test.com')
    })
  })

  describe('findBestMatch (specificity)', () => {
    const stringStepDef: StepDefinition = {
      id: 'step-string',
      keyword: 'Given',
      pattern: 'I am logged in as {string}',
      location: '',
      args: [{ name: 'role', type: 'string', required: true }],
    }

    const enumStepDef: StepDefinition = {
      id: 'step-enum',
      keyword: 'Given',
      pattern: '^I am logged in as (manager|seller)$',
      location: '',
      args: [{ name: 'arg0', type: 'enum', required: true, enumValues: ['manager', 'seller'] }],
    }

    it('prefers enum match over string match for matching text', () => {
      const result = findBestMatch('I am logged in as manager', 'Given', [stringStepDef, enumStepDef])
      expect(result.pattern).toBe('^I am logged in as (manager|seller)$')
      expect(result.args[0]!.value).toBe('manager')
    })

    it('falls back to string match for non-enum text', () => {
      const result = findBestMatch('I am logged in as "john"', 'Given', [stringStepDef, enumStepDef])
      expect(result.pattern).toBe('I am logged in as {string}')
      expect(result.args[0]!.value).toBe('john')
    })

    it('falls back to fallback pattern when no definitions match', () => {
      const result = findBestMatch('I do something unknown', 'When', [stringStepDef, enumStepDef])
      expect(result.pattern).toBe('I do something unknown')
      expect(result.args).toHaveLength(0)
    })

    it('extracts quoted strings in fallback', () => {
      const result = findBestMatch('I click on "submit"', 'When', [])
      expect(result.pattern).toBe('I click on {string}')
      expect(result.args[0]!.value).toBe('submit')
    })

    it('respects keyword matching', () => {
      const whenStepDef: StepDefinition = {
        id: 'step-when',
        keyword: 'When',
        pattern: 'I am logged in as {string}',
        location: '',
        args: [{ name: 'role', type: 'string', required: true }],
      }

      // Given keyword should not match a When step definition
      const result = findBestMatch('I am logged in as "admin"', 'Given', [whenStepDef])
      // Should fall through to fallback since keyword doesn't match
      expect(result.pattern).toBe('I am logged in as {string}')
    })

    it('And/But keywords match any step definition', () => {
      const result = findBestMatch('I am logged in as "admin"', 'And', [stringStepDef])
      expect(result.pattern).toBe('I am logged in as {string}')
      expect(result.args[0]!.value).toBe('admin')
    })

    it('preserves outline placeholder value in fallback (no match)', () => {
      const result = findBestMatch('I am logged in as <role>', 'Given', [])
      expect(result.args).toHaveLength(1)
      expect(result.args[0]!.name).toBe('role')
      expect(result.args[0]!.value).toBe('<role>')
    })

    it('converts outline placeholders to {string} in fallback pattern', () => {
      const result = findBestMatch('I am logged in as <role>', 'Given', [])
      expect(result.pattern).toBe('I am logged in as {string}')
    })

    it('handles mixed quoted args and outline placeholders in fallback', () => {
      const result = findBestMatch('I fill "email" with <value>', 'When', [])
      expect(result.pattern).toBe('I fill {string} with {string}')
      expect(result.args).toHaveLength(2)
      expect(result.args[0]!.value).toBe('email')
      expect(result.args[1]!.value).toBe('<value>')
    })

    it('matches outline placeholder text against {string} step definition', () => {
      const result = findBestMatch('I am logged in as <role>', 'Given', [stringStepDef])
      expect(result.pattern).toBe('I am logged in as {string}')
      expect(result.args[0]!.value).toBe('<role>')
    })
  })

  describe('resolvePattern', () => {
    it('resolves enum patterns with selected value', () => {
      const result = resolvePattern(
        '^I am logged in as (admin|user)$',
        [{ type: 'enum', value: 'admin', enumValues: ['admin', 'user'] }]
      )
      expect(result).toBe('I am logged in as admin')
    })

    it('resolves Cucumber string placeholders with quoted values', () => {
      const result = resolvePattern(
        'I fill {string} with {string}',
        [
          { type: 'string', value: 'email' },
          { type: 'string', value: 'test@test.com' },
        ]
      )
      expect(result).toBe('I fill "email" with "test@test.com"')
    })

    it('resolves int placeholders without quotes', () => {
      const result = resolvePattern(
        'I wait {int} seconds',
        [{ type: 'int', value: '5' }]
      )
      expect(result).toBe('I wait 5 seconds')
    })

    it('handles mixed enum and string args', () => {
      const result = resolvePattern(
        '(admin|user) fills {string}',
        [
          { type: 'enum', value: 'admin', enumValues: ['admin', 'user'] },
          { type: 'string', value: 'email' },
        ]
      )
      expect(result).toBe('admin fills "email"')
    })

    it('falls back to first enum value when no value set', () => {
      const result = resolvePattern(
        'I am logged in as (admin|user)',
        [{ type: 'enum', value: '', enumValues: ['admin', 'user'] }]
      )
      expect(result).toBe('I am logged in as admin')
    })
  })

  describe('parseSegments', () => {
    it('parses simple text-only pattern', () => {
      const segments = parseSegments('I am on the home page')
      expect(segments).toHaveLength(1)
      expect(segments[0]).toEqual({ type: 'text', value: 'I am on the home page' })
    })

    it('parses Cucumber expression segments', () => {
      const segments = parseSegments('I fill {string} with {string}', [
        { name: 'field', type: 'string', value: 'email' },
        { name: 'val', type: 'string', value: 'test' },
      ])
      expect(segments).toHaveLength(4)
      expect(segments[0]).toEqual({ type: 'text', value: 'I fill ' })
      expect(segments[1]!.type).toBe('arg')
      expect(segments[1]!.arg!.name).toBe('field')
      expect(segments[1]!.arg!.value).toBe('email')
      expect(segments[2]).toEqual({ type: 'text', value: ' with ' })
      expect(segments[3]!.type).toBe('arg')
      expect(segments[3]!.arg!.name).toBe('val')
      expect(segments[3]!.arg!.value).toBe('test')
    })

    it('parses enum pattern segments', () => {
      const segments = parseSegments('I login as (admin|user)', [
        { name: 'arg0', type: 'enum', value: 'admin', enumValues: ['admin', 'user'] },
      ])
      expect(segments).toHaveLength(2)
      expect(segments[0]).toEqual({ type: 'text', value: 'I login as ' })
      expect(segments[1]!.type).toBe('arg')
      expect(segments[1]!.arg!.type).toBe('enum')
      expect(segments[1]!.arg!.enumValues).toEqual(['admin', 'user'])
    })

    it('handles pattern with no args parameter', () => {
      const segments = parseSegments('I fill {string} with {string}')
      expect(segments).toHaveLength(4)
      expect(segments[0]).toEqual({ type: 'text', value: 'I fill ' })
      expect(segments[1]!.type).toBe('arg')
      expect(segments[1]!.arg!.name).toBe('arg0')
      expect(segments[1]!.arg!.value).toBe('')
      expect(segments[2]).toEqual({ type: 'text', value: ' with ' })
      expect(segments[3]!.type).toBe('arg')
      expect(segments[3]!.arg!.name).toBe('arg1')
    })
  })

  describe('formatPattern', () => {
    it('returns unchanged for plain patterns', () => {
      const result = formatPattern('I am on the home page')
      expect(result.html).toBe('I am on the home page')
      expect(result.plainText).toBe('I am on the home page')
      expect(result.argDescriptions).toEqual([])
    })

    it('strips anchors', () => {
      const result = formatPattern('^I am on the home page$')
      expect(result.html).toBe('I am on the home page')
      expect(result.plainText).toBe('I am on the home page')
    })

    it('formats enums with styled spans', () => {
      const result = formatPattern('I login as (admin|user|guest)')
      expect(result.html).toBe('I login as <span class="pattern-variable pattern-enum">arg0</span>')
      expect(result.plainText).toBe('I login as arg0')
      expect(result.argDescriptions).toEqual([
        { name: 'arg0', type: 'enum', enumValues: ['admin', 'user', 'guest'] },
      ])
    })

    it('formats Cucumber expressions with styled spans', () => {
      const result = formatPattern('I fill {string} with {string}')
      expect(result.html).toBe(
        'I fill <span class="pattern-variable pattern-string">{string}</span> with <span class="pattern-variable pattern-string">{string}</span>'
      )
      expect(result.plainText).toBe('I fill {string} with {string}')
    })

    it('formats named parameters', () => {
      const result = formatPattern('I fill {string:fieldName} with {string:value}')
      expect(result.html).toBe(
        'I fill <span class="pattern-variable pattern-string">{fieldName}</span> with <span class="pattern-variable pattern-string">{value}</span>'
      )
      expect(result.plainText).toBe('I fill {fieldName} with {value}')
    })

    it('formats table columns', () => {
      const result = formatPattern('I see users (name, email, role) :')
      expect(result.html).toBe(
        'I see users <span class="pattern-variable pattern-table">[name, email, role]</span>'
      )
      expect(result.plainText).toBe('I see users [name, email, role]')
    })

    it('escapes HTML entities in table columns', () => {
      const result = formatPattern('table (<b>name</b>, email) :')
      expect(result.html).toBe(
        'table <span class="pattern-variable pattern-table">[&lt;b&gt;name&lt;/b&gt;, email]</span>'
      )
      expect(result.html).not.toContain('<b>')
    })

    it('strips anchors while preserving other formatting', () => {
      const result = formatPattern('^I login as (admin|user)$')
      expect(result.html).toBe('I login as <span class="pattern-variable pattern-enum">arg0</span>')
      expect(result.plainText).toBe('I login as arg0')
      expect(result.argDescriptions).toEqual([
        { name: 'arg0', type: 'enum', enumValues: ['admin', 'user'] },
      ])
    })

    it('handles empty string', () => {
      const result = formatPattern('')
      expect(result.html).toBe('')
      expect(result.plainText).toBe('')
      expect(result.argDescriptions).toEqual([])
    })
  })

  /**
   * Diagnostic tests for regex-based step definitions from playwright-bdd.
   *
   * When a step is defined with a RegExp (e.g. Given(/^I am logged in as (manager|seller)$/, ...)),
   * bddgen-export.js extracts the pattern via RegExp.source, producing strings like:
   *   "^I am logged in as (manager|seller)$"
   *   "^I click on \"([^\"]*)\"$"
   *   "^I should see (\\d+) items$"
   *
   * These tests trace each stage to find where the pipeline breaks.
   */
  describe('regex step pipeline diagnostics', () => {
    // ---------------------------------------------------------------
    // Case 1: Enum-style regex  /^I am logged in as (manager|seller)$/
    // This should work because (x|y) matches our enum handler.
    // ---------------------------------------------------------------
    describe('enum regex: ^I am logged in as (manager|seller)$', () => {
      const pattern = '^I am logged in as (manager|seller)$'

      it('parseArgs extracts enum arg', () => {
        const args = parseArgs(pattern)
        expect(args).toHaveLength(1)
        expect(args[0]!.type).toBe('enum')
        expect(args[0]!.enumValues).toEqual(['manager', 'seller'])
      })

      it('patternToRegex produces a working regex', () => {
        const regex = patternToRegex(pattern)
        expect(regex.test('I am logged in as manager')).toBe(true)
        expect(regex.test('I am logged in as seller')).toBe(true)
        expect(regex.test('I am logged in as admin')).toBe(false)
      })

      it('matchStep extracts enum value', () => {
        const stepDef: StepDefinition = {
          id: 'regex-enum-1',
          keyword: 'Given',
          pattern,
          location: '',
          args: parseArgs(pattern),
        }
        const result = matchStep('I am logged in as manager', stepDef)
        expect(result).not.toBeNull()
        expect(result!.args[0]!.value).toBe('manager')
        expect(result!.args[0]!.type).toBe('enum')
      })

      it('resolvePattern produces correct Gherkin text', () => {
        const text = resolvePattern(pattern, [
          { type: 'enum', value: 'seller', enumValues: ['manager', 'seller'] },
        ])
        expect(text).toBe('I am logged in as seller')
      })

      it('formatPattern displays cleanly', () => {
        const fmt = formatPattern(pattern)
        expect(fmt.plainText).not.toContain('^')
        expect(fmt.plainText).not.toContain('$')
        expect(fmt.argDescriptions).toHaveLength(1)
        expect(fmt.argDescriptions[0]!.type).toBe('enum')
      })
    })

    // ---------------------------------------------------------------
    // Case 2: Capture-group regex  /^I click on "([^"]*)"$/
    // RegExp.source = '^I click on "([^"]*)"$'
    // The ([^"]*) is a raw regex capture group, NOT a (x|y) enum.
    // Known limitation: raw regex capture groups are not supported.
    // ---------------------------------------------------------------
    describe('capture group regex: ^I click on "([^"]*)"$', () => {
      const pattern = '^I click on "([^"]*)"$'

      it('parseArgs returns no args (raw capture groups not recognized)', () => {
        const args = parseArgs(pattern)
        expect(args).toHaveLength(0)
      })

      it('patternToRegex corrupts raw regex syntax', () => {
        const regex = patternToRegex(pattern)
        // ([^"]*) is treated as optional text, not a capture group
        // The resulting regex cannot match the intended text
        expect(regex.test('I click on "submit"')).toBe(false)
      })

      it('matchStep returns null (regex cannot match)', () => {
        const stepDef: StepDefinition = {
          id: 'regex-cap-1',
          keyword: 'When',
          pattern,
          location: '',
          args: parseArgs(pattern),
        }
        const result = matchStep('I click on "submit"', stepDef)
        expect(result).toBeNull()
      })

      it('findBestMatch falls back to inferred pattern', () => {
        const stepDef: StepDefinition = {
          id: 'regex-cap-1',
          keyword: 'When',
          pattern,
          location: '',
          args: parseArgs(pattern),
        }
        const result = findBestMatch('I click on "submit"', 'When', [stepDef])
        // Falls back to creating a pattern from the text itself
        expect(result.pattern).not.toBe(pattern)
        expect(result.pattern).toBe('I click on {string}')
        expect(result.args).toHaveLength(1)
        expect(result.args[0]!.value).toBe('submit')
      })
    })

    // ---------------------------------------------------------------
    // Case 3: Numeric capture group  /^I should see (\d+) items$/
    // RegExp.source = '^I should see (\\d+) items$'
    // Known limitation: raw regex capture groups are not supported.
    // ---------------------------------------------------------------
    describe('numeric capture regex: ^I should see (\\d+) items$', () => {
      const pattern = '^I should see (\\d+) items$'

      it('parseArgs returns no args (raw capture groups not recognized)', () => {
        const args = parseArgs(pattern)
        expect(args).toHaveLength(0)
      })

      it('patternToRegex corrupts raw regex syntax', () => {
        const regex = patternToRegex(pattern)
        // (\\d+) is treated as optional text, not a numeric capture group
        expect(regex.test('I should see 5 items')).toBe(false)
      })

      it('matchStep returns null (regex cannot match)', () => {
        const stepDef: StepDefinition = {
          id: 'regex-num-1',
          keyword: 'Then',
          pattern,
          location: '',
          args: parseArgs(pattern),
        }
        const result = matchStep('I should see 5 items', stepDef)
        expect(result).toBeNull()
      })
    })

    // ---------------------------------------------------------------
    // Case 4: Mixed regex with string and number captures
    // /^I fill "([^"]*)" with "([^"]*)"$/
    // RegExp.source = '^I fill "([^"]*)" with "([^"]*)"$'
    // Known limitation: raw regex capture groups are not supported.
    // ---------------------------------------------------------------
    describe('multi capture regex: ^I fill "([^"]*)" with "([^"]*)"$', () => {
      const pattern = '^I fill "([^"]*)" with "([^"]*)"$'

      it('parseArgs returns no args (raw capture groups not recognized)', () => {
        const args = parseArgs(pattern)
        expect(args).toHaveLength(0)
      })

      it('patternToRegex corrupts raw regex syntax', () => {
        const regex = patternToRegex(pattern)
        // Both ([^"]*) groups are treated as optional text
        expect(regex.test('I fill "email" with "test@test.com"')).toBe(false)
      })

      it('findBestMatch falls back to inferred pattern', () => {
        const stepDef: StepDefinition = {
          id: 'regex-multi-1',
          keyword: 'When',
          pattern,
          location: '',
          args: parseArgs(pattern),
        }
        const result = findBestMatch('I fill "email" with "test@test.com"', 'When', [stepDef])
        expect(result.pattern).not.toBe(pattern)
        expect(result.pattern).toBe('I fill {string} with {string}')
        expect(result.args).toHaveLength(2)
        expect(result.args[0]!.value).toBe('email')
        expect(result.args[1]!.value).toBe('test@test.com')
      })
    })

    // ---------------------------------------------------------------
    // Case 5: Simple regex without captures /^I am on the home page$/
    // RegExp.source = '^I am on the home page$'
    // ---------------------------------------------------------------
    describe('simple regex: ^I am on the home page$', () => {
      const pattern = '^I am on the home page$'

      it('parseArgs — should return empty args', () => {
        const args = parseArgs(pattern)
        expect(args).toHaveLength(0)
      })

      it('patternToRegex — should match the text', () => {
        const regex = patternToRegex(pattern)
        expect(regex.test('I am on the home page')).toBe(true)
      })

      it('matchStep — should match', () => {
        const stepDef: StepDefinition = {
          id: 'regex-simple-1',
          keyword: 'Given',
          pattern,
          location: '',
          args: [],
        }
        const result = matchStep('I am on the home page', stepDef)
        expect(result).not.toBeNull()
      })
    })
  })

  describe('getOutlinePlaceholder', () => {
    it('returns name for valid <var> placeholder', () => {
      expect(getOutlinePlaceholder('<button>')).toBe('button')
    })

    it('returns name for underscore-prefixed placeholder', () => {
      expect(getOutlinePlaceholder('<_role>')).toBe('_role')
    })

    it('returns name for placeholder with numbers', () => {
      expect(getOutlinePlaceholder('<arg1>')).toBe('arg1')
    })

    it('returns null for plain text', () => {
      expect(getOutlinePlaceholder('hello')).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(getOutlinePlaceholder('')).toBeNull()
    })

    it('returns null for partial angle brackets', () => {
      expect(getOutlinePlaceholder('<button')).toBeNull()
      expect(getOutlinePlaceholder('button>')).toBeNull()
    })

    it('returns null for quoted placeholder', () => {
      expect(getOutlinePlaceholder('"<button>"')).toBeNull()
    })

    it('returns null for placeholder with spaces', () => {
      expect(getOutlinePlaceholder('<my button>')).toBeNull()
    })

    it('returns null for placeholder starting with number', () => {
      expect(getOutlinePlaceholder('<1arg>')).toBeNull()
    })
  })

  describe('resolvePattern with outline placeholders', () => {
    it('does not quote <var> values in string args', () => {
      const result = resolvePattern(
        'I click on {string}',
        [{ type: 'string', value: '<button>' }]
      )
      expect(result).toBe('I click on <button>')
    })

    it('still quotes regular string values', () => {
      const result = resolvePattern(
        'I click on {string}',
        [{ type: 'string', value: 'submit' }]
      )
      expect(result).toBe('I click on "submit"')
    })

    it('handles mix of placeholder and regular args', () => {
      const result = resolvePattern(
        'I fill {string} with {string}',
        [
          { type: 'string', value: '<field>' },
          { type: 'string', value: 'hello' },
        ]
      )
      expect(result).toBe('I fill <field> with "hello"')
    })

    it('does not quote <var> in int args (no change since int never quoted)', () => {
      const result = resolvePattern(
        'I wait {int} seconds',
        [{ type: 'int', value: '<duration>' }]
      )
      expect(result).toBe('I wait <duration> seconds')
    })
  })

  // ================================================================
  // Cucumber Expressions Spec alignment tests
  // ================================================================

  describe('{int} with negative numbers', () => {
    it('matches negative integers', () => {
      const regex = patternToRegex('the temperature is {int} degrees')
      expect(regex.test('the temperature is -19 degrees')).toBe(true)
      expect(regex.test('the temperature is 19 degrees')).toBe(true)
    })

    it('extracts negative integer value', () => {
      const stepDef: StepDefinition = {
        id: 'neg-int',
        keyword: 'Given',
        pattern: 'the balance is {int}',
        location: '',
        args: [{ name: 'arg0', type: 'int', required: true }],
      }
      const result = matchStep('the balance is -42', stepDef)
      expect(result).not.toBeNull()
      expect(result!.args[0]!.value).toBe('-42')
    })
  })

  describe('{float} with negatives and leading dot', () => {
    it('matches negative float', () => {
      const regex = patternToRegex('price is {float}')
      expect(regex.test('price is -9.2')).toBe(true)
    })

    it('matches leading dot float', () => {
      const regex = patternToRegex('price is {float}')
      expect(regex.test('price is .8')).toBe(true)
    })

    it('matches regular float', () => {
      const regex = patternToRegex('price is {float}')
      expect(regex.test('price is 9.99')).toBe(true)
    })

    it('matches integer as float', () => {
      const regex = patternToRegex('price is {float}')
      expect(regex.test('price is 10')).toBe(true)
    })

    it('does not match non-numeric text', () => {
      const regex = patternToRegex('price is {float}')
      expect(regex.test('price is abc')).toBe(false)
    })

    it('extracts negative float value', () => {
      const stepDef: StepDefinition = {
        id: 'neg-float',
        keyword: 'Given',
        pattern: 'the rate is {float}',
        location: '',
        args: [{ name: 'arg0', type: 'float', required: true }],
      }
      const result = matchStep('the rate is -3.14', stepDef)
      expect(result).not.toBeNull()
      expect(result!.args[0]!.value).toBe('-3.14')
    })
  })

  describe('{word} parameter type', () => {
    it('parseArgs detects {word}', () => {
      const args = parseArgs('I select the {word} option')
      expect(args).toHaveLength(1)
      expect(args[0]).toEqual({ name: 'arg0', type: 'word', required: true })
    })

    it('matches single word without whitespace', () => {
      const regex = patternToRegex('I click {word}')
      expect(regex.test('I click submit')).toBe(true)
      expect(regex.test('I click button-primary')).toBe(true)
    })

    it('does not match multi-word text', () => {
      const regex = patternToRegex('I click {word}')
      expect(regex.test('I click submit button')).toBe(false)
    })

    it('extracts word value', () => {
      const stepDef: StepDefinition = {
        id: 'word-1',
        keyword: 'When',
        pattern: 'I click {word}',
        location: '',
        args: [{ name: 'arg0', type: 'word', required: true }],
      }
      const result = matchStep('I click submit', stepDef)
      expect(result).not.toBeNull()
      expect(result!.args[0]!.value).toBe('submit')
    })

    it('has specificity between any and string', () => {
      const wordStepDef: StepDefinition = {
        id: 'word-def',
        keyword: 'When',
        pattern: 'I click {word}',
        location: '',
        args: [{ name: 'arg0', type: 'word', required: true }],
      }
      const stringStepDef: StepDefinition = {
        id: 'string-def',
        keyword: 'When',
        pattern: 'I click {string}',
        location: '',
        args: [{ name: 'arg0', type: 'string', required: true }],
      }
      // String should win over word
      const result = findBestMatch('I click submit', 'When', [wordStepDef, stringStepDef])
      expect(result.pattern).toBe('I click {string}')
    })

    it('formats {word} in formatPattern', () => {
      const result = formatPattern('I click {word}')
      expect(result.html).toContain('pattern-word')
      expect(result.plainText).toBe('I click {word}')
      expect(result.argDescriptions).toHaveLength(1)
      expect(result.argDescriptions[0]!.type).toBe('word')
    })

    it('parseSegments handles {word}', () => {
      const segments = parseSegments('I click {word}', [
        { name: 'target', type: 'word', value: 'submit' },
      ])
      expect(segments).toHaveLength(2)
      expect(segments[1]!.type).toBe('arg')
      expect(segments[1]!.arg!.type).toBe('word')
      expect(segments[1]!.arg!.value).toBe('submit')
    })
  })

  describe('optional text: (s)', () => {
    it('patternToRegex matches with optional text present', () => {
      const regex = patternToRegex('I have {int} cucumber(s)')
      expect(regex.test('I have 5 cucumbers')).toBe(true)
    })

    it('patternToRegex matches without optional text', () => {
      const regex = patternToRegex('I have {int} cucumber(s)')
      expect(regex.test('I have 1 cucumber')).toBe(true)
    })

    it('does not produce args for optional text', () => {
      const args = parseArgs('I have {int} cucumber(s)')
      expect(args).toHaveLength(1)
      expect(args[0]!.type).toBe('int')
    })

    it('resolvePattern expands optional text', () => {
      const result = resolvePattern(
        'I have {int} cucumber(s)',
        [{ type: 'int', value: '5' }]
      )
      expect(result).toBe('I have 5 cucumbers')
    })

    it('formatPattern shows optional text with styling', () => {
      const result = formatPattern('I have {int} cucumber(s)')
      expect(result.html).toContain('pattern-optional')
    })
  })

  describe('alternative text: belly/stomach', () => {
    it('patternToRegex matches first alternative', () => {
      const regex = patternToRegex('I have a belly/stomach ache')
      expect(regex.test('I have a belly ache')).toBe(true)
    })

    it('patternToRegex matches second alternative', () => {
      const regex = patternToRegex('I have a belly/stomach ache')
      expect(regex.test('I have a stomach ache')).toBe(true)
    })

    it('does not match non-alternative text', () => {
      const regex = patternToRegex('I have a belly/stomach ache')
      expect(regex.test('I have a head ache')).toBe(false)
    })

    it('does not produce args for alternatives', () => {
      const args = parseArgs('I have a belly/stomach ache')
      expect(args).toHaveLength(0)
    })

    it('resolvePattern picks first alternative', () => {
      const result = resolvePattern(
        'I have a belly/stomach ache',
        []
      )
      expect(result).toBe('I have a belly ache')
    })

    it('formatPattern shows alternative with styling', () => {
      const result = formatPattern('I have a belly/stomach ache')
      expect(result.html).toContain('pattern-alternative')
      expect(result.html).toContain('belly/stomach')
    })

    it('combined with optional text', () => {
      const regex = patternToRegex('I have {int} cucumber(s) in my belly/stomach')
      expect(regex.test('I have 5 cucumbers in my belly')).toBe(true)
      expect(regex.test('I have 1 cucumber in my stomach')).toBe(true)
    })
  })

  describe('escaping: \\{, \\(, \\/', () => {
    it('\\{ produces literal { in regex', () => {
      const regex = patternToRegex('I see \\{braces\\}')
      expect(regex.test('I see {braces}')).toBe(true)
    })

    it('\\{ is not parsed as parameter', () => {
      const args = parseArgs('I see \\{string\\}')
      expect(args).toHaveLength(0)
    })

    it('\\( produces literal ( in regex', () => {
      const regex = patternToRegex('I see \\(parens\\)')
      expect(regex.test('I see (parens)')).toBe(true)
    })

    it('\\/ produces literal / in regex', () => {
      const regex = patternToRegex('path is a\\/b')
      expect(regex.test('path is a/b')).toBe(true)
    })

    it('\\/ is not parsed as alternative', () => {
      const regex = patternToRegex('path is a\\/b')
      expect(regex.test('path is a')).toBe(false) // Would be true if treated as alternative
    })

    it('resolvePattern strips escape backslashes', () => {
      const result = resolvePattern('I see \\{braces\\}', [])
      expect(result).toBe('I see {braces}')
    })

    it('formatPattern strips escape backslashes', () => {
      const result = formatPattern('I see \\{braces\\}')
      expect(result.html).toContain('I see {braces}')
      expect(result.html).not.toContain('\\')
    })
  })

  describe('anonymous {} parameter', () => {
    it('parseArgs detects {} as any type', () => {
      const args = parseArgs('I see {} on the page')
      expect(args).toHaveLength(1)
      expect(args[0]!.type).toBe('any')
    })

    it('patternToRegex matches any text including spaces', () => {
      const regex = patternToRegex('I see {}')
      expect(regex.test('I see hello world')).toBe(true)
      expect(regex.test('I see something')).toBe(true)
    })

    it('does not match empty text for {}', () => {
      const regex = patternToRegex('I see {} here')
      expect(regex.test('I see  here')).toBe(false)
    })

    it('extracts value from anonymous parameter', () => {
      const stepDef: StepDefinition = {
        id: 'anon-1',
        keyword: 'Then',
        pattern: 'I see {}',
        location: '',
        args: [{ name: 'arg0', type: 'any', required: true }],
      }
      const result = matchStep('I see hello world', stepDef)
      expect(result).not.toBeNull()
      expect(result!.args[0]!.value).toBe('hello world')
    })

    it('formatPattern shows anonymous {} with styling', () => {
      const result = formatPattern('I see {}')
      expect(result.html).toContain('pattern-any')
      expect(result.argDescriptions).toHaveLength(1)
      expect(result.argDescriptions[0]!.type).toBe('any')
    })

    it('parseSegments handles {}', () => {
      const segments = parseSegments('I see {}', [
        { name: 'arg0', type: 'any', value: 'hello world' },
      ])
      expect(segments).toHaveLength(2)
      expect(segments[1]!.type).toBe('arg')
      expect(segments[1]!.arg!.type).toBe('any')
      expect(segments[1]!.arg!.value).toBe('hello world')
    })
  })

  // ================================================================
  // Mixed type combinations and edge cases
  // ================================================================

  describe('mixed parameter combinations', () => {
    it('handles enum + int in same pattern', () => {
      const pattern = '(admin|user) waits {int} seconds'
      const args = parseArgs(pattern)
      expect(args).toHaveLength(2)
      expect(args[0]!.type).toBe('enum')
      expect(args[1]!.type).toBe('int')

      const regex = patternToRegex(pattern)
      expect(regex.test('admin waits 5 seconds')).toBe(true)
      expect(regex.test('user waits 10 seconds')).toBe(true)
      expect(regex.test('guest waits 5 seconds')).toBe(false)
    })

    it('handles {word} + {string} in same pattern', () => {
      const pattern = 'I click {word} with value {string}'
      const args = parseArgs(pattern)
      expect(args).toHaveLength(2)
      expect(args[0]!.type).toBe('word')
      expect(args[1]!.type).toBe('string')
    })

    it('handles {float} + enum in same pattern', () => {
      const pattern = 'price is {float} (USD|EUR)'
      const args = parseArgs(pattern)
      expect(args).toHaveLength(2)
      expect(args[0]!.type).toBe('float')
      expect(args[1]!.type).toBe('enum')

      const regex = patternToRegex(pattern)
      expect(regex.test('price is 9.99 USD')).toBe(true)
      expect(regex.test('price is -3.50 EUR')).toBe(true)
      expect(regex.test('price is 9.99 GBP')).toBe(false)
    })

    it('handles {} + {string} in same pattern', () => {
      const pattern = 'I see {} then click {string}'
      const args = parseArgs(pattern)
      expect(args).toHaveLength(2)
      expect(args[0]!.type).toBe('any')
      expect(args[1]!.type).toBe('string')
    })

    it('handles optional text + enum + cucumber expression', () => {
      const pattern = 'I have {int} item(s) as (admin|user)'
      const args = parseArgs(pattern)
      expect(args).toHaveLength(2)
      expect(args[0]!.type).toBe('int')
      expect(args[1]!.type).toBe('enum')

      const regex = patternToRegex(pattern)
      expect(regex.test('I have 5 items as admin')).toBe(true)
      expect(regex.test('I have 1 item as user')).toBe(true)
    })

    it('handles alternative text + cucumber expression', () => {
      const pattern = 'I have a belly/stomach ache for {int} minutes'
      const args = parseArgs(pattern)
      expect(args).toHaveLength(1)
      expect(args[0]!.type).toBe('int')

      const regex = patternToRegex(pattern)
      expect(regex.test('I have a belly ache for 5 minutes')).toBe(true)
      expect(regex.test('I have a stomach ache for 10 minutes')).toBe(true)
    })

    it('handles escaping alongside real parameters', () => {
      const pattern = 'I see \\{literal\\} and {string}'
      const args = parseArgs(pattern)
      expect(args).toHaveLength(1)
      expect(args[0]!.type).toBe('string')

      const regex = patternToRegex(pattern)
      expect(regex.test('I see {literal} and "hello"')).toBe(true)
    })
  })

  describe('resolvePattern with new types', () => {
    it('resolves {word} without quotes', () => {
      const result = resolvePattern(
        'I click {word}',
        [{ type: 'word', value: 'submit' }]
      )
      expect(result).toBe('I click submit')
    })

    it('resolves {float} without quotes', () => {
      const result = resolvePattern(
        'price is {float}',
        [{ type: 'float', value: '-3.14' }]
      )
      expect(result).toBe('price is -3.14')
    })

    it('resolves pattern with alternative text', () => {
      const result = resolvePattern(
        'I have a belly/stomach ache',
        []
      )
      expect(result).toBe('I have a belly ache')
    })

    it('resolves pattern with optional and alternative text', () => {
      const result = resolvePattern(
        'I have {int} cucumber(s) in my belly/stomach',
        [{ type: 'int', value: '3' }]
      )
      expect(result).toBe('I have 3 cucumbers in my belly')
    })

    it('resolves escaped parens (escape stripped, then treated as optional)', () => {
      // stripEscapes turns \( → (, \) → ), then optional text handler expands (parens) → parens
      const result = resolvePattern('I see \\(parens\\)', [])
      expect(result).toBe('I see parens')
    })

    it('resolves escaped forward slash (escape stripped, then treated as alternative)', () => {
      // stripEscapes turns \/ → /, then alternative handler picks first: a/b → a
      const result = resolvePattern('path is a\\/b', [])
      expect(result).toBe('path is a')
    })
  })

  describe('specificity ranking', () => {
    it('table > enum > int > string > word > any', () => {
      const defs: StepDefinition[] = [
        {
          id: 'any-def',
          keyword: 'Given',
          pattern: 'I have {} items',
          location: '',
          args: [{ name: 'arg0', type: 'any', required: true }],
        },
        {
          id: 'word-def',
          keyword: 'Given',
          pattern: 'I have {word} items',
          location: '',
          args: [{ name: 'arg0', type: 'word', required: true }],
        },
        {
          id: 'string-def',
          keyword: 'Given',
          pattern: 'I have {string} items',
          location: '',
          args: [{ name: 'arg0', type: 'string', required: true }],
        },
        {
          id: 'int-def',
          keyword: 'Given',
          pattern: 'I have {int} items',
          location: '',
          args: [{ name: 'arg0', type: 'int', required: true }],
        },
      ]

      // int should win when all match (highest specificity among these)
      const result = findBestMatch('I have 5 items', 'Given', defs)
      expect(result.pattern).toBe('I have {int} items')
    })

    it('enum beats string', () => {
      const defs: StepDefinition[] = [
        {
          id: 'string-def',
          keyword: 'Given',
          pattern: 'status is {string}',
          location: '',
          args: [{ name: 'arg0', type: 'string', required: true }],
        },
        {
          id: 'enum-def',
          keyword: 'Given',
          pattern: '^status is (active|inactive)$',
          location: '',
          args: [{ name: 'arg0', type: 'enum', required: true, enumValues: ['active', 'inactive'] }],
        },
      ]

      const result = findBestMatch('status is active', 'Given', defs)
      expect(result.pattern).toBe('^status is (active|inactive)$')
    })
  })

  describe('table pattern handling', () => {
    const tablePattern = 'I fill in the form with the following data (Field, Value):'

    it('patternToRegex matches step text without column spec', () => {
      const regex = patternToRegex(tablePattern)
      expect(regex.test('I fill in the form with the following data:')).toBe(true)
    })

    it('patternToRegex does not match without trailing colon', () => {
      const regex = patternToRegex(tablePattern)
      expect(regex.test('I fill in the form with the following data')).toBe(false)
    })

    it('matchStep creates table arg without consuming capture groups', () => {
      const stepDef: StepDefinition = {
        id: 'table-1',
        keyword: 'When',
        pattern: tablePattern,
        location: '',
        args: parseArgs(tablePattern),
      }

      const result = matchStep('I fill in the form with the following data:', stepDef)
      expect(result).not.toBeNull()
      expect(result!.args).toHaveLength(1)
      expect(result!.args[0]!.type).toBe('table')
      expect(result!.args[0]!.tableColumns).toEqual(['Field', 'Value'])
      expect(result!.args[0]!.value).toBe('')
    })

    it('resolvePattern strips column spec and keeps colon', () => {
      const result = resolvePattern(
        tablePattern,
        [{ type: 'table', value: '' }]
      )
      expect(result).toBe('I fill in the form with the following data:')
    })

    it('findBestMatch matches table step definitions', () => {
      const stepDef: StepDefinition = {
        id: 'table-match',
        keyword: 'When',
        pattern: tablePattern,
        location: '',
        args: parseArgs(tablePattern),
      }

      const result = findBestMatch(
        'I fill in the form with the following data:',
        'When',
        [stepDef]
      )
      expect(result.pattern).toBe(tablePattern)
      expect(result.args).toHaveLength(1)
      expect(result.args[0]!.type).toBe('table')
      expect(result.args[0]!.tableColumns).toEqual(['Field', 'Value'])
    })

    it('table step has highest specificity', () => {
      const tableStepDef: StepDefinition = {
        id: 'table-def',
        keyword: 'When',
        pattern: tablePattern,
        location: '',
        args: parseArgs(tablePattern),
      }
      const stringStepDef: StepDefinition = {
        id: 'string-def',
        keyword: 'When',
        pattern: 'I fill in the form with the following data {string}',
        location: '',
        args: [{ name: 'arg0', type: 'string', required: true }],
      }

      // Table step should be preferred over string step
      const result = findBestMatch(
        'I fill in the form with the following data:',
        'When',
        [stringStepDef, tableStepDef]
      )
      expect(result.pattern).toBe(tablePattern)
    })
  })

  describe('parseSegments with new types', () => {
    it('handles optional text as regular text segment', () => {
      const segments = parseSegments('I have {int} cucumber(s)', [
        { name: 'count', type: 'int', value: '5' },
      ])
      // Optional text is part of the text segments, not a separate arg
      expect(segments.some(s => s.type === 'arg' && s.arg!.type === 'int')).toBe(true)
    })

    it('handles multiple argument types in order', () => {
      const segments = parseSegments('(admin|user) fills {string} with {int}', [
        { name: 'role', type: 'enum', value: 'admin', enumValues: ['admin', 'user'] },
        { name: 'field', type: 'string', value: 'email' },
        { name: 'count', type: 'int', value: '3' },
      ])
      const argSegments = segments.filter(s => s.type === 'arg')
      expect(argSegments).toHaveLength(3)
      expect(argSegments[0]!.arg!.type).toBe('enum')
      expect(argSegments[1]!.arg!.type).toBe('string')
      expect(argSegments[2]!.arg!.type).toBe('int')
    })
  })

  describe('formatPattern with new types', () => {
    it('formats {int} with pattern-int class', () => {
      const result = formatPattern('I wait {int} seconds')
      expect(result.html).toContain('pattern-int')
      expect(result.argDescriptions).toHaveLength(1)
      expect(result.argDescriptions[0]!.type).toBe('int')
    })

    it('formats {float} with pattern-float class', () => {
      const result = formatPattern('price is {float}')
      expect(result.html).toContain('pattern-float')
      expect(result.argDescriptions).toHaveLength(1)
      expect(result.argDescriptions[0]!.type).toBe('float')
    })

    it('formats mixed pattern with all styling', () => {
      const result = formatPattern('I have {int} cucumber(s) in my belly/stomach as (admin|user)')
      expect(result.html).toContain('pattern-int')
      expect(result.html).toContain('pattern-optional')
      expect(result.html).toContain('pattern-alternative')
      expect(result.html).toContain('pattern-enum')
      // formatPattern processes enums before cucumber expressions,
      // so enum appears first in argDescriptions
      expect(result.argDescriptions).toHaveLength(2)
      expect(result.argDescriptions[0]!.type).toBe('enum')
      expect(result.argDescriptions[1]!.type).toBe('int')
    })

    it('formats {} with pattern-any class', () => {
      const result = formatPattern('I see {} on the page')
      expect(result.html).toContain('pattern-any')
      expect(result.plainText).toContain('{arg0}')
    })

    it('formats escaped braces without backslashes', () => {
      const result = formatPattern('I see \\{literal\\} text')
      expect(result.html).toContain('{literal}')
      expect(result.html).not.toContain('\\{')
      expect(result.argDescriptions).toHaveLength(0)
    })
  })
})
