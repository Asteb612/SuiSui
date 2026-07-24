import type { RecorderStartOptions, LocatorValidationResult } from '@suisui/shared'
import type { AdapterEventHandlers, AdapterStartInfo, IRecorderAdapter } from './IRecorderAdapter'

/**
 * Real adapter that drives the workspace's Playwright via an embedded-Node
 * child process (`scripts/recorder-adapter.js`) using the private
 * `_enableRecorder({ recorderMode: 'api' })` API — see research D1/D2/D13.
 *
 * SKELETON: the session/child lifecycle is implemented in US1 (T023) and
 * extended in US2/US3. Until then, `start()` fails cleanly rather than
 * pretending to record. Tests never reach this path (they inject the
 * `FakeRecorderAdapter` — Constitution Principle III).
 */
export class PlaywrightRecorderAdapter implements IRecorderAdapter {
  async start(_options: RecorderStartOptions, _handlers: AdapterEventHandlers): Promise<AdapterStartInfo> {
    throw new Error('Recorder is not available yet (real Playwright adapter pending implementation).')
  }

  async stop(): Promise<void> {}
  async pause(): Promise<void> {}
  async resume(): Promise<void> {}
  async pick(_pickId: string): Promise<void> {}
  async cancelPick(): Promise<void> {}
  async highlight(_selector: string): Promise<void> {}

  async validate(_selector: string): Promise<LocatorValidationResult> {
    return { unique: false, matchedElements: 0, stillMatches: false }
  }
}
