import { describe, expect, it } from 'vitest'
import { LocatorService } from '../../services/recorder/LocatorService'
import type { RawCandidate } from '../../services/recorder/types'

/**
 * Locator scoring must stay well under the 50 ms/action budget (SC / plan
 * performance goals). Browser-latency goals (action→card, picked→UI < 300 ms)
 * depend on the real adapter + IPC and are checked in the manual harness.
 */
describe('locator scoring performance', () => {
  const svc = new LocatorService()
  const candidates: RawCandidate[] = [
    { kind: 'testId', attribute: 'data-testid', value: 'login-submit', matchedElements: 1 },
    { kind: 'role', role: 'button', name: 'Sign in', matchedElements: 1 },
    { kind: 'label', value: 'Email', matchedElements: 1 },
    { kind: 'css', value: '.Button_root__x8Ff2', matchedElements: 3 },
    { kind: 'css', value: 'div > *:nth-child(2)', matchedElements: 1 },
  ]

  it('scores a typical candidate set far faster than 50 ms per action', () => {
    const iterations = 2000
    const start = performance.now()
    for (let i = 0; i < iterations; i++) svc.score(candidates)
    const perCall = (performance.now() - start) / iterations
    expect(perCall).toBeLessThan(50)
  })
})
