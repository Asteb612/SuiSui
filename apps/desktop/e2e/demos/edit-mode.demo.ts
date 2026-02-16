import { test, expect } from '@playwright/test'
import {
  launchDemoApp,
  closeDemoApp,
  copyFixture,
  cleanupFixture,
  pause,
  SEL,
  type DemoContext,
} from './helpers'

let ctx: DemoContext | undefined
let workspacePath: string

test('edit-mode demo', async () => {
  workspacePath = await copyFixture('with-features')
  ctx = await launchDemoApp(workspacePath)
  const { window } = ctx

  await expect(window.locator(SEL.featureTree)).toBeVisible()

  // Select login.feature
  await window.locator(`${SEL.featureTreeFile}[data-path="login.feature"]`).click()
  await expect(window.locator(SEL.scenarioBuilder)).toBeVisible()
  await pause(window, 1500)

  // Switch to edit mode
  await window.locator(SEL.editModeBtn).click()
  await pause(window, 2000)

  // Show step catalog panel
  const stepSelector = window.locator(SEL.stepSelector)
  if (await stepSelector.isVisible()) {
    await pause(window, 1500)

    // Click a step from the catalog to add it
    const stepItems = window.locator(SEL.stepItem)
    if (await stepItems.count() > 0) {
      await stepItems.first().click()
      await pause(window, 1500)
    }
  }

  // Show reorder: use move-down on first step
  const moveDownBtns = window.locator(SEL.moveDownBtn)
  if (await moveDownBtns.count() > 0) {
    await moveDownBtns.first().click()
    await pause(window, 1500)
  }

  // Remove a step
  const removeBtns = window.locator(SEL.removeBtn)
  if (await removeBtns.count() > 0) {
    await removeBtns.last().click()
    await pause(window, 1500)
  }

  // Discard unsaved changes (Done is disabled when dirty), then exit edit mode
  const cancelBtn = window.locator('button:has-text("Cancel")')
  if (await cancelBtn.isVisible()) {
    await cancelBtn.click()
    await pause(window, 1000)
  }
  await window.locator(SEL.doneBtn).click()
  await pause(window, 1500)

  await closeDemoApp(ctx, 'edit-mode')
  ctx = undefined
})

test.afterEach(async () => {
  if (ctx) await closeDemoApp(ctx, 'edit-mode')
  if (workspacePath) await cleanupFixture(workspacePath)
})
