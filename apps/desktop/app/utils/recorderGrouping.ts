import type { RecordedAction, StepArg } from '@suisui/shared'

export interface GroupingProposal {
  /** The consecutive actions this proposal would replace. */
  actionIds: string[]
  keyword: 'Given' | 'When' | 'Then'
  pattern: string
  args: StepArg[]
  label: string
}

export interface StepStubRequest {
  keyword: 'Given' | 'When' | 'Then'
  pattern: string
  /** A ready-to-paste playwright-bdd step definition stub. */
  snippet: string
}

/**
 * Detect a login sequence — fill (username/email) → fill (secret) → click —
 * among the enabled actions and propose collapsing it into the bundled
 * `I am logged in as {string}` step. Deterministic (no AI); a richer AI grouping
 * can layer on later. Returns the FIRST match, or null.
 */
export function proposeLoginGrouping(actions: RecordedAction[]): GroupingProposal | null {
  const enabled = actions.filter((a) => !a.disabled && a.status !== 'accepted')
  for (let i = 0; i + 2 < enabled.length; i++) {
    const [user, secret, submit] = [enabled[i]!, enabled[i + 1]!, enabled[i + 2]!]
    const isLogin =
      user.type === 'fill' &&
      !user.secret &&
      secret.type === 'fill' &&
      secret.secret === true &&
      submit.type === 'click'
    if (!isLogin) continue
    const username = user.value ?? ''
    return {
      actionIds: [user.id, secret.id, submit.id],
      keyword: 'Given',
      pattern: 'I am logged in as {string}',
      args: [{ name: 'username', value: username, type: 'string' }],
      label: username ? `Log in as "${username}"` : 'Log in',
    }
  }
  return null
}

/** Suggest a step-definition stub for a gap action the user can implement. */
export function stepStubFor(action: RecordedAction): StepStubRequest {
  const keyword = action.type.startsWith('assert') ? 'Then' : action.type === 'navigate' ? 'Given' : 'When'
  const pattern = suggestPattern(action)
  const snippet = [
    `${keyword}('${pattern.replace(/'/g, "\\'")}', async ({ page }) => {`,
    `  // TODO: implement — recorded action: ${action.label}`,
    `});`,
  ].join('\n')
  return { keyword, pattern, snippet }
}

function suggestPattern(action: RecordedAction): string {
  switch (action.type) {
    case 'doubleClick':
      return 'I double-click {string}'
    case 'navigate':
      return 'I am on the {string} page'
    case 'assertValue':
      return 'the field {string} should have the value {string}'
    default:
      return `I ${action.type} {string}`
  }
}
