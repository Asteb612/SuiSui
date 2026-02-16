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

test('scenario-builder demo', async () => {
  workspacePath = await copyFixture('with-features')
  ctx = await launchDemoApp(workspacePath)
  const { window } = ctx

  // Feature tree is visible after workspace load
  await expect(window.locator(SEL.featureTree)).toBeVisible()
  await pause(window, 2000)

  // Click login.feature → scenario builder shows in read mode
  await window.locator(`${SEL.featureTreeFile}[data-path="login.feature"]`).click()
  await expect(window.locator(SEL.scenarioBuilder)).toBeVisible()
  await pause(window, 2500)

  // Switch to edit mode
  await window.locator(SEL.editModeBtn).click()
  await expect(window.locator(SEL.inlineArgInput).first()).toBeVisible()
  await pause(window, 2000)

  // Edit an arg value: change "login" to "home"
  const firstArgInput = window.locator(SEL.inlineArgInput).first()
  await firstArgInput.click()
  await firstArgInput.clear()
  await firstArgInput.type('home', { delay: 80 })
  await pause(window, 1500)

  // Save
  await window.locator(SEL.saveBtn).click()
  await pause(window, 1500)

  // Done → back to read mode
  await window.locator(SEL.doneBtn).click()
  await expect(window.locator(SEL.scenarioBuilder)).toBeVisible()
  await pause(window, 2000)

  // Navigate to cart/checkout.feature
  await ensureFolderPanelVisible(window)
  await pause(window, 500)

  const cartFolder = window.locator(`${SEL.featureTreeFolder}[data-path="cart"]`)
  await cartFolder.locator('.node-toggle').click()
  await pause(window, 1000)

  await window.locator(`${SEL.featureTreeFile}[data-path="cart/checkout.feature"]`).locator('.node-content').click()
  await expect(window.locator(SEL.scenarioBuilder)).toBeVisible()
  await pause(window, 2500)

  // Close app and save video
  await closeDemoApp(ctx, 'scenario-builder')
  ctx = undefined
})

test.afterEach(async () => {
  if (ctx) await closeDemoApp(ctx, 'scenario-builder')
  if (workspacePath) await cleanupFixture(workspacePath)
})
