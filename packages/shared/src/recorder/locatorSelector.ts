import type { LocatorReference } from '../types/recorder'

/**
 * Convert a semantic LocatorReference to a human-friendlier, runnable selector
 * string used as the TARGET argument of a bundled generic step
 * (`page.click(target)` etc.). Prefers semantic engines (`[data-testid=…]`,
 * `role=…`, `text=…`) over brittle structural CSS, so the generated `.feature`
 * stays both readable and executable. Shared so the main matcher and the
 * renderer (on locator change) produce identical arg values.
 */
export function locatorToPageSelector(locator: LocatorReference): string {
  switch (locator.type) {
    case 'testId':
      return `[${locator.attribute}="${locator.value}"]`
    case 'role':
      return locator.name ? `role=${locator.role}[name="${locator.name}"]` : `role=${locator.role}`
    case 'label':
      return `internal:label="${locator.value}"${locator.exact ? 's' : 'i'}`
    case 'placeholder':
      return `[placeholder="${locator.value}"]`
    case 'text':
      return `text=${locator.value}`
    case 'name':
      return `[name="${locator.value}"]`
    case 'id':
      return `#${locator.value}`
    case 'css':
      return locator.value
  }
}
