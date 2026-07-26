import { describe, it, expect } from 'vitest'
import { rawCandidateToLocator, locatorToSelector } from '../services/recorder/locators'
import type { RawCandidate } from '../services/recorder/types'

const cand = (c: Partial<RawCandidate>): RawCandidate => ({ kind: 'css', matchedElements: 1, ...c } as RawCandidate)

describe('locators — rawCandidateToLocator', () => {
  it('maps each candidate kind to its LocatorReference', () => {
    expect(rawCandidateToLocator(cand({ kind: 'testId', attribute: 'data-testid', value: 'x' }))).toEqual({
      type: 'testId',
      attribute: 'data-testid',
      value: 'x',
    })
    expect(rawCandidateToLocator(cand({ kind: 'role', role: 'button', name: 'Save', exact: true }))).toEqual({
      type: 'role',
      role: 'button',
      name: 'Save',
      exact: true,
    })
    expect(rawCandidateToLocator(cand({ kind: 'role', role: 'button' }))).toEqual({ type: 'role', role: 'button' })
    expect(rawCandidateToLocator(cand({ kind: 'label', value: 'Email' }))).toEqual({ type: 'label', value: 'Email' })
    expect(rawCandidateToLocator(cand({ kind: 'placeholder', value: 'Enter' }))).toEqual({
      type: 'placeholder',
      value: 'Enter',
    })
    expect(rawCandidateToLocator(cand({ kind: 'text', value: 'Hi', exact: true }))).toEqual({
      type: 'text',
      value: 'Hi',
      exact: true,
    })
    expect(rawCandidateToLocator(cand({ kind: 'name', value: 'q' }))).toEqual({ type: 'name', value: 'q' })
    expect(rawCandidateToLocator(cand({ kind: 'id', value: 'main' }))).toEqual({ type: 'id', value: 'main' })
    expect(rawCandidateToLocator(cand({ kind: 'css', value: '.btn' }))).toEqual({ type: 'css', value: '.btn' })
  })

  it('returns null for empty or unknown candidates', () => {
    expect(rawCandidateToLocator(cand({ kind: 'testId' }))).toBeNull()
    expect(rawCandidateToLocator(cand({ kind: 'role' }))).toBeNull()
    expect(rawCandidateToLocator(cand({ kind: 'label' }))).toBeNull()
    expect(rawCandidateToLocator(cand({ kind: 'placeholder' }))).toBeNull()
    expect(rawCandidateToLocator(cand({ kind: 'text' }))).toBeNull()
    expect(rawCandidateToLocator(cand({ kind: 'name' }))).toBeNull()
    expect(rawCandidateToLocator(cand({ kind: 'id' }))).toBeNull()
    expect(rawCandidateToLocator(cand({ kind: 'css' }))).toBeNull()
    expect(rawCandidateToLocator({ kind: 'other', matchedElements: 0 } as unknown as RawCandidate)).toBeNull()
  })
})

describe('locators — locatorToSelector', () => {
  it('builds Playwright internal selectors for each locator type', () => {
    expect(locatorToSelector({ type: 'testId', attribute: 'data-testid', value: 'x' })).toBe(
      'internal:testid=[data-testid="x"s]',
    )
    expect(locatorToSelector({ type: 'role', role: 'button', name: 'Save', exact: true })).toBe(
      'internal:role=button[name="Save"]',
    )
    expect(locatorToSelector({ type: 'role', role: 'button', name: 'Save' })).toBe('internal:role=button[name="Save"i]')
    expect(locatorToSelector({ type: 'role', role: 'button' })).toBe('internal:role=button')
    expect(locatorToSelector({ type: 'label', value: 'Email', exact: true })).toBe('internal:label="Email"s')
    expect(locatorToSelector({ type: 'label', value: 'Email' })).toBe('internal:label="Email"i')
    expect(locatorToSelector({ type: 'placeholder', value: 'Enter', exact: true })).toBe(
      'internal:attr=[placeholder="Enter"s]',
    )
    expect(locatorToSelector({ type: 'placeholder', value: 'Enter' })).toBe('internal:attr=[placeholder="Enter"i]')
    expect(locatorToSelector({ type: 'text', value: 'Hi', exact: true })).toBe('internal:text="Hi"s')
    expect(locatorToSelector({ type: 'text', value: 'Hi' })).toBe('internal:text="Hi"i')
    expect(locatorToSelector({ type: 'name', value: 'q' })).toBe('internal:attr=[name="q"s]')
    expect(locatorToSelector({ type: 'id', value: 'main' })).toBe('#main')
    expect(locatorToSelector({ type: 'css', value: '.btn' })).toBe('.btn')
  })
})
