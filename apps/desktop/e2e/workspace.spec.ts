import { test, expect } from '@playwright/test'
import { launchApp, closeApp, type AppContext } from './helpers/app'
import { copyFixture, cleanupFixture } from './helpers/fixtures'
import { SEL } from './helpers/selectors'

test.describe('Workspace Management', () => {
  let ctx: AppContext
  let workspacePath: string

  test.describe('open valid workspace', () => {
    test.beforeAll(async () => {
      workspacePath = await copyFixture('minimal')
      ctx = await launchApp(workspacePath)
    })

    test.afterAll(async () => {
      await closeApp(ctx)
      await cleanupFixture(workspacePath)
    })

    test('should load workspace and show feature tree', async () => {
      const { window } = ctx

      // The app should load and show the main container
      await expect(window.locator(SEL.mainContainer)).toBeVisible()

      // Status bar should show workspace path
      await expect(window.locator(SEL.statusBar)).toContainText(workspacePath)
    })

    test('should show feature tree with zero features', async () => {
      const { window } = ctx

      // Feature tree should be visible
      await expect(window.locator(SEL.featureTree)).toBeVisible()

      // Feature count should be 0
      await expect(window.locator(SEL.featureCount)).toContainText('0 features')
    })

    test('should show steps loaded from mock export', async () => {
      const { window } = ctx

      // Status bar should indicate steps are loaded
      await expect(window.locator(SEL.statusBar)).toContainText('steps loaded')
    })
  })

  test.describe('open workspace with features', () => {
    test.beforeAll(async () => {
      workspacePath = await copyFixture('with-features')
      ctx = await launchApp(workspacePath)
    })

    test.afterAll(async () => {
      await closeApp(ctx)
      await cleanupFixture(workspacePath)
    })

    test('should load workspace and show features in tree', async () => {
      const { window } = ctx

      await expect(window.locator(SEL.mainContainer)).toBeVisible()
      await expect(window.locator(SEL.featureTree)).toBeVisible()

      // Should show feature count > 0
      const featureCount = window.locator(SEL.featureCount)
      await expect(featureCount).not.toContainText('0 features')
    })

    test('should show feature files in tree', async () => {
      const { window } = ctx

      // Tree should contain file nodes for login.feature
      const fileNodes = window.locator(SEL.featureTreeFile)
      await expect(fileNodes.first()).toBeVisible()
    })

    test('should show folder nodes in tree', async () => {
      const { window } = ctx

      // Tree should contain folder nodes (cart/)
      const folderNodes = window.locator(SEL.featureTreeFolder)
      await expect(folderNodes.first()).toBeVisible()
    })
  })

  test.describe('welcome screen without workspace', () => {
    test.beforeAll(async () => {
      // Launch without a workspace path
      ctx = await launchApp()
    })

    test.afterAll(async () => {
      await closeApp(ctx)
    })

    test('should show welcome screen when no workspace', async () => {
      const { window } = ctx

      await expect(window.locator(SEL.mainContainer)).toBeVisible()

      // Welcome screen should be visible
      await expect(window.locator(SEL.welcomeScreen)).toBeVisible()

      // Should show "Welcome to SuiSui"
      await expect(window.locator('text=Welcome to SuiSui')).toBeVisible()
    })

    test('should show select workspace button', async () => {
      const { window } = ctx

      await expect(window.locator(SEL.selectWorkspaceBtn)).toBeVisible()
    })
  })
})
