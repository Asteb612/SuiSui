import { test, expect } from '@playwright/test'
import { launchApp, closeApp, type AppContext } from './helpers/app'
import { copyFixture, cleanupFixture } from './helpers/fixtures'

const SETTINGS_BTN = '[data-testid="settings-btn"]'
const SETTINGS_DIALOG = '[data-testid="settings-dialog"]'

/**
 * Variables & Secrets are defined in the Settings dialog and persist (encrypted at
 * rest). At run time the runner injects them so `${NAME}` references in any feature
 * file resolve — that injection is validated separately (the runner is faked here).
 */
test.describe('Settings: variables & secrets', () => {
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

  test('add a variable in Settings and it persists', async () => {
    const w = ctx.window

    await w.locator(SETTINGS_BTN).click()
    await expect(w.locator(SETTINGS_DIALOG)).toBeVisible()

    await w.locator('[data-testid="settings-add-variable"]').click()
    const row = w.locator('[data-testid="variable-row"]').last()
    await row.locator('[data-testid="variable-name"]').fill('PASSWORD')
    await row.locator('[data-testid="variable-value"] input, [data-testid="variable-value"]').first().fill('secret123')

    await w.locator('[data-testid="settings-save"]').click()
    await expect(w.locator(SETTINGS_DIALOG)).toHaveCount(0)

    // Reopen — the variable was persisted and loads back.
    await w.locator(SETTINGS_BTN).click()
    await expect(w.locator(SETTINGS_DIALOG)).toBeVisible()
    const reopened = w.locator('[data-testid="variable-row"]').filter({ has: w.locator('[data-testid="variable-name"]') })
    await expect(reopened.first().locator('[data-testid="variable-name"]')).toHaveValue('PASSWORD')
  })
})
