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
    // ---------------------------------------------------------------
    describe('capture group regex: ^I click on "([^"]*)"$', () => {
      const pattern = '^I click on "([^"]*)"$'

      it('parseArgs — does it detect the capture group?', () => {
        const args = parseArgs(pattern)
        // Current expectation: parseArgs only knows enum (a|b) and cucumber {string}.
        // ([^"]*) has no pipe, so enum handler won't match.
        // No {string}/{int} either, so cucumber handler won't match.
        // DIAGNOSTIC: This will tell us if the capture group is detected at all.
        console.log('[DIAG] parseArgs for capture group regex:', JSON.stringify(args))
        // If 0 args → pipeline is broken for this pattern type
      })

      it('patternToRegex — does it produce a valid regex?', () => {
        const regex = patternToRegex(pattern)
        console.log('[DIAG] patternToRegex result:', regex.source)
        // Try matching — will this work or is the regex corrupted?
        const matches = regex.test('I click on "submit"')
        console.log('[DIAG] matches "I click on \\"submit\\"":', matches)
      })

      it('matchStep — can it match text against this step def?', () => {
        const stepDef: StepDefinition = {
          id: 'regex-cap-1',
          keyword: 'When',
          pattern,
          location: '',
          args: parseArgs(pattern),
        }
        const result = matchStep('I click on "submit"', stepDef)
        console.log('[DIAG] matchStep result:', JSON.stringify(result))
      })

      it('findBestMatch — fallback when no definitions match', () => {
        // If the regex step def doesn't match, findBestMatch falls back
        const stepDef: StepDefinition = {
          id: 'regex-cap-1',
          keyword: 'When',
          pattern,
          location: '',
          args: parseArgs(pattern),
        }
        const result = findBestMatch('I click on "submit"', 'When', [stepDef])
        console.log('[DIAG] findBestMatch result:', JSON.stringify(result))
        // Is the matched pattern our regex step, or a fallback?
        console.log('[DIAG] matched our regex def?', result.pattern === pattern)
      })
    })

    // ---------------------------------------------------------------
    // Case 3: Numeric capture group  /^I should see (\d+) items$/
    // RegExp.source = '^I should see (\\d+) items$'
    // ---------------------------------------------------------------
    describe('numeric capture regex: ^I should see (\\d+) items$', () => {
      const pattern = '^I should see (\\d+) items$'

      it('parseArgs — does it detect the capture group?', () => {
        const args = parseArgs(pattern)
        console.log('[DIAG] parseArgs for \\d+ regex:', JSON.stringify(args))
      })

      it('patternToRegex — does it produce a valid regex?', () => {
        const regex = patternToRegex(pattern)
        console.log('[DIAG] patternToRegex for \\d+:', regex.source)
        const matches = regex.test('I should see 5 items')
        console.log('[DIAG] matches "I should see 5 items":', matches)
      })

      it('matchStep — can it match?', () => {
        const stepDef: StepDefinition = {
          id: 'regex-num-1',
          keyword: 'Then',
          pattern,
          location: '',
          args: parseArgs(pattern),
        }
        const result = matchStep('I should see 5 items', stepDef)
        console.log('[DIAG] matchStep result:', JSON.stringify(result))
      })
    })

    // ---------------------------------------------------------------
    // Case 4: Mixed regex with string and number captures
    // /^I fill "([^"]*)" with "([^"]*)"$/
    // RegExp.source = '^I fill "([^"]*)" with "([^"]*)"$'
    // ---------------------------------------------------------------
    describe('multi capture regex: ^I fill "([^"]*)" with "([^"]*)"$', () => {
      const pattern = '^I fill "([^"]*)" with "([^"]*)"$'

      it('parseArgs — does it detect both capture groups?', () => {
        const args = parseArgs(pattern)
        console.log('[DIAG] parseArgs for multi capture:', JSON.stringify(args))
      })

      it('patternToRegex — does it produce a valid regex?', () => {
        const regex = patternToRegex(pattern)
        console.log('[DIAG] patternToRegex for multi capture:', regex.source)
        const matches = regex.test('I fill "email" with "test@test.com"')
        console.log('[DIAG] matches "I fill \\"email\\" with \\"test@test.com\\"":', matches)
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
})
