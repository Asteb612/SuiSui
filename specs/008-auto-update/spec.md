# Feature Specification: Application Auto-Update

**Feature Branch**: `008-auto-update`  
**Created**: 2026-07-26  
**Status**: Draft  
**Input**: User description: "Normaly electron have a auto update systeme i want to implement it on this project"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Stay current automatically (Priority: P1)

A person using SuiSui launches the app as usual. In the background, the app quietly checks whether a newer released version exists. If one does, it downloads the update without interrupting the person's work. Once the download is ready, the app lets the person know a new version is available and offers to apply it when convenient. The person clicks "Restart & update", the app relaunches on the new version, and their workspace and in-progress work are preserved.

**Why this priority**: This is the core value of the feature. Without automatic detection and delivery of updates, users stay stuck on old versions, miss bug fixes and new capabilities, and the maintainers cannot reliably ship improvements. It is the smallest slice that delivers the whole point of "auto-update" and is independently shippable.

**Independent Test**: With a published newer version available, launch the app on an older version and confirm it detects, downloads, notifies, and — on user confirmation — relaunches on the newer version, with the workspace intact.

**Acceptance Scenarios**:

1. **Given** a newer released version exists and the device is online, **When** the app starts and finishes its background check, **Then** the update is downloaded in the background and the user is notified that an update is ready to install.
2. **Given** an update has been downloaded and is ready, **When** the user chooses to apply it, **Then** the app closes, installs the update, relaunches on the new version, and the previously open workspace is restored.
3. **Given** the installed app is already the latest version, **When** the background check completes, **Then** no update is downloaded and the user is not interrupted with any prompt.
4. **Given** an update is ready but the user has unsaved or in-progress work (e.g., an active test run or recording session), **When** the app would apply the update, **Then** it does not force a restart and instead waits for a safe moment or explicit user confirmation.

---

### User Story 2 - Check for updates on demand (Priority: P2)

A person wants to confirm they are on the newest version or grab an update immediately rather than waiting for the next background check. They open the app menu / settings, click "Check for updates", and see clear status: "You're up to date", "Update available — downloading…", "Update ready — restart to install", or an error explaining what went wrong.

**Why this priority**: Gives users direct control and reassurance, and provides a reliable path when background checks are disabled, delayed, or failed. It builds on P1 but is valuable and testable on its own.

**Independent Test**: Trigger the manual "Check for updates" action in three states (up-to-date, update-available, offline/error) and verify the correct status is shown each time.

**Acceptance Scenarios**:

1. **Given** the app is on the latest version, **When** the user clicks "Check for updates", **Then** a clear "up to date" status with the current version is shown.
2. **Given** a newer version exists, **When** the user clicks "Check for updates", **Then** the app reports an update is available and begins (or reports progress of) the download.
3. **Given** the device is offline or the update source is unreachable, **When** the user clicks "Check for updates", **Then** a friendly error is shown and the app remains fully usable on the current version.

---

### User Story 3 - Understand and control update behavior (Priority: P3)

A person wants to know which version they are running, what changed in an update, and to control how aggressively the app updates itself (for example, on a metered or restricted network). They can view the current version and the release notes for an available update, and can turn automatic checking/downloading on or off.

**Why this priority**: Transparency and control increase trust and accommodate constrained environments, but the feature already delivers value without them. This is a refinement layer on top of P1/P2.

**Independent Test**: Open the app's version/update settings, confirm the current version and available release notes are displayed, toggle automatic updates off, and verify no background download occurs afterward until manually triggered.

**Acceptance Scenarios**:

1. **Given** the user opens the about/settings area, **When** the view loads, **Then** the current application version is clearly displayed.
2. **Given** an update is available, **When** the user views the update details, **Then** the release notes / summary of changes for that version are shown.
3. **Given** the user has disabled automatic updates, **When** the app next starts, **Then** no update is downloaded automatically, but the user can still check and update manually.
4. **Given** the app has just updated to a new version, **When** it relaunches, **Then** the user can see what changed (e.g., a "what's new" indication) at least once.

---

### Edge Cases

