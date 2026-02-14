import { test, expect } from '@playwright/test'
import { launchApp, closeApp, type AppContext } from './helpers/app'
import { copyFixture, cleanupFixture } from './helpers/fixtures'
import { SEL } from './helpers/selectors'

test.describe('Scenario Builder', () => {
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

  test('should show scenario builder after selecting a feature', async () => {
    const { window } = ctx

    // Select login.feature
    const loginNode = window.locator(`${SEL.featureTreeFile}[data-path="login.feature"]`)
    await loginNode.click()

    // Scenario builder should be visible
    await expect(window.locator(SEL.scenarioBuilder)).toBeVisible()
  })

  test('should display steps in read mode', async () => {
    const { window } = ctx

    // In read mode, steps should display formatted text
    const builder = window.locator(SEL.scenarioBuilder)
    await expect(builder).toContainText('Given')
    await expect(builder).toContainText('When')
    await expect(builder).toContainText('Then')
  })

  test('should switch to edit mode', async () => {
    const { window } = ctx

    // Click Edit button
    await window.locator(SEL.editModeBtn).click()

    // Edit mode UI should appear — Save and Done buttons become available
    // The scenario builder should switch to edit mode class
    const builder = window.locator(SEL.scenarioBuilder)
    await expect(builder).toBeVisible()

    // Done button should be visible in edit mode
    await expect(window.locator(SEL.doneBtn)).toBeVisible()
  })

  test('should show step catalog in edit mode', async () => {
    const { window } = ctx

    // Step selector should be visible in edit mode
    await expect(window.locator(SEL.stepSelector)).toBeVisible()

    // Should contain step items from mock export
    const stepItems = window.locator(SEL.stepItem)
    const count = await stepItems.count()
    expect(count).toBeGreaterThan(0)
  })

  test('should exit edit mode via Done button', async () => {
    const { window } = ctx

    // Click Done button
    await window.locator(SEL.doneBtn).click()

    // Should be back in read mode — Edit button should be visible
    await expect(window.locator(SEL.editModeBtn)).toBeVisible()
  })
})
