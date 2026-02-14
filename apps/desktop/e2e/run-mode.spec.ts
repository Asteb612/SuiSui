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

  test('should enable run button for valid scenario', async () => {
    const { window } = ctx

    // Run button should be visible and enabled
    const runBtn = window.locator(SEL.runModeBtn)
    await expect(runBtn).toBeVisible()
    await expect(runBtn).toBeEnabled()
  })

  test('should switch to run mode', async () => {
    const { window } = ctx

    // Click Run button
    await window.locator(SEL.runModeBtn).click()

    // Scenario builder should still be visible in run mode
    await expect(window.locator(SEL.scenarioBuilder)).toBeVisible()

    // Should show a Close button to exit run mode
    const closeBtn = window.locator('button:has-text("Close")')
    await expect(closeBtn).toBeVisible()
  })

  test('should exit run mode via Close button', async () => {
    const { window } = ctx

    // Click Close to exit run mode
    const closeBtn = window.locator('button:has-text("Close")')
    await closeBtn.click()

    // Should be back in read mode — Edit and Run buttons should be visible
    await expect(window.locator(SEL.editModeBtn)).toBeVisible()
    await expect(window.locator(SEL.runModeBtn)).toBeVisible()
  })
})
