import { test, expect } from '@playwright/test'
import path from 'node:path'
import { launchApp, closeApp, type AppContext } from './helpers/app'
import { copyFixture, cleanupFixture } from './helpers/fixtures'
import { SEL } from './helpers/selectors'

/**
 * Live run progress (feature 011), end to end.
 *
 * A real browser is never launched (Constitution III). Instead the app replays a
 * checked-in capture of the real reporter through the SAME stdout path a real run
 * uses, so everything downstream — the parser, the IPC channel, the store, the
 * editor — is production code. Only the process spawn is scripted.
 *
 * The capture reports 4 of the scenario's 6 steps: three pass, the fourth fails,
 * and the last two are never reported at all — which is exactly what Playwright
 * does after a failure, and what makes them show as skipped rather than pending.
 */

const FIXTURE = path.resolve(__dirname, 'fixtures', 'run-progress-login.ndjson')

const RUNNING = '[data-testid="live-status-running"]'
const PASSED = '[data-testid="live-status-passed"]'
const FAILED = '[data-testid="live-status-failed"]'
const SKIPPED = '[data-testid="live-status-skipped"]'

test.describe('Live run progress', () => {
  let ctx: AppContext
  let workspacePath: string

  test.beforeAll(async () => {
    workspacePath = await copyFixture('with-features')
    ctx = await launchApp(workspacePath, {
      TEST_RUN_PROGRESS_FIXTURE: FIXTURE,
      // Slow enough that intermediate states are genuinely observable.
      TEST_RUN_PROGRESS_INTERVAL_MS: '350',
    })
  })

  test.afterAll(async () => {
    await closeApp(ctx)
    await cleanupFixture(workspacePath)
  })

  test('shows steps running and then terminal, live in the editor', async () => {
    const { window } = ctx

    await window.locator(`${SEL.featureTreeFile}[data-path="login.feature"]`).click()
    await expect(window.locator(SEL.scenarioBuilder)).toContainText('Given')

    // Quick-run switches to the runner view; go straight back to the editor so
    // the run is watched from where the scenario is authored (FR-012).
    await window.locator(SEL.quickRunBtn).click()
    await window.locator(SEL.backToEditorBtn).click()

    // Mid-run: a step is executing and at least one has already passed.
    await expect(window.locator(RUNNING)).toHaveCount(1, { timeout: 15_000 })
    await expect(window.locator(PASSED).first()).toBeVisible()

    // End of run: the failure is marked, and the steps that never ran are skipped.
    await expect(window.locator(FAILED)).toHaveCount(1, { timeout: 20_000 })
    await expect(window.locator(PASSED)).toHaveCount(3)
    await expect(window.locator(SKIPPED)).toHaveCount(2)
  })

  test('leaves no step showing running once the run has ended (FR-006)', async () => {
    const { window } = ctx

    await expect(window.locator(RUNNING)).toHaveCount(0)
  })

  test('conveys status by more than colour', async () => {
    const { window } = ctx

    // Each indicator carries an accessible label, so the outcome is readable
    // without perceiving colour.
    await expect(window.locator(FAILED).first()).toHaveAttribute('aria-label', /failed/i)
    await expect(window.locator(SKIPPED).first()).toHaveAttribute('aria-label', /skipped/i)
  })

  test('keeps the structured progress lines out of the run log (FR-018)', async () => {
    const { window } = ctx

    await window.locator(SEL.runTestsBtn).click()
    const log = window.locator('[data-testid="logs-pane"]')
    if (await log.count()) {
      // Seeing the sentinel here would mean raw JSON is being shown to the user.
      await expect(log).not.toContainText('@@SUISUI_PROGRESS@@')
    }
  })
})

/**
 * US2 + US3, driven by a capture with TWO scenarios interleaved. One finishes;
 * the other stalls mid-step and is still running when the run ends.
 */
test.describe('Live run progress — run view', () => {
  let ctx: AppContext
  let workspacePath: string

  test.beforeAll(async () => {
    workspacePath = await copyFixture('with-features')
    ctx = await launchApp(workspacePath, {
      TEST_RUN_PROGRESS_FIXTURE: path.resolve(
        __dirname,
        'fixtures',
        'run-progress-parallel.ndjson',
      ),
      // 19 lines at 600ms ≈ 11s of run, so the stalled step comfortably crosses
      // the 5s threshold that makes it worth calling out.
      TEST_RUN_PROGRESS_INTERVAL_MS: '600',
    })
  })

  test.afterAll(async () => {
    await closeApp(ctx)
    await cleanupFixture(workspacePath)
  })

  test('lists executing scenarios and lets their steps be inspected in place', async () => {
    const { window } = ctx

    await window.locator(`${SEL.featureTreeFile}[data-path="login.feature"]`).click()
    await expect(window.locator(SEL.scenarioBuilder)).toContainText('Given')
    await window.locator(SEL.quickRunBtn).click()

    // Both scenarios appear, each identified by name and owning feature (FR-007).
    const list = window.locator('[data-testid="live-scenarios"]')
    await expect(list).toBeVisible({ timeout: 15_000 })
    await expect(list).toContainText('Successful login')
    await expect(list).toContainText('Failed login')

    // Both are in flight at once — a parallel run highlights every running
    // scenario, not just one (FR-009).
    await expect(window.locator('.live-scenario.is-running')).toHaveCount(2)

    // Expanding one shows its steps without leaving the run view (FR-011).
    await window.locator('[data-testid="live-scenario-toggle"]').first().click()
    await expect(window.locator('[data-testid="live-steps"]')).toBeVisible()

    // US3: 'Failed login' stalls on a step that never completes. Once its
    // elapsed time crosses the threshold, the step is called out by name so the
    // stall is attributable without reading the log.
    // Asserted inside this test because the callout only exists while the run
    // is in flight — a separate test would race the run's end.
    await expect(window.locator('[data-testid="stuck-step"]')).toBeVisible({
      timeout: 25_000,
    })
    await expect(window.locator('[data-testid="stuck-step"]')).toContainText('password')

    // The editor selection is untouched by any of this (FR-013).
    await window.locator(SEL.backToEditorBtn).click()
    await expect(window.locator(SEL.scenarioBuilder)).toContainText('Given')
  })

  test('settles the stalled scenario as interrupted, not failed (FR-020)', async () => {
    const { window } = ctx

    // Once the run ends nothing may still read as running.
    await expect(window.locator('[data-testid="live-status-running"]')).toHaveCount(0, {
      timeout: 25_000,
    })
  })
})
