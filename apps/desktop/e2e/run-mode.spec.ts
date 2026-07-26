import { test, expect } from '@playwright/test'
import { launchApp, closeApp, type AppContext } from './helpers/app'
import { copyFixture, cleanupFixture } from './helpers/fixtures'
import { SEL } from './helpers/selectors'

test.describe('Run Mode', () => {
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

  test('should show validation indicator for valid scenario', async () => {
    const { window } = ctx

    // Select login.feature
    const loginNode = window.locator(`${SEL.featureTreeFile}[data-path="login.feature"]`)
    await loginNode.click()

    // Wait for scenario to load
    await expect(window.locator(SEL.scenarioBuilder)).toBeVisible()
    await expect(window.locator(SEL.scenarioBuilder)).toContainText('Given')

    // Validation indicator should be visible (valid = green check)
    await expect(window.locator(SEL.validationIndicator)).toBeVisible()
  })

  test('should show the "Run Tests" button in the header', async () => {
    const { window } = ctx

    // The Run Tests button lives in the top header (always visible in editor view,
    // independent of the folder panel). It opens the runner view.
    const runBtn = window.locator(SEL.runTestsBtn)
    await expect(runBtn).toBeVisible()
    await expect(runBtn).toBeEnabled()
  })

  test('should switch to the test runner view', async () => {
    const { window } = ctx

    await window.locator(SEL.runTestsBtn).click()

    // Runner view shows a "Back to editor" affordance.
    await expect(window.locator(SEL.backToEditorBtn)).toBeVisible()

    // Entering via "Run Tests" is the full filters experience: the execution-mode
    // selector is present (unlike a single-spec quick-run).
    await expect(window.locator(SEL.executionSelector)).toBeVisible()
  })

  test('should return to the editor via the back button', async () => {
    const { window } = ctx

    await window.locator(SEL.backToEditorBtn).click()

    // Back in the editor: the runner "back" button is gone and Run Tests is available again.
    await expect(window.locator(SEL.backToEditorBtn)).toHaveCount(0)
    await expect(window.locator(SEL.runTestsBtn)).toBeVisible()
  })
})
