import { test, expect } from '@playwright/test'
import { launchApp, closeApp, type AppContext } from '../helpers/app'
import { copyFixture, cleanupFixture } from '../helpers/fixtures'
import { SEL } from '../helpers/selectors'
import { openScenarioInEditMode, startRecorder, recorderFixture } from '../helpers/recorder'

/**
 * US4 — assertion mode: pick an element (via SuiSui's picker) and add a
 * "Verify …" check that inserts as a real assertion step.
 */
test.describe('Recorder: assertions', () => {
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

  test('adds a visibility assertion on a picked element', async () => {
    const { window } = ctx
    await openScenarioInEditMode(window)
    await startRecorder(window)

    await expect(window.locator(SEL.recordedAction)).toHaveCount(4)

    // Enter assertion mode → pick the "Welcome" element (from the fixture pick queue).
    await window.locator(SEL.assertPick).click()
    await expect(window.locator(SEL.assertType)).toBeVisible()
    // Default type is "Is visible"; add it.
    await window.locator(SEL.assertAdd).click()

    // A new "Verify … is visible" card appears.
    await expect(window.locator(SEL.recordedAction)).toHaveCount(5)
    await expect(
      window.locator(SEL.recordedAction).filter({ hasText: 'Verify' }).filter({ hasText: 'visible' })
    ).toBeVisible()

    await window.locator(SEL.recorderConfirm).click()
    await expect(window.locator(SEL.scenarioBuilder)).toContainText('should be visible')
  })
})
