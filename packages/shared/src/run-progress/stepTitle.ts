/**
 * Matching a reported step title against the step as authored in the .feature file.
 *
 * Step→editor mapping is by ORDINAL, because playwright-bdd reports step locations
 * against the generated spec rather than the .feature file. The title is the
 * cross-check that the ordinal has not drifted.
 *
 * The comparison cannot be plain equality, because a `Scenario Outline` is authored
 * with placeholders and reported with them substituted:
 *
 *   authored:  Given a cart with <count> items
 *   reported:  Given a cart with 1 items
 *
 * Requiring equality would drop every step of every outline row — the guard would
 * silently disable live progress exactly where it is hardest to follow by hand.
 */

/** `<name>` placeholders, as written in a Scenario Outline step. */
const PLACEHOLDER = /<[^<>]*>/g

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g

function escapeRegex(text: string): string {
  return text.replace(REGEX_SPECIALS, '\\$&')
}

/**
 * Does a reported step title correspond to this authored step?
 *
 * Exact (whitespace-normalized) match, or — for an authored outline step — a match
 * where each `<placeholder>` stands in for the substituted example value.
 */
export function stepTitleMatches(authored: string, reported: string): boolean {
  const a = authored.trim()
  const b = reported.trim()
  if (a === b) return true
  if (!PLACEHOLDER.test(a)) {
    PLACEHOLDER.lastIndex = 0
    return false
  }
  PLACEHOLDER.lastIndex = 0

  // Build `Given a cart with (.*) items` from the authored text, escaping
  // everything that is not a placeholder so no authored character is ever
  // interpreted as a metacharacter.
  const pattern = a
    .split(PLACEHOLDER)
    .map(escapeRegex)
    .join('(.*)')

  try {
    return new RegExp(`^${pattern}$`).test(b)
  } catch {
    // A pathological authored title must degrade to "no match", never throw.
    return false
  }
}
