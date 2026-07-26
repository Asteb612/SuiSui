import { describe, expect, it } from 'vitest'
import { proposeLoginGrouping, stepStubFor } from '../utils/recorderGrouping'
import type { RecordedAction, RecordedActionType } from '@suisui/shared'

function action(id: string, type: RecordedActionType, over: Partial<RecordedAction> = {}): RecordedAction {
  return { id, sessionId: 's', seq: 0, pageId: 'p', timestamp: 0, label: id, type, status: 'matched', ...over }
}

describe('proposeLoginGrouping', () => {
  it('detects fill → secret-fill → click as a login sequence', () => {
    const actions = [
      action('a1', 'fill', { value: 'arthur@example.com' }),
      action('a2', 'fill', { secret: true, secretRef: '${PASSWORD}' }),
      action('a3', 'click'),
    ]
    const proposal = proposeLoginGrouping(actions)
    expect(proposal).toMatchObject({
      actionIds: ['a1', 'a2', 'a3'],
      keyword: 'Given',
      pattern: 'I am logged in as {string}',
      label: 'Log in as "arthur@example.com"',
    })
    expect(proposal?.args).toEqual([{ name: 'username', value: 'arthur@example.com', type: 'string' }])
  })

  it('returns null when there is no login sequence', () => {
    expect(proposeLoginGrouping([action('a1', 'click'), action('a2', 'fill')])).toBeNull()
    // two non-secret fills + click is not a login
    expect(
      proposeLoginGrouping([action('a1', 'fill'), action('a2', 'fill'), action('a3', 'click')])
    ).toBeNull()
  })
})

describe('stepStubFor', () => {
  it('produces a playwright-bdd stub for a gap action', () => {
    const stub = stepStubFor(action('a1', 'doubleClick', { status: 'gap', label: 'Double-click "Row"' }))
    expect(stub.keyword).toBe('When')
    expect(stub.pattern).toBe('I double-click {string}')
    expect(stub.snippet).toContain("When('I double-click {string}', async ({ page }) => {")
    expect(stub.snippet).toContain('// TODO')
  })
})
