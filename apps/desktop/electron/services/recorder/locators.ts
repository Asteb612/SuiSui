import type { LocatorReference } from '@suisui/shared'
import type { RawCandidate } from './types'

// Re-export the shared target-selector helper so main-process code can import
// it alongside the other locator helpers.
export { locatorToPageSelector } from '@suisui/shared'

/** Build a `LocatorReference` from a raw child candidate. */
export function rawCandidateToLocator(c: RawCandidate): LocatorReference | null {
  switch (c.kind) {
    case 'testId':
      return c.attribute && c.value ? { type: 'testId', attribute: c.attribute, value: c.value } : null
    case 'role':
      return c.role
        ? { type: 'role', role: c.role, ...(c.name ? { name: c.name } : {}), ...(c.exact ? { exact: c.exact } : {}) }
        : null
    case 'label':
      return c.value ? { type: 'label', value: c.value, ...(c.exact ? { exact: c.exact } : {}) } : null
    case 'placeholder':
      return c.value ? { type: 'placeholder', value: c.value, ...(c.exact ? { exact: c.exact } : {}) } : null
    case 'text':
      return c.value ? { type: 'text', value: c.value, ...(c.exact ? { exact: c.exact } : {}) } : null
    case 'name':
      return c.value ? { type: 'name', value: c.value } : null
    case 'id':
      return c.value ? { type: 'id', value: c.value } : null
    case 'css':
      return c.value ? { type: 'css', value: c.value } : null
    default:
      return null
  }
}

/**
 * Convert a LocatorReference to Playwright's INTERNAL selector syntax
 * (used for `highlight`/`validate` where the adapter talks to Playwright).
 */
export function locatorToSelector(locator: LocatorReference): string {
  switch (locator.type) {
    case 'testId':
      return `internal:testid=[${locator.attribute}="${locator.value}"s]`
    case 'role':
      return locator.name
        ? `internal:role=${locator.role}[name="${locator.name}"${locator.exact ? '' : 'i'}]`
        : `internal:role=${locator.role}`
    case 'label':
      return `internal:label="${locator.value}"${locator.exact ? 's' : 'i'}`
    case 'placeholder':
      return `internal:attr=[placeholder="${locator.value}"${locator.exact ? 's' : 'i'}]`
    case 'text':
      return `internal:text="${locator.value}"${locator.exact ? 's' : 'i'}`
    case 'name':
      return `internal:attr=[name="${locator.value}"s]`
    case 'id':
      return `#${locator.value}`
    case 'css':
      return locator.value
  }
}

