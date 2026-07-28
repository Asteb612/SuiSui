import { describe, it, expect } from 'vitest'
import { spliceTag } from '../tags/tagSplice'
import { normalizeTagName, isValidTagName, requireTagName } from '../tags/tagName'

// Split on /\n/ so `\r` stays on the line — see SpliceRequest.lines.
const lines = (text: string) => text.split(/\n/)

describe('tag name rules', () => {
  it('strips a single leading @', () => {
    expect(normalizeTagName('@smoke')).toBe('smoke')
    expect(normalizeTagName('smoke')).toBe('smoke')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeTagName('  @smoke  ')).toBe('smoke')
  })

  it('accepts letters, digits, and _ - . :', () => {
    for (const name of ['smoke', 'smoke-test', 'team.web', 'jira:1234', 'p1_critical', 'régression']) {
      expect(isValidTagName(name), name).toBe(true)
    }
  })

  it('rejects names that would change what the file means', () => {
    // Whitespace splits into two tags; '#' turns the rest of the line into a comment.
    for (const name of ['', '   ', '@', 'two words', 'has#hash', 'a\tb', 'quote"d']) {
      expect(isValidTagName(name), JSON.stringify(name)).toBe(false)
    }
  })

  it('requireTagName throws rather than returning something unusable', () => {
    expect(() => requireTagName('two words')).toThrow(/Invalid tag name/)
    expect(requireTagName('@ok')).toBe('ok')
  })
})

describe('spliceTag — add', () => {
  it('inserts a tag line when the scenario has none, matching its indentation', () => {
    const source = ['Feature: F', '  Scenario: S', '    Given a step']
    const result = spliceTag({
      lines: source,
      scenarioLine: 1,
      tag: 'smoke',
      operation: 'add',
    })

    expect(result.changed).toBe(true)
    expect(result.lineDelta).toBe(1)
    expect(result.lines).toEqual(['Feature: F', '  @smoke', '  Scenario: S', '    Given a step'])
  })

  it('matches tab indentation exactly', () => {
    const source = ['Feature: F', '\t\tScenario: S']
    const result = spliceTag({ lines: source, scenarioLine: 1, tag: 'x', operation: 'add' })
    expect(result.lines[1]).toBe('\t\t@x')
  })

  it('appends to an existing tag line, preserving the tags already there', () => {
    const source = ['Feature: F', '  @a @b', '  Scenario: S']
    const result = spliceTag({
      lines: source,
      scenarioLine: 2,
      tagLine: 1,
      tag: 'c',
      operation: 'add',
    })

    expect(result.changed).toBe(true)
    expect(result.lineDelta).toBe(0)
    expect(result.lines[1]).toBe('  @a @b @c')
  })

  it('does nothing when the tag is already present', () => {
    const source = ['Feature: F', '  @a @b', '  Scenario: S']
    const result = spliceTag({
      lines: source,
      scenarioLine: 2,
      tagLine: 1,
      tag: 'b',
      operation: 'add',
    })

    expect(result.changed).toBe(false)
    expect(result.lines).toEqual(source)
  })

  it('does not treat a prefix as already present', () => {
    const source = ['Feature: F', '  @smoke-test', '  Scenario: S']
    const result = spliceTag({
      lines: source,
      scenarioLine: 2,
      tagLine: 1,
      tag: 'smoke',
      operation: 'add',
    })

    expect(result.changed).toBe(true)
    expect(result.lines[1]).toBe('  @smoke-test @smoke')
  })
})

