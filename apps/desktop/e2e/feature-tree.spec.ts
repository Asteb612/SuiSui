import { test, expect } from '@playwright/test'
import { launchApp, closeApp, type AppContext } from './helpers/app'
import { copyFixture, cleanupFixture } from './helpers/fixtures'
import { SEL } from './helpers/selectors'

test.describe('Feature Tree Navigation', () => {
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

  test('should display feature tree with correct structure', async () => {
    const { window } = ctx

    await expect(window.locator(SEL.featureTree)).toBeVisible()

    // Should show login.feature as a file node
    const loginNode = window.locator(`${SEL.featureTreeFile}[data-path="login.feature"]`)
    await expect(loginNode).toBeVisible()

    // Should show cart/ as a folder node
    const cartFolder = window.locator(`${SEL.featureTreeFolder}[data-path="cart"]`)
    await expect(cartFolder).toBeVisible()
  })

  test('should load scenarios when clicking a feature file', async () => {
    const { window } = ctx

    // Click on login.feature
    const loginNode = window.locator(`${SEL.featureTreeFile}[data-path="login.feature"]`)
    await loginNode.click()

    // Scenario builder should show the loaded feature
    await expect(window.locator(SEL.scenarioBuilder)).toBeVisible()

    // Should display scenario content (step keywords)
    await expect(window.locator(SEL.scenarioBuilder)).toContainText('Given')
  })

  test('should expand folder to show nested features', async () => {
    const { window } = ctx

    // Click on the toggle chevron to expand the cart folder
    const cartFolder = window.locator(`${SEL.featureTreeFolder}[data-path="cart"]`)
    await cartFolder.locator('.node-toggle').click()

    // Should show checkout.feature inside cart/
    const checkoutNode = window.locator(`${SEL.featureTreeFile}[data-path="cart/checkout.feature"]`)
    await expect(checkoutNode).toBeVisible()
  })

  test('should switch between feature files', async () => {
    const { window } = ctx

    // Click on checkout.feature inside cart/ (folder already expanded from previous test)
    const checkoutNode = window.locator(`${SEL.featureTreeFile}[data-path="cart/checkout.feature"]`)
    await checkoutNode.locator('.node-content').click()

    // Scenario builder should update with the new feature
    await expect(window.locator(SEL.scenarioBuilder)).toContainText('Given')

    // Switch back to login.feature
    const loginNode = window.locator(`${SEL.featureTreeFile}[data-path="login.feature"]`)
    await loginNode.click()

    await expect(window.locator(SEL.scenarioBuilder)).toContainText('Given')
  })
})
