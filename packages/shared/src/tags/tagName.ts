/**
 * A valid Gherkin tag body (after the '@').
 *
 * Whitespace would split into two tags on the next parse, and '#' would turn
 * the rest of the line into a comment — both silently change what the file
 * means, so they are rejected before anything is written.
 */
const VALID_TAG_BODY = /^[\p{L}\p{N}_\-.:]+$/u

/** Strip a single leading '@' so `@smoke` and `smoke` are interchangeable on input. */
export function normalizeTagName(input: string): string {
  const trimmed = input.trim()
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
}

/** True when `input` is usable as a tag (with or without a leading '@'). */
export function isValidTagName(input: string): boolean {
  return VALID_TAG_BODY.test(normalizeTagName(input))
}

/**
 * Normalize and validate in one step.
 *
 * @throws when the name could not be used without changing the meaning of the file.
 */
export function requireTagName(input: string): string {
  const name = normalizeTagName(input)
  if (!VALID_TAG_BODY.test(name)) {
    throw new Error(
      `Invalid tag name: ${JSON.stringify(input)}. Tags may contain letters, digits, and _ - . : only.`
    )
  }
  return name
}
