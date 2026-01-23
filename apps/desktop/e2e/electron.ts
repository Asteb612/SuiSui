import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { join } from 'path'

export interface ElectronTestContext {
  app: ElectronApplication
  page: Page
}

export async function launchElectronApp(): Promise<ElectronTestContext> {
  const mainPath = join(__dirname, '../dist-electron/main.js')

  const app = await electron.launch({
    args: [mainPath],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  return { app, page }
}

export async function closeElectronApp(app: ElectronApplication): Promise<void> {
  await app.close()
}
