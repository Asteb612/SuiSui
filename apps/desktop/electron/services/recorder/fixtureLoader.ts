import { readFileSync } from 'node:fs'
import { FakeRecorderAdapter, type FakeScriptEvent } from './FakeRecorderAdapter'
import type { RawPickedElement } from './types'

/**
 * Parse a recorder NDJSON fixture (the child adapter's on-the-wire format) into
 * a `FakeRecorderAdapter` script + pick queue, so E2E can replay a real-looking
 * session with NO real browser (Constitution III). `picked` lines feed the
 * pick queue (one dequeued per `pick()`); `ready`/`signalAdded` are ignored.
 */
export function parseFakeRecorderFixture(ndjson: string): {
  script: FakeScriptEvent[]
  pickResults: RawPickedElement[]
} {
  const script: FakeScriptEvent[] = []
  const pickResults: RawPickedElement[] = []

  for (const rawLine of ndjson.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue // skip malformed lines
    }
    switch (parsed.t) {
      case 'action':
      case 'actionUpdated':
        script.push({
          type: parsed.t,
          action: {
            seq: Number(parsed.seq),
            pageGuid: String(parsed.pageGuid ?? 'p1'),
            action: parsed.action as never,
            ...(parsed.fingerprint ? { fingerprint: parsed.fingerprint as never } : {}),
            ...(parsed.candidates ? { candidates: parsed.candidates as never } : {}),
            ...(parsed.secret ? { secret: true } : {}),
            ...(parsed.code ? { code: String(parsed.code) } : {}),
          },
        })
        break
      case 'status':
        script.push({ type: 'status', status: { phase: parsed.phase as never, url: parsed.url as string | undefined } })
        break
      case 'error':
        script.push({
          type: 'error',
          error: { code: parsed.code as never, message: parsed.message as string | undefined, fatal: Boolean(parsed.fatal) },
        })
        break
      case 'picked':
        pickResults.push({
          pickId: '',
          pageGuid: String(parsed.pageGuid ?? 'p1'),
          fingerprint: parsed.fingerprint as never,
          candidates: (parsed.candidates ?? []) as never,
        })
        break
      default:
        break // ready / signalAdded / unknown
    }
  }
  return { script, pickResults }
}

/**
 * Build the test-mode recorder adapter. If `RECORDER_FIXTURE` points at an
 * NDJSON file it is replayed; otherwise an empty fake is returned.
 */
export function createTestRecorderAdapter(): FakeRecorderAdapter {
  const fixturePath = process.env.RECORDER_FIXTURE
  if (!fixturePath) return new FakeRecorderAdapter()
  try {
    const { script, pickResults } = parseFakeRecorderFixture(readFileSync(fixturePath, 'utf8'))
    return new FakeRecorderAdapter({ script, pickResults })
  } catch {
    return new FakeRecorderAdapter()
  }
}
