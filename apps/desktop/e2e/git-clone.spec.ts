import { test, expect } from '@playwright/test'
import { launchApp, closeApp, type AppContext } from './helpers/app'
import { SEL } from './helpers/selectors'

test.describe('Git Clone', () => {
  let ctx: AppContext

  test.beforeAll(async () => {
    ctx = await launchApp()
  })

  test.afterAll(async () => {
    await closeApp(ctx)
  })

  test('welcome screen shows Clone from Git button', async () => {
    const { window } = ctx

    await expect(window.locator(SEL.welcomeScreen)).toBeVisible()
    await expect(window.locator(SEL.gitCloneBtn)).toBeVisible()
    await expect(window.locator(SEL.gitCloneBtn)).toContainText('Clone from Git')
  })

  test('clicking opens the GitClone dialog', async () => {
    const { window } = ctx

    await window.locator(SEL.gitCloneBtn).click()
    await expect(window.locator(SEL.gitCloneDialog)).toBeVisible({ timeout: 5_000 })
  })

  test('dialog has URL, branch, and credential inputs', async () => {
    const { window } = ctx

    // Dialog should be open from previous test
    await expect(window.locator(SEL.gitCloneUrlInput)).toBeVisible()
    await expect(window.locator(SEL.gitCloneBranchInput)).toBeVisible()
    await expect(window.locator(SEL.gitCloneUsernameInput)).toBeVisible()
    await expect(window.locator(SEL.gitClonePasswordInput)).toBeVisible()
  })

  test('clone button is disabled without URL and path', async () => {
    const { window } = ctx

    const cloneBtn = window.locator(SEL.gitCloneSubmitBtn)
    await expect(cloneBtn).toBeDisabled()
  })
})
