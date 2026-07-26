import type { LocatorCandidate, LocatorReference, Reliability, RecorderLocatorSettings } from '@suisui/shared'
import { DEFAULT_RECORDER_LOCATOR_SETTINGS } from '@suisui/shared'
import { rawCandidateToLocator, locatorToSelector } from './locators'
import type { RawCandidate } from './types'

/**
 * Pure, deterministic locator scoring (contracts/locator-scoring.md). Turns the
 * child's raw candidates (each with a measured uniqueness count) into ranked,
 * explained `LocatorCandidate[]`. No DOM/browser access — fully unit-testable
 * (Constitution III). Honors the workspace's `RecorderLocatorSettings`.
 */
export class LocatorService {
  private settings: RecorderLocatorSettings

  constructor(settings: RecorderLocatorSettings = DEFAULT_RECORDER_LOCATOR_SETTINGS) {
    this.settings = settings
  }

  setSettings(settings: RecorderLocatorSettings): void {
    this.settings = settings
  }

  /** Score + rank raw candidates; strongest first. */
  score(candidates: RawCandidate[]): LocatorCandidate[] {
    const scored: LocatorCandidate[] = []
    for (const raw of candidates) {
      const locator = rawCandidateToLocator(raw)
      if (!locator) continue
      if (locator.type === 'role' && !this.settings.allowRoleLocators) continue
      if (locator.type === 'text' && !this.settings.allowTextLocators) continue
      if (locator.type === 'css' && !this.settings.allowCssFallback) continue
      scored.push(this.scoreOne(locator, raw))
    }
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        kindPriority(a.locator) - kindPriority(b.locator) ||
        locatorToSelector(a.locator).length - locatorToSelector(b.locator).length
    )
    return scored
  }

  private scoreOne(locator: LocatorReference, raw: RawCandidate): LocatorCandidate {
    const reasons: string[] = []
    const warnings: string[] = []
    let score = baseScore(locator, this.settings.preferredTestIdAttributes, reasons)

    const unique = raw.matchedElements === 1
    if (raw.matchedElements === 0) {
      score = 0
      warnings.push('No element currently matches')
    } else if (raw.matchedElements > 1) {
      score = Math.min(score, 20)
      warnings.push(`Matches ${raw.matchedElements} elements on the page`)
    } else {
      reasons.push('Unique on the current page')
    }

    const inspectValue = raw.value ?? raw.name ?? ''
    const generatable = locator.type === 'testId' || locator.type === 'id' || locator.type === 'css' || locator.type === 'name'
    if (generatable) {
      if (looksGenerated(inspectValue)) {
        score -= 40
        warnings.push('Contains a value that looks generated')
      } else if (inspectValue) {
        reasons.push('Does not contain a generated value')
      }
    }

    if (locator.type === 'text' && inspectValue.length > 40) {
      score -= 15
      warnings.push('Text may change')
    }

    score = Math.max(0, Math.min(100, score))
    return { locator, score, reliability: bucket(score), unique, matchedElements: raw.matchedElements, reasons, warnings }
  }
}

function baseScore(locator: LocatorReference, preferredTestIds: string[], reasons: string[]): number {
  switch (locator.type) {
    case 'testId':
      if (preferredTestIds.includes(locator.attribute)) {
        reasons.push('Dedicated testing attribute')
        return 100
      }
      reasons.push('Test-oriented data attribute')
      return 90
    case 'role':
      if (locator.name) {
        reasons.push('Accessible role and name')
        return 85
      }
      return 55
    case 'label':
      reasons.push('Associated form label')
      return 80
    case 'id':
      reasons.push('Stable id')
      return 75
    case 'name':
      return 70
    case 'placeholder':
      return 60
    case 'text':
      return 50
    case 'css':
      return isStructural(locator.value) ? 5 : 25
  }
}

function isStructural(css: string): boolean {
  return /:nth-child\(|\[\d+\]|>\s*\*/.test(css)
}

/** Whether a selector value looks generated/unstable (contracts/locator-scoring §4). */
export function looksGenerated(value: string): boolean {
  if (!value) return false
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(value)) return true // UUID
  if (/\b[0-9a-f]{8,}\b/i.test(value)) return true // long hex hash
  if (/__[A-Za-z0-9]{5,}/.test(value)) return true // CSS-module double-underscore hash
  if (/\d{5,}/.test(value)) return true // long digit run / numeric id / timestamp
  if (/:nth-child\(|\[\d+\]|>\s*\*/.test(value)) return true // structural / nth-child
  // Random-looking alnum token: length ≥ 6 containing BOTH a letter and a digit.
  for (const token of value.split(/[^A-Za-z0-9]+/)) {
    if (token.length >= 6 && /[A-Za-z]/.test(token) && /\d/.test(token)) return true
  }
  return false
}

function bucket(score: number): Reliability {
  if (score >= 90) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 40) return 'fair'
  return 'poor'
}

function kindPriority(locator: LocatorReference): number {
  const order: Record<LocatorReference['type'], number> = {
    testId: 0,
    role: 1,
    label: 2,
    id: 3,
    name: 4,
    placeholder: 5,
    text: 6,
    css: 7,
  }
  return order[locator.type]
}
