import type { UpdaterCapability } from '@suisui/shared'

/** Default place to send users who must update manually (notify-only installs). */
export const DEFAULT_RELEASES_URL = 'https://github.com/Asteb612/SuiSui/releases'

/**
 * Decide whether this installation can self-update — a PURE function of the
 * environment (Constitution III: unit-testable, no electron import).
 *
 * - Development (unpackaged): updater disabled (no-op).
 * - Linux AppImage (`APPIMAGE` set): self-update supported.
 * - Linux non-AppImage (deb/other): notify-only — `electron-updater` can't update it.
 * - Windows / macOS (packaged): self-update supported.
 */
export function computeCapability(
  platform: NodeJS.Platform,
  isPackaged: boolean,
  appImage: string | undefined,
  releasesUrl: string = DEFAULT_RELEASES_URL,
): UpdaterCapability {
  if (!isPackaged) {
    return { canSelfUpdate: false, reason: 'dev', manualUpdateUrl: null }
  }
  if (platform === 'linux' && !appImage) {
    return { canSelfUpdate: false, reason: 'unsupported-package', manualUpdateUrl: releasesUrl }
  }
  return { canSelfUpdate: true, reason: 'ok', manualUpdateUrl: null }
}
