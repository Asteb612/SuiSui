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

test('data-table demo', async () => {
  workspacePath = await copyFixture('with-features')
  ctx = await launchDemoApp(workspacePath)
  const { window } = ctx

  await expect(window.locator(SEL.featureTree)).toBeVisible()

  // Select form.feature (has DataTable step)
  await window.locator(`${SEL.featureTreeFile}[data-path="form.feature"]`).click()
  await expect(window.locator(SEL.scenarioBuilder)).toBeVisible()
  await pause(window, 2500)

  // Switch to edit mode → TableEditor becomes visible
  await window.locator(SEL.editModeBtn).click()
  await pause(window, 2000)

  // Find and interact with a table cell input if available
  const tableCells = window.locator('table input, table td[contenteditable]')
  if (await tableCells.count() > 0) {
    await tableCells.first().click()
    await pause(window, 1000)
    await tableCells.first().fill('Jane')
    await pause(window, 1500)
  }

  // Save changes
  await window.locator(SEL.saveBtn).click()
  await pause(window, 1500)

  // Back to read mode
  await window.locator(SEL.doneBtn).click()
  await expect(window.locator(SEL.scenarioBuilder)).toBeVisible()
  await pause(window, 2000)

  await closeDemoApp(ctx, 'data-table')
  ctx = undefined
})

test.afterEach(async () => {
  if (ctx) await closeDemoApp(ctx, 'data-table')
  if (workspacePath) await cleanupFixture(workspacePath)
})
