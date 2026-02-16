import { test, expect } from '@playwright/test'
import {
  launchDemoApp,
  closeDemoApp,
  copyFixture,
  cleanupFixture,
  ensureFolderPanelVisible,
  pause,
  SEL,
  type DemoContext,
} from './helpers'

let ctx: DemoContext | undefined
let workspacePath: string

test('feature-tree demo', async () => {
  workspacePath = await copyFixture('with-features')
  ctx = await launchDemoApp(workspacePath)
  const { window } = ctx

  // Feature tree visible with files and folders
  await expect(window.locator(SEL.featureTree)).toBeVisible()
  await pause(window, 2000)

  // Expand cart folder (must click the toggle chevron, not the folder row)
  const cartFolder = window.locator(`${SEL.featureTreeFolder}[data-path="cart"]`)
  await cartFolder.locator('.node-toggle').click()
  await pause(window, 1500)

  // Click checkout.feature
  await window.locator(`${SEL.featureTreeFile}[data-path="cart/checkout.feature"]`).locator('.node-content').click()
  await expect(window.locator(SEL.scenarioBuilder)).toBeVisible()
  await pause(window, 1500)

  // Go back to login.feature
  await ensureFolderPanelVisible(window)
  await window.locator(`${SEL.featureTreeFile}[data-path="login.feature"]`).click()
  await expect(window.locator(SEL.scenarioBuilder)).toBeVisible()
  await pause(window, 1500)

  // Toggle folder panel visibility (panel auto-hides after file selection)
  await ensureFolderPanelVisible(window)
  await window.locator('button[title="Hide folder panel"]').click()
  await pause(window, 1000)
  await window.locator('button[title="Show folder panel"]').click()
  await expect(window.locator(SEL.featureTree)).toBeVisible()
  await pause(window, 1500)

  await closeDemoApp(ctx, 'feature-tree')
  ctx = undefined
})

test.afterEach(async () => {
  if (ctx) await closeDemoApp(ctx, 'feature-tree')
  if (workspacePath) await cleanupFixture(workspacePath)
})
