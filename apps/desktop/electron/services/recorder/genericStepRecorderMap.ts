import type { RecordedActionType } from '@suisui/shared'

export type RecorderArgRole = 'target' | 'value'

export interface RecorderStepMapping {
  keyword: 'Given' | 'When' | 'Then'
  /** Exact pattern of the bundled generic step this action maps to. */
  pattern: string
  /** Roles feeding the step's parameters, in parameter order. */
  args: RecorderArgRole[]
}

/**
 * Static, SuiSui-authored map from a recorded action to its bundled generic
 * step (Stage-1 deterministic matching — contracts/action-step-mapping.md).
 * Assertion entries are added in US4. Steps absent from a workspace's catalog
 * make the action a `gap` (FR-018a).
 */
export const GENERIC_STEP_RECORDER_MAP: Partial<Record<RecordedActionType, RecorderStepMapping>> = {
  navigate: { keyword: 'Given', pattern: 'I am on the {string} page', args: ['value'] },
  click: { keyword: 'When', pattern: 'I click on {string}', args: ['target'] },
  fill: { keyword: 'When', pattern: 'I fill {string} with {string}', args: ['target', 'value'] },
  select: { keyword: 'When', pattern: 'I select {string} from {string}', args: ['value', 'target'] },
  check: { keyword: 'When', pattern: 'I check {string}', args: ['target'] },
  uncheck: { keyword: 'When', pattern: 'I uncheck {string}', args: ['target'] },
  press: { keyword: 'When', pattern: 'I press {string}', args: ['value'] },
  upload: { keyword: 'When', pattern: 'I upload {string} to {string}', args: ['value', 'target'] },

  // Assertions (US4) — full set, genuine `expect` steps.
  assertVisible: { keyword: 'Then', pattern: 'the element {string} should be visible', args: ['target'] },
  assertHidden: { keyword: 'Then', pattern: 'the element {string} should be hidden', args: ['target'] },
  assertText: { keyword: 'Then', pattern: 'the element {string} should contain the text {string}', args: ['target', 'value'] },
  assertValue: { keyword: 'Then', pattern: 'the field {string} should have the value {string}', args: ['target', 'value'] },
  assertChecked: { keyword: 'Then', pattern: 'the checkbox {string} should be checked', args: ['target'] },
  assertEnabled: { keyword: 'Then', pattern: 'the element {string} should be enabled', args: ['target'] },
  assertCount: { keyword: 'Then', pattern: 'there should be {int} {string} elements', args: ['value', 'target'] },
  assertUrl: { keyword: 'Then', pattern: 'the URL should contain {string}', args: ['value'] },
  assertTitle: { keyword: 'Then', pattern: 'the page title should contain {string}', args: ['value'] },
}
