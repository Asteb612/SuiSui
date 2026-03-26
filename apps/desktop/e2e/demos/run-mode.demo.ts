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

test('run-mode demo', async () => {
  workspacePath = await copyFixture('with-features')
  ctx = await launchDemoApp(workspacePath)
  const { window } = ctx

  await expect(window.locator(SEL.featureTree)).toBeVisible()

  // Select login.feature to show scenario builder
  await window.locator(`${SEL.featureTreeFile}[data-path="login.feature"]`).click()
  await expect(window.locator(SEL.scenarioBuilder)).toBeVisible()
  await pause(window, 2000)

  // Make folder panel visible to access Run Tests button
  await ensureFolderPanelVisible(window)
  await pause(window, 1000)

  // Click the "Run Tests" button in the sidebar
  const runTestsBtn = window.locator('[data-testid="sidebar-run-btn"]')
  await expect(runTestsBtn).toBeVisible()
  await runTestsBtn.hover()
  await pause(window, 1000)
  await runTestsBtn.click()

  // Wait for the test runner panel to load
  await pause(window, 3000)

  // Show the run config panel — toolbar with base URL, execution mode, filters
  // The panel title should show "Test Runner"
  const toolbar = window.locator('.run-config-toolbar')
  if (await toolbar.isVisible()) {
    await pause(window, 2000)
  }

  // Hover over the Run Headless button (even if disabled, it shows the UI)
  const runHeadlessBtn = window.locator('button:has-text("Run Headless")')
  if (await runHeadlessBtn.isVisible()) {
    await runHeadlessBtn.hover()
    await pause(window, 1500)
  }

  // Hover over Run UI button
  const runUiBtn = window.locator('button:has-text("Run UI")')
  if (await runUiBtn.isVisible()) {
    await runUiBtn.hover()
    await pause(window, 1500)
  }

  // Show the filter tabs if visible
  const filterBtns = window.locator('.filter-tab-btn, .filter-tabs button')
  if (await filterBtns.count() > 0) {
    await filterBtns.first().hover()
    await pause(window, 1000)
  }

  await pause(window, 2000)

  // Back to editor via the back arrow button
  const backBtn = window.locator('[data-testid="back-to-editor-btn"]')
  if (await backBtn.isVisible()) {
    await backBtn.click()
    await pause(window, 1500)
  }

  await closeDemoApp(ctx, 'run-mode')
  ctx = undefined
})

test.afterEach(async () => {
  if (ctx) await closeDemoApp(ctx, 'run-mode')
  if (workspacePath) await cleanupFixture(workspacePath)
})
