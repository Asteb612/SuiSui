import { test, expect } from '@playwright/test'
import { launchApp, closeApp, type AppContext } from './helpers/app'
import { copyFixture, cleanupFixture } from './helpers/fixtures'
import { SEL } from './helpers/selectors'
import { recorderFixture } from './helpers/recorder'

/**
 * Header/editor quick actions:
 *  - a global "Record" button (beside "Generate with AI") that opens the
 *    recorder from anywhere with a workspace open;
 *  - a "Run" button on an open feature that runs it in one click and shows the
 *    runner view.
 * Uses the injected FakeRecorderAdapter (no real browser — Constitution III).
 */
test.describe('Header quick actions', () => {
  let ctx: AppContext
  let workspacePath: string

  test.beforeAll(async () => {
    workspacePath = await copyFixture('with-features')
    ctx = await launchApp(workspacePath, { RECORDER_FIXTURE: recorderFixture('session.ndjson') })
  })

  test.afterAll(async () => {
    await closeApp(ctx)
    await cleanupFixture(workspacePath)
  })

  test('global Record button opens the recorder from the header', async () => {
    const { window } = ctx
    // Available as soon as a workspace is open — no feature/edit mode required.
    await expect(window.locator(SEL.recordBtnGlobal)).toBeVisible()
    await window.locator(SEL.recordBtnGlobal).click()
    await expect(window.locator(SEL.recorderPanel)).toBeVisible()
    await expect(window.locator(SEL.recorderStart)).toBeVisible()

    // Close the dialog so it doesn't overlay the next test.
    await window.getByRole('button', { name: 'Cancel' }).click()
    await expect(window.locator(SEL.recorderPanel)).not.toBeVisible()
  })

  test('quick Run button runs the open feature and shows the runner view', async () => {
    const { window } = ctx
    // Open a feature (read mode) → the quick-run button appears.
    await window.locator(`${SEL.featureTreeFile}[data-path="login.feature"]`).click()
    await expect(window.locator(SEL.scenarioBuilder)).toBeVisible()

    const quickRun = window.locator(SEL.quickRunBtn)
    await expect(quickRun).toBeVisible()
    await quickRun.click()

    // One click switches to the runner view (its back-to-editor control appears).
    await expect(window.locator(SEL.backToEditorBtn)).toBeVisible()

    // A single-spec quick-run hides the filter-oriented controls: there are no
    // filters to return to, and execution mode is irrelevant for one spec.
    await expect(window.locator(SEL.backToFiltersBtn)).toHaveCount(0)
    await expect(window.locator(SEL.executionSelector)).toHaveCount(0)
  })
})

/**
 * The header actions are icon-only, so the hover tooltip is the ONLY way to
 * learn what they do. If it regresses the header becomes unlabelled glyphs.
 */
test.describe('Header: icon-only actions', () => {
  let ctx: AppContext
  let workspacePath: string

  test.beforeAll(async () => {
    workspacePath = await copyFixture('with-features')
    ctx = await launchApp(workspacePath)
  })

  test.afterAll(async () => {
    await closeApp(ctx)
    await cleanupFixture(workspacePath)
  })

  const ACTIONS: Array<[string, string]> = [
    ['run-tests-btn', 'Configure and run tests'],
    ['record-btn-global', 'Start a recording'],
    ['tags-btn', 'Browse and manage tags'],
    ['settings-btn', 'Settings'],
    ['help-btn', 'Help'],
  ]

  for (const [testId, label] of ACTIONS) {
    test(`${testId} reveals its label on hover`, async () => {
      const { window } = ctx

      await window.locator(`[data-testid="${testId}"]`).hover()
      const tooltip = window.locator('.p-tooltip')

      await expect(tooltip).toBeVisible()
      await expect(tooltip).toContainText(label)
      // toBeVisible() does not check opacity, so assert it is actually painted.
      await expect(tooltip).toHaveCSS('opacity', '1')

      // Move away so the next hover starts clean.
      await window.locator('.title').hover()
    })
  }

  test('every icon-only action carries an accessible name', async () => {
    const { window } = ctx

    for (const [testId] of ACTIONS) {
      const name = await window.locator(`[data-testid="${testId}"]`).getAttribute('aria-label')
      expect(name, testId).toBeTruthy()
    }
  })
})
