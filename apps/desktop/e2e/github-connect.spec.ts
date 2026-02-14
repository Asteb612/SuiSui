import { test, expect } from '@playwright/test'
import { launchApp, closeApp, type AppContext } from './helpers/app'
import { SEL } from './helpers/selectors'

test.describe('GitHub Connect', () => {
  let ctx: AppContext

  test.beforeAll(async () => {
    ctx = await launchApp()
  })

  test.afterAll(async () => {
    await closeApp(ctx)
  })

  test('welcome screen shows Clone from GitHub button', async () => {
    const { window } = ctx

    await expect(window.locator(SEL.welcomeScreen)).toBeVisible()
    await expect(window.locator(SEL.githubConnectBtn)).toBeVisible()
    await expect(window.locator(SEL.githubConnectBtn)).toContainText('Clone from GitHub')
  })

  test('clicking opens the GithubConnect dialog', async () => {
    const { window } = ctx

    await window.locator(SEL.githubConnectBtn).click()
    await expect(window.locator(SEL.githubDialog)).toBeVisible({ timeout: 5_000 })
  })

  test('PAT input validates and shows user info', async () => {
    const { window } = ctx

    // Dialog should be open from previous test
    const tokenInput = window.locator(SEL.githubTokenInput)
    await expect(tokenInput).toBeVisible()

    // Enter a mock token
    await tokenInput.fill('ghp_mock_test_token')

    // Click validate
    const validateBtn = window.locator(SEL.githubValidateBtn)
    await validateBtn.click()

    // In test mode, validation succeeds immediately — user info should appear
    // and we should advance to repo selection step
    await expect(window.locator(SEL.githubRepoList)).toBeVisible({ timeout: 10_000 })
  })

  test('repo list loads and can be selected', async () => {
    const { window } = ctx

    // Repo list should be visible (from previous test)
    const repoItems = window.locator(SEL.githubRepoItem)
    await expect(repoItems.first()).toBeVisible({ timeout: 5_000 })

    // Should have mock repos
    const count = await repoItems.count()
    expect(count).toBeGreaterThanOrEqual(1)

    // Select first repo
    await repoItems.first().click()

    // The repo item should show selected state
    await expect(repoItems.first()).toHaveClass(/selected/)
  })
})
