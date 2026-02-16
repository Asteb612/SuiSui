import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

export { copyFixture, cleanupFixture } from '../helpers/fixtures'
export { SEL } from '../helpers/selectors'

export interface DemoContext {
  app: ElectronApplication
  window: Page
}

const VIDEOS_OUTPUT_DIR = path.resolve(__dirname, '../../../../doc/videos')

/**
 * Launch the Electron app with video recording enabled.
 * Videos are recorded at 1280x720 to a temp directory,
 * then saved with a human-readable name after the app closes.
 */
export async function launchDemoApp(workspacePath?: string): Promise<DemoContext> {
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
    recordVideo: {
      dir: path.join(VIDEOS_OUTPUT_DIR, '.tmp'),
      size: { width: 1280, height: 720 },
    },
  })

  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  if (workspacePath) {
    const selectBtn = window.locator('[data-testid="select-workspace-btn"]')
    await selectBtn.waitFor({ state: 'visible', timeout: 15_000 })
    await selectBtn.click()

    await window.locator('[data-testid="status-bar"]').waitFor({ state: 'visible', timeout: 15_000 })
    await window.locator('[data-testid="status-bar"]').filter({ hasText: workspacePath }).waitFor({ timeout: 30_000 })
  }

  return { app, window }
}

/**
 * Close the app and save the recorded video with a human-readable name.
 */
export async function closeDemoApp(ctx: DemoContext | undefined, videoName: string): Promise<void> {
  if (!ctx?.app) return

  const page = ctx.window
  await ctx.app.close()

  // Playwright saves videos with random hashes — rename to our target
  const video = page.video()
  if (video) {
    fs.mkdirSync(VIDEOS_OUTPUT_DIR, { recursive: true })
    const targetPath = path.join(VIDEOS_OUTPUT_DIR, `${videoName}.webm`)
    await video.saveAs(targetPath)
  }
}

/**
 * Deliberate pause to make videos watchable at human pace.
 */
export async function pause(page: Page, ms = 1500): Promise<void> {
  await page.waitForTimeout(ms)
}

/**
 * Ensure the folder panel (feature tree) is visible.
 */
export async function ensureFolderPanelVisible(window: Page): Promise<void> {
  const featureTree = window.locator('[data-testid="feature-tree"]')
  if (!await featureTree.isVisible()) {
    await window.locator('button[title="Show folder panel"]').click()
    await featureTree.waitFor({ state: 'visible' })
  }
}
