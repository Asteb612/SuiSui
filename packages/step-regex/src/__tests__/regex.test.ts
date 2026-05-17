import { describe, it, expect } from 'vitest'
import { stripAnchors, patternToRegex } from '../regex'

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

describe('patternToRegex', () => {
  it('matches {string} with quoted text', () => {
    const regex = patternToRegex('I click on {string}')
    expect(regex.test('I click on "button"')).toBe(true)
    expect(regex.test("I click on 'button'")).toBe(true)
    expect(regex.test('I click on button')).toBe(true)
  })

  it('matches {int} with integers', () => {
    const regex = patternToRegex('I wait {int} seconds')
    expect(regex.test('I wait 5 seconds')).toBe(true)
    expect(regex.test('I wait abc seconds')).toBe(false)
  })

  it('matches {int} with negative numbers', () => {
    const regex = patternToRegex('the temperature is {int} degrees')
    expect(regex.test('the temperature is -19 degrees')).toBe(true)
    expect(regex.test('the temperature is 19 degrees')).toBe(true)
  })

  it('matches {float} with decimals, negatives and leading dot', () => {
    const regex = patternToRegex('price is {float}')
    expect(regex.test('price is 9.99')).toBe(true)
    expect(regex.test('price is 10')).toBe(true)
    expect(regex.test('price is -9.2')).toBe(true)
    expect(regex.test('price is .8')).toBe(true)
    expect(regex.test('price is abc')).toBe(false)
  })

  it('matches {word} single token only', () => {
    const regex = patternToRegex('I click {word}')
    expect(regex.test('I click submit')).toBe(true)
    expect(regex.test('I click button-primary')).toBe(true)
    expect(regex.test('I click submit button')).toBe(false)
  })

  it('matches anonymous {} including spaces', () => {
    const regex = patternToRegex('I see {}')
    expect(regex.test('I see hello world')).toBe(true)
    expect(regex.test('I see something')).toBe(true)
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

  it('handles optional text (s)', () => {
    const regex = patternToRegex('I have {int} cucumber(s)')
    expect(regex.test('I have 5 cucumbers')).toBe(true)
    expect(regex.test('I have 1 cucumber')).toBe(true)
  })

  it('handles alternative text belly/stomach', () => {
    const regex = patternToRegex('I have a belly/stomach ache')
    expect(regex.test('I have a belly ache')).toBe(true)
    expect(regex.test('I have a stomach ache')).toBe(true)
    expect(regex.test('I have a head ache')).toBe(false)
  })

  it('handles escaped \\{ \\( \\/ as literals', () => {
    expect(patternToRegex('I see \\{braces\\}').test('I see {braces}')).toBe(true)
    expect(patternToRegex('I see \\(parens\\)').test('I see (parens)')).toBe(true)
    expect(patternToRegex('path is a\\/b').test('path is a/b')).toBe(true)
    expect(patternToRegex('path is a\\/b').test('path is a')).toBe(false)
  })

  it('strips a table column suffix from text matching', () => {
    const regex = patternToRegex(
      'I fill in the form with the following data (Field, Value):',
    )
    expect(
      regex.test('I fill in the form with the following data:'),
    ).toBe(true)
    expect(
      regex.test('I fill in the form with the following data'),
    ).toBe(false)
  })
})
