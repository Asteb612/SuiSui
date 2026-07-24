import { test, expect } from '@playwright/test'
import { launchApp, closeApp, type AppContext } from '../helpers/app'
import { copyFixture, cleanupFixture } from '../helpers/fixtures'
import { SEL } from '../helpers/selectors'
import { openScenarioInEditMode, startRecorder, recorderFixture } from '../helpers/recorder'

/**
 * US2 — reliable, explainable locators + SuiSui's own picker (retarget).
 */
test.describe('Recorder: locator candidates', () => {
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

  test('recommends the data-testid (Excellent) and re-derives candidates on pick', async () => {
    const { window } = ctx
    await openScenarioInEditMode(window)
    await startRecorder(window)

    // Select the click action to inspect its locators.
    await window.locator(SEL.recordedAction).filter({ hasText: 'Sign in' }).click()

    // The data-testid candidate is rated Excellent; the generated CSS class is warned.
    const candidates = window.locator(SEL.locatorCandidate)
    await expect(candidates.filter({ hasText: 'login-submit' })).toContainText('Excellent')
    await expect(candidates.filter({ hasText: 'Btn_root' })).toContainText('generated')

    // Pick a different element → candidates are re-derived for the new target.
    await window.locator(SEL.pickElement).click()
    await expect(window.locator(SEL.locatorCandidate).filter({ hasText: 'Welcome' }).first()).toBeVisible()
  })
})
