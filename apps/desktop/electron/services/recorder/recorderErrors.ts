import type { RecorderError, RecorderErrorCode } from '@suisui/shared'

/**
 * User-facing message + recovery for every recorder error code (SC-008). The
 * child adapter may send just a code; `makeRecorderError` fills a clear default
 * so the UI always has something specific and actionable to show.
 */
export const RECORDER_ERROR_INFO: Record<RecorderErrorCode, { message: string; recovery?: string }> = {
  PLAYWRIGHT_NOT_INSTALLED: {
    message: 'Playwright is not installed in this workspace.',
    recovery: 'Install it in your project, e.g. `npm i -D @playwright/test`.',
  },
  UNSUPPORTED_PLAYWRIGHT: {
    message: "Your project's Playwright version is not supported by the recorder.",
    recovery: 'Use Playwright >= 1.49 and < 1.61.',
  },
  BROWSER_BINARY_MISSING: {
    message: 'The browser binary is missing.',
    recovery: 'Run `npx playwright install`.',
  },
  BROWSER_LAUNCH_FAILED: {
    message: 'The browser failed to launch.',
    recovery: 'Make sure a display is available, then try again.',
  },
  RECORDER_API_CHANGED: {
    message: "The recorder capability isn't available in this Playwright version.",
    recovery: 'Update SuiSui or use a supported Playwright version.',
  },
  TARGET_PAGE_CLOSED: {
    message: 'The recorded page was closed.',
    recovery: 'Start recording again; your captured actions are preserved.',
  },
  WORKSPACE_CHANGED: {
    message: 'The workspace changed during recording.',
    recovery: 'Start a new recording in the current workspace.',
  },
  NO_STEP_DEFINITIONS: {
    message: 'No step definitions are available to match actions.',
    recovery: 'Add step definitions to your workspace, then record again.',
  },
  LOCATOR_NOT_UNIQUE: {
    message: 'The chosen locator matches more than one element.',
    recovery: 'Pick a more specific locator candidate.',
  },
  LOCATOR_NO_LONGER_MATCHES: {
    message: 'The locator no longer matches any element.',
    recovery: 'Re-pick the target element.',
  },
  STEP_MISSING_ARGUMENTS: {
    message: 'The generated step is missing a required argument.',
    recovery: 'Fill the missing argument before adding it to the scenario.',
  },
  AI_UNAVAILABLE: {
    message: 'The AI service is unavailable.',
    recovery: 'Recording continues without AI suggestions.',
  },
  AI_INVALID_RESPONSE: {
    message: 'The AI response was invalid and was ignored.',
    recovery: 'The deterministic match is kept.',
  },
  ADAPTER_CRASHED: {
    message: 'The recorder process stopped unexpectedly.',
    recovery: 'Start recording again.',
  },
  NO_WORKSPACE: {
    message: 'No workspace is selected.',
    recovery: 'Open a workspace first.',
  },
}

/** Build a fully-formed `RecorderError`, defaulting message/recovery from the code. */
export function makeRecorderError(
  code: RecorderErrorCode,
  over: Partial<Omit<RecorderError, 'code'>> = {}
): RecorderError {
  const info = RECORDER_ERROR_INFO[code]
  const recovery = over.recovery ?? info.recovery
  return {
    code,
    message: over.message ?? info.message,
    fatal: over.fatal ?? false,
    ...(recovery ? { recovery } : {}),
    ...(over.sessionId ? { sessionId: over.sessionId } : {}),
  }
}