- **Offline / unreachable source**: The update check fails silently in the background (or shows a friendly message on manual check) and the app stays fully functional on the current version; the next check retries later.
- **Interrupted or partial download**: A dropped connection or app closure mid-download must not corrupt the installed app; the download resumes or restarts cleanly and never applies a partial update.
- **Corrupted or unauthentic update**: An update whose integrity/authenticity cannot be verified is rejected and never installed; the app stays on the current version and reports the problem.
- **Downgrade / same version**: The system never installs an older or identical version over a newer one.
- **In-progress work**: An update must never interrupt an active test run, recording session, or AI draft, nor cause loss of the open workspace state.
- **Unsupported install method**: For installations delivered via a channel that cannot self-update (e.g., an OS package manager), the app must detect this, avoid attempting a self-update that would fail, and instead inform the user how to update.
- **Insufficient permissions / disk space**: If the app lacks rights to write the update or the device is out of space, it reports a clear error and remains on the current version.
- **Repeated postponement**: If the user repeatedly defers an available update, the app keeps working normally and re-offers the update without nagging excessively.
- **Multiple app instances / concurrent checks**: Concurrent update checks or multiple windows must not trigger duplicate downloads or conflicting installs.
- **Metered / restricted network**: When automatic download is undesirable (user preference or restricted network), the app does not consume bandwidth without consent.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The application MUST automatically check a designated release source for a newer version shortly after startup and periodically while running.
- **FR-002**: The application MUST, when a newer version is found and automatic download is enabled, download the update in the background without blocking normal use of the app.
- **FR-003**: The application MUST notify the user when an update has finished downloading and is ready to install, without abruptly interrupting their current activity.
- **FR-004**: The application MUST allow the user to apply a ready update on demand (e.g., "Restart & update") and MUST relaunch on the new version after installation.
- **FR-005**: The application MUST allow the user to defer/postpone applying a ready update and continue working on the current version.
- **FR-006**: The application MUST provide a manual "Check for updates" action that reports current status (up to date, available, downloading, ready, or error).
- **FR-007**: The application MUST display the currently installed version to the user.
- **FR-008**: The application MUST verify the integrity and authenticity of a downloaded update before installing it, and MUST refuse to install any update that fails verification.
- **FR-009**: The application MUST never install an older or identical version over the currently installed one.
- **FR-010**: The application MUST preserve the user's workspace/session and never lose in-progress work as a result of an update.
- **FR-011**: The application MUST NOT force-restart or apply an update while the user has active in-progress work (such as a running test, recording session, or unsaved changes) without explicit user consent.
- **FR-012**: The application MUST remain fully functional on the current version when the update source is unreachable, an error occurs, or the device is offline.
- **FR-013**: The application MUST surface update failures to the user with clear, non-technical messaging and MUST NOT leave the app in a broken or partially-updated state.
- **FR-014**: The application MUST let the user enable or disable automatic checking and/or automatic downloading of updates, and MUST honor that preference across restarts.
- **FR-015**: The application MUST make the release notes / summary of changes for an available or newly installed update viewable to the user.
- **FR-016**: The application MUST detect when the current installation was delivered through a channel that cannot self-update and, in that case, MUST avoid a failing self-update attempt and instead direct the user to update manually.
- **FR-017**: The system MUST support delivering updates to the primary desktop platforms the app is distributed for (macOS, Windows, and Linux via the self-updatable package format), so that the update process is consistent across supported platforms.
- **FR-018**: The system MUST prevent duplicate or conflicting update activity when checks or downloads could otherwise overlap.

### Key Entities _(include if feature involves data)_

- **Release / Update**: A published newer version of the application. Key attributes: version identifier, publish date, release notes/summary, downloadable artifact per platform, and integrity/authenticity information used for verification.
- **Update Status**: The current state of the update process as perceived by the user: up to date, checking, update available, downloading (with progress), ready to install, or error (with reason).
- **Update Preferences**: User-controlled settings that govern update behavior, e.g., automatic checking on/off, automatic download on/off. Persisted across restarts.
- **Release Source / Channel**: The designated location and stream from which updates are retrieved (e.g., the stable release channel). Determines which releases the app considers.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: After a new version is published, at least 80% of active users are running that version within 7 days, without any manual reinstall.
- **SC-002**: A user can go from "update ready" to "running the new version" in a single confirmation action, completing in under 2 minutes on a typical connection.
- **SC-003**: 100% of applied updates preserve the user's open workspace and cause no loss of in-progress work.
- **SC-004**: Background update checks and downloads never block the UI; the app stays fully interactive during checking and downloading in 100% of cases.
- **SC-005**: When the update source is unavailable, 100% of sessions continue to function normally on the current version with no crash or blocking error.
- **SC-006**: 0 instances of an unverified, corrupted, older, or partial update being installed.
- **SC-007**: A user can determine their current version and check for updates on demand in no more than 2 interactions from the main window.
- **SC-008**: Update failures are reported with an actionable, non-technical message in 100% of failure cases, and the app remains usable afterward.

## Assumptions

- **Distribution channel**: Updates are published to and retrieved from the project's public GitHub Releases (the app already lives at `github.com/Asteb612/SuiSui`), using the stable channel only. Pre-release/beta channels are out of scope for this feature.
- **Supported update platforms**: Self-update covers macOS, Windows, and Linux via a self-updatable package format. Installations delivered via OS package managers (e.g., the Debian package) are treated as "cannot self-update" and are only notified/directed to update manually (per FR-016), not silently updated.
- **Update model**: Default behavior is background check → background download → notify → apply on user confirmation (with a safe restart). This favors non-intrusiveness over silent forced installs; users can adjust via preferences (FR-014).
- **Signing/verification**: Producing correctly signed/notarized release artifacts (as required for trusted, verifiable updates on each platform) is an operational prerequisite handled in the release/build process; this spec requires that updates be verifiable and rejected if not (FR-008), but the mechanics of obtaining signing credentials are a release-process dependency, not part of the user-facing feature.
- **Release cadence**: The maintainers publish versioned releases with release notes; the app compares against the latest published stable release to decide whether an update is available.
- **Update frequency**: A reasonable default check cadence (on startup plus periodically during a session) is acceptable; exact intervals are an implementation detail.

## Dependencies

- Availability of a reachable release source (GitHub Releases) hosting versioned artifacts and their verification metadata.
- A release/build pipeline that produces per-platform update artifacts and (where required for verification/trust) signs/notarizes them.
- Existing application version metadata and workspace/session persistence to satisfy version display (FR-007) and work preservation (FR-010).

## Out of Scope

- Beta/pre-release channels and per-user channel switching.
- Staged/percentage-based rollouts and remote kill-switch/rollback controls.
- Delta/differential downloads as an optimization (full-artifact updates are acceptable).
- Auto-updating installations delivered by OS package managers (these are notify-only).
- Enterprise-managed update policies (e.g., centralized admin control across many machines).
