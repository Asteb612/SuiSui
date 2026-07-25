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
  })
})
