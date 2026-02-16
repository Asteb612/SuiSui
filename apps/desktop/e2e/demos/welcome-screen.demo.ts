import { test, expect } from '@playwright/test'
import {
  launchDemoApp,
  closeDemoApp,
  pause,
  SEL,
  type DemoContext,
} from './helpers'

let ctx: DemoContext | undefined

test('welcome-screen demo', async () => {
  // Launch without workspace — shows welcome screen
  ctx = await launchDemoApp()
  const { window } = ctx

  // Welcome screen with action buttons
  await expect(window.locator(SEL.welcomeScreen)).toBeVisible()
  await expect(window.locator(SEL.selectWorkspaceBtn)).toBeVisible()
  await expect(window.locator(SEL.githubConnectBtn)).toBeVisible()
  await pause(window, 3000)

  // Hover over buttons to draw attention
  await window.locator(SEL.selectWorkspaceBtn).hover()
  await pause(window, 1500)
  await window.locator(SEL.githubConnectBtn).hover()
  await pause(window, 1500)

  await closeDemoApp(ctx, 'welcome-screen')
  ctx = undefined
})

test.afterEach(async () => {
  if (ctx) await closeDemoApp(ctx, 'welcome-screen')
})
