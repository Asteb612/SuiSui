/**
 * Parse a model's arg-fill reply into a `paramName -> value` map (spec FR-011).
 *
 * The model is asked for a bare JSON object. We extract the first JSON object from
 * the reply (tolerating stray prose or code fences), then keep only keys that are
 * real parameters of the target step and coerce every value to a string. Unknown
 * keys are dropped and missing ones are simply absent — the user reviews/edits the
 * suggestions before they are committed, so a partial or empty map is safe.
 *
 * A hand-rolled guard (not Zod) is deliberate: the shape is a flat string map, the
 * output is only ever shown in editable fields (never executed), and Zod is a
 * main-process-only dependency (Constitution Principle I / T002). This keeps arg-fill
 * on the same renderer-assembly path as the other AI use cases.
 */
export function parseSuggestedArgs(reply: string, paramNames: string[]): Record<string, string> {
  const allowed = new Set(paramNames)
  const out: Record<string, string> = {}

  const obj = extractFirstJsonObject(reply)
  if (!obj) return out

  for (const [key, value] of Object.entries(obj)) {
    if (!allowed.has(key)) continue
    if (value === null || value === undefined) continue
    out[key] = typeof value === 'string' ? value : String(value)
  }
  return out
}

/** Extract and parse the first top-level `{...}` object from arbitrary text. */
function extractFirstJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}
