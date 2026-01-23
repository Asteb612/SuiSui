import { test, expect } from '@playwright/test'
import { launchElectronApp, closeElectronApp, type ElectronTestContext } from './electron'

test.describe('SuiSui App', () => {
  let ctx: ElectronTestContext

  test.beforeAll(async () => {
    ctx = await launchElectronApp()
  })

  test.afterAll(async () => {
    if (ctx?.app) {
      await closeElectronApp(ctx.app)
    }
  })

  test('should launch with correct title', async () => {
    const title = await ctx.page.title()
    expect(title).toContain('SuiSui')
  })

  test('should display main layout with three columns', async () => {
    await ctx.page.waitForSelector('[data-testid="feature-list"]', { timeout: 10000 })
    await ctx.page.waitForSelector('[data-testid="scenario-builder"]', { timeout: 10000 })
    await ctx.page.waitForSelector('[data-testid="step-selector"]', { timeout: 10000 })
  })

  test('should show generic steps by default', async () => {
    const stepsPanel = ctx.page.locator('[data-testid="step-selector"]')
    await expect(stepsPanel).toBeVisible()

    // Check for generic steps in the step selector
    const givenTab = stepsPanel.locator('text=Given')
    await expect(givenTab).toBeVisible()
  })

  test('should allow setting scenario name', async () => {
    const nameInput = ctx.page.locator('[data-testid="scenario-name"]')
    await nameInput.fill('Login Test')

    await expect(nameInput).toHaveValue('Login Test')
  })

  test('should show validation panel', async () => {
    const validationPanel = ctx.page.locator('[data-testid="validation-panel"]')
    await expect(validationPanel).toBeVisible()
  })
})

test.describe('Scenario Builder', () => {
  let ctx: ElectronTestContext

  test.beforeAll(async () => {
    ctx = await launchElectronApp()
  })

  test.afterAll(async () => {
    if (ctx?.app) {
      await closeElectronApp(ctx.app)
    }
  })

  test('should add a step when clicking on a step definition', async () => {
    const stepSelector = ctx.page.locator('[data-testid="step-selector"]')
    await stepSelector.waitFor({ state: 'visible' })

    // Click on a Given step
    const givenSteps = stepSelector.locator('[data-testid="step-item"]').first()
    await givenSteps.click()

    // Verify step was added to builder
    const scenarioBuilder = ctx.page.locator('[data-testid="scenario-builder"]')
    const addedSteps = scenarioBuilder.locator('[data-testid="scenario-step"]')
    await expect(addedSteps).toHaveCount(1)
  })

  test('should validate scenario and show errors', async () => {
    const validateButton = ctx.page.locator('[data-testid="validate-button"]')
    await validateButton.click()

    // Should show error because scenario name might be empty
    const validationPanel = ctx.page.locator('[data-testid="validation-panel"]')
    await expect(validationPanel).toContainText(/error|warning/i)
  })
})