describe('spliceTag — remove', () => {
  it('deletes a tag line that existed only for that tag', () => {
    const source = ['Feature: F', '  @smoke', '  Scenario: S']
    const result = spliceTag({
      lines: source,
      scenarioLine: 2,
      tagLine: 1,
      tag: 'smoke',
      operation: 'remove',
    })

    expect(result.changed).toBe(true)
    expect(result.lineDelta).toBe(-1)
    expect(result.lines).toEqual(['Feature: F', '  Scenario: S'])
  })

  it('removes one tag of several, preserving the rest and their order', () => {
    const source = ['Feature: F', '  @a @b @c', '  Scenario: S']
    const result = spliceTag({
      lines: source,
      scenarioLine: 2,
      tagLine: 1,
      tag: 'b',
      operation: 'remove',
    })

    expect(result.lineDelta).toBe(0)
    expect(result.lines[1]).toBe('  @a @c')
  })

  it('does nothing when the tag is not on the line', () => {
    const source = ['Feature: F', '  @a', '  Scenario: S']
    const result = spliceTag({
      lines: source,
      scenarioLine: 2,
      tagLine: 1,
      tag: 'zzz',
      operation: 'remove',
    })

    expect(result.changed).toBe(false)
    expect(result.lines).toEqual(source)
  })

  it('does nothing when the scenario has no tag line at all', () => {
    const source = ['Feature: F', '  Scenario: S']
    const result = spliceTag({ lines: source, scenarioLine: 1, tag: 'a', operation: 'remove' })
    expect(result.changed).toBe(false)
  })

  it('PREFIX SAFETY: removing @smoke leaves @smoke-test intact', () => {
    const source = ['Feature: F', '  @smoke @smoke-test', '  Scenario: S']
    const result = spliceTag({
      lines: source,
      scenarioLine: 2,
      tagLine: 1,
      tag: 'smoke',
      operation: 'remove',
    })

    expect(result.lines[1]).toBe('  @smoke-test')
  })

  it('PREFIX SAFETY: removing @smoke-test leaves @smoke intact', () => {
    const source = ['Feature: F', '  @smoke @smoke-test', '  Scenario: S']
    const result = spliceTag({
      lines: source,
      scenarioLine: 2,
      tagLine: 1,
      tag: 'smoke-test',
      operation: 'remove',
    })

    expect(result.lines[1]).toBe('  @smoke')
  })
})

describe('spliceTag — preservation guarantees', () => {
  it('preserves CRLF line endings when appending', () => {
    const source = lines('Feature: F\r\n  @a\r\n  Scenario: S\r\n')
    const result = spliceTag({
      lines: source,
      scenarioLine: 2,
      tagLine: 1,
      tag: 'b',
      operation: 'add',
    })
    expect(result.lines[1]).toBe('  @a @b\r')
  })

  it('preserves CRLF when inserting a new tag line', () => {
    const source = lines('Feature: F\r\n  Scenario: S\r\n')
    const result = spliceTag({ lines: source, scenarioLine: 1, tag: 'a', operation: 'add' })
    expect(result.lines[1]).toBe('  @a\r')
    expect(result.lines[2]).toBe('  Scenario: S\r')
  })

  it('does not swallow a trailing comment when removing', () => {
    const source = ['Feature: F', '  @a @b # why these', '  Scenario: S']
    const result = spliceTag({
      lines: source,
      scenarioLine: 2,
      tagLine: 1,
      tag: 'a',
      operation: 'remove',
    })
    expect(result.lines[1]).toBe('  @b # why these')
  })

  it('keeps a comment-only remainder rather than deleting the line', () => {
    const source = ['Feature: F', '  @a # note', '  Scenario: S']
    const result = spliceTag({
      lines: source,
      scenarioLine: 2,
      tagLine: 1,
      tag: 'a',
      operation: 'remove',
    })
    expect(result.lineDelta).toBe(0)
    expect(result.lines[1]).toBe('  # note')
  })

  it('leaves every line other than the tag line byte-identical', () => {
    const source = [
      '# top comment',
      '@feature-tag',
      'Feature: F',
      '',
      '  Background:',
      '    Given something',
      '',
      '  @a',
      '  Scenario: S',
      '    When I do it   ',
      '    Then it works',
      '',
    ]
    const result = spliceTag({
      lines: source,
      scenarioLine: 8,
      tagLine: 7,
      tag: 'b',
      operation: 'add',
    })

    source.forEach((line, i) => {
      if (i === 7) return
      expect(result.lines[i], `line ${i}`).toBe(line)
    })
    expect(result.lines[7]).toBe('  @a @b')
  })

  it('does not mutate the input array', () => {
    const source = ['Feature: F', '  @a', '  Scenario: S']
    const copy = [...source]
    spliceTag({ lines: source, scenarioLine: 2, tagLine: 1, tag: 'b', operation: 'add' })
    expect(source).toEqual(copy)
  })

  it('refuses an empty tag rather than writing an empty token', () => {
    const source = ['Feature: F', '  Scenario: S']
    const result = spliceTag({ lines: source, scenarioLine: 1, tag: '', operation: 'add' })
    expect(result.changed).toBe(false)
    expect(result.lines).toEqual(source)
  })
})
