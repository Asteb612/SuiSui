import type { StepDefinition, StepExportResult } from '@suisui/shared'
import { parseArgs } from '@suisui/shared'

/**
 * The 10 default step definitions matching generic.steps.ts.
 * Used to pre-populate the StepService cache in test mode.
 */
const DEFAULT_STEP_PATTERNS: Array<{ keyword: 'Given' | 'When' | 'Then'; pattern: string }> = [
  { keyword: 'Given', pattern: 'I am on the {string} page' },
  { keyword: 'Given', pattern: 'I am logged in as {string}' },
  { keyword: 'When', pattern: 'I click on {string}' },
  { keyword: 'When', pattern: 'I fill {string} with {string}' },
  { keyword: 'When', pattern: 'I select {string} from {string}' },
  { keyword: 'When', pattern: 'I wait for {int} seconds' },
  { keyword: 'Then', pattern: 'I should see {string}' },
  { keyword: 'Then', pattern: 'I should not see {string}' },
  { keyword: 'Then', pattern: 'the URL should contain {string}' },
  { keyword: 'Then', pattern: 'the element {string} should be visible' },
]

function generateStepId(keyword: string, pattern: string): string {
  const hash = `${keyword}-${pattern}`
    .split('')
    .reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0)
  return `step-${Math.abs(hash).toString(16)}`
}

export function buildMockStepExportResult(): StepExportResult {
  const steps: StepDefinition[] = DEFAULT_STEP_PATTERNS.map(({ keyword, pattern }) => ({
    id: generateStepId(keyword, pattern),
    keyword,
    pattern,
    location: 'features/steps/generic.steps.ts',
    args: parseArgs(pattern),
    isGeneric: true,
  }))

  return {
    steps,
    decorators: [],
    exportedAt: new Date().toISOString(),
  }
}
