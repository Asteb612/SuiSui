import type { ElementFingerprint } from '@suisui/shared'

/**
 * Sensitive-field detection + secret-reference naming (US3 / FR-025, FR-026).
 *
 * The authoritative redaction happens in the child adapter (the value never
 * crosses stdio — D7). This module is the shared classification/naming logic:
 * the child uses it to decide what to redact, and `RecorderService` uses it
 * defensively and to mint the committable reference name.
 */

const SENSITIVE_NAME = /pass(?:word|wd)?|token|secret|api[-_\s]?key|authorization/i

/** True when a field should be treated as sensitive (password/secret/token/…). */
export function isSensitiveField(fp: ElementFingerprint): boolean {
  if (fp.inputType === 'password') return true
  if (fp.autocomplete === 'current-password' || fp.autocomplete === 'new-password') return true
  return [fp.name, fp.id, fp.label, fp.accessibleName, fp.placeholder, fp.ariaLabel].some(
    (h) => h != null && SENSITIVE_NAME.test(h)
  )
}

/**
 * Committable placeholder for a captured secret, derived from the field's
 * human name (e.g. "Password" → `<PASSWORD>`, "API Key" → `<API_KEY>`).
 * Never contains the secret value.
 */
export function secretReferenceName(fp?: ElementFingerprint): string {
  const source = fp?.label ?? fp?.accessibleName ?? fp?.name ?? fp?.id ?? fp?.placeholder ?? 'secret'
  const snake = source
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
  return `<${snake || 'SECRET'}>`
}
