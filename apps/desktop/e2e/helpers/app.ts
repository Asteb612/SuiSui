import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import path from 'node:path'

export interface AppContext {
  app: ElectronApplication
  window: Page
}

/**
 * Launch the Electron app in test mode.
 * Requires a prior `pnpm build` — tests run against the production build.
 *
 * When workspacePath is provided, the helper automatically clicks
 * "Select Existing Workspace" and waits for the workspace to load.
 */
export async function launchApp(workspacePath?: string): Promise<AppContext> {
  const mainPath = path.resolve(__dirname, '../../dist-electron/main.js')

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    APP_TEST_MODE: '1',
  }

  if (workspacePath) {
    env.TEST_WORKSPACE_PATH = workspacePath
  }

  const app = await electron.launch({
    args: ['--no-sandbox', mainPath],
    env,
  })

  const window = await app.firstWindow()
  // Wait for the renderer to be fully loaded
  await window.waitForLoadState('domcontentloaded')

  if (workspacePath) {
    // Wait for the welcome screen, then trigger workspace selection
    const selectBtn = window.locator('[data-testid="select-workspace-btn"]')
    await selectBtn.waitFor({ state: 'visible', timeout: 15_000 })
    await selectBtn.click()

    // Wait for workspace to load — status bar shows the workspace path
    await window.locator('[data-testid="status-bar"]').waitFor({ state: 'visible', timeout: 15_000 })
    await window.locator('[data-testid="status-bar"]').filter({ hasText: workspacePath }).waitFor({ timeout: 15_000 })
  }

  return { app, window }
}

/**
 * Close the Electron app gracefully.
 */
export async function closeApp(ctx: AppContext | undefined): Promise<void> {
  if (ctx?.app) {
    await ctx.app.close()
  }
}
