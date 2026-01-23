export type StepKeyword = 'Given' | 'When' | 'Then'

export interface StepArgDefinition {
  name: string
  type: 'string' | 'int' | 'float' | 'any'
  required: boolean
}

export interface StepDefinition {
  id: string
  pattern: string
  keyword: StepKeyword
  location: string
  args: StepArgDefinition[]
  decorator?: string
  isGeneric?: boolean
}

export interface DecoratorDefinition {
  name: string
  description?: string
  location: string
  tags?: string[]
}

export interface StepExportResult {
  steps: StepDefinition[]
  decorators: DecoratorDefinition[]
  exportedAt: string
}

export interface GenericStep {
  id: string
  keyword: StepKeyword
  pattern: string
  description?: string
  args: StepArgDefinition[]
}

export const GENERIC_STEPS: GenericStep[] = [
  {
    id: 'generic-given-page',
    keyword: 'Given',
    pattern: 'I am on the {string} page',
    args: [{ name: 'page', type: 'string', required: true }],
  },
  {
    id: 'generic-given-logged-in',
    keyword: 'Given',
    pattern: 'I am logged in as {string}',
    args: [{ name: 'username', type: 'string', required: true }],
  },
  {
    id: 'generic-when-click',
    keyword: 'When',
    pattern: 'I click on {string}',
    args: [{ name: 'element', type: 'string', required: true }],
  },
  {
    id: 'generic-when-fill',
    keyword: 'When',
    pattern: 'I fill {string} with {string}',
    args: [
      { name: 'field', type: 'string', required: true },
      { name: 'value', type: 'string', required: true },
    ],
  },
  {
    id: 'generic-when-select',
    keyword: 'When',
    pattern: 'I select {string} from {string}',
    args: [
      { name: 'option', type: 'string', required: true },
      { name: 'dropdown', type: 'string', required: true },
    ],
  },
  {
    id: 'generic-when-wait',
    keyword: 'When',
    pattern: 'I wait for {int} seconds',
    args: [{ name: 'seconds', type: 'int', required: true }],
  },
  {
    id: 'generic-then-see',
    keyword: 'Then',
    pattern: 'I should see {string}',
    args: [{ name: 'text', type: 'string', required: true }],
  },
  {
    id: 'generic-then-not-see',
    keyword: 'Then',
    pattern: 'I should not see {string}',
    args: [{ name: 'text', type: 'string', required: true }],
  },
  {
    id: 'generic-then-url',
    keyword: 'Then',
    pattern: 'the URL should contain {string}',
    args: [{ name: 'urlPart', type: 'string', required: true }],
  },
  {
    id: 'generic-then-element-visible',
    keyword: 'Then',
    pattern: 'the element {string} should be visible',
    args: [{ name: 'selector', type: 'string', required: true }],
  },
]
