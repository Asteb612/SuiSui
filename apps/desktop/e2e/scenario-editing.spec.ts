import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { launchApp, closeApp, type AppContext } from './helpers/app'
import { copyFixture, cleanupFixture } from './helpers/fixtures'
import { SEL } from './helpers/selectors'

test.describe('Scenario Editing & Gherkin Validation', () => {
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

  test('should display step argument values in read mode', async () => {
    const { window } = ctx

    // Select login.feature
    const loginNode = window.locator(`${SEL.featureTreeFile}[data-path="login.feature"]`)
    await loginNode.click()

    // Scenario builder should show with step content
    await expect(window.locator(SEL.scenarioBuilder)).toBeVisible()

    // Read mode should display the original arg values from login.feature
    const builder = window.locator(SEL.scenarioBuilder)
    await expect(builder).toContainText('login')
    await expect(builder).toContainText('admin')
    await expect(builder).toContainText('secret')
    await expect(builder).toContainText('Welcome')
    await expect(builder).toContainText('/dashboard')
  })

  test('should show inline arg inputs in edit mode', async () => {
    const { window } = ctx

    // Switch to edit mode
    await window.locator(SEL.editModeBtn).click()
    await expect(window.locator(SEL.doneBtn)).toBeVisible()

    // Inline arg inputs should be visible for each step argument
    const argInputs = window.locator(SEL.inlineArgInput)
    const count = await argInputs.count()
    // "Successful login" scenario has 8 string args:
    // "login", "[name='username']", "admin", "[name='password']", "secret",
    // "[type='submit']", "Welcome", "/dashboard"
    expect(count).toBeGreaterThanOrEqual(8)

    // First input should have the value "login" (from: I am on the "login" page)
    await expect(argInputs.first()).toHaveValue('login')
  })

  test('should edit step argument and see save button appear', async () => {
    const { window } = ctx

    // Edit the first inline arg input: change "login" to "dashboard"
    const argInputs = window.locator(SEL.inlineArgInput)
    const firstInput = argInputs.first()
    await firstInput.clear()
    await firstInput.fill('dashboard')

    // isDirty should be true now — Save button should appear
    await expect(window.locator(SEL.saveBtn)).toBeVisible()
    await expect(window.locator(SEL.saveBtn)).toBeEnabled()

    // Done button should be disabled while dirty
    await expect(window.locator(SEL.doneBtn)).toBeDisabled()
  })

  test('should save edited scenario to feature file', async () => {
    const { window } = ctx

    // Click Save
    await window.locator(SEL.saveBtn).click()

    // After save, isDirty becomes false:
    // - Save button should disappear (only shown when dirty)
    await expect(window.locator(SEL.saveBtn)).not.toBeVisible()
    // - Done button should be enabled
    await expect(window.locator(SEL.doneBtn)).toBeEnabled()

    // Read the saved file from disk and verify the change
    const featurePath = path.join(workspacePath, 'features', 'login.feature')
    const content = fs.readFileSync(featurePath, 'utf-8')

    // Should contain the updated value
    expect(content).toContain('"dashboard"')
    // Should NOT contain the old value for that step
    // (the first scenario's first step should be "dashboard" not "login")
    // Note: "login" may still appear in the Feature name or second scenario
    expect(content).toMatch(/I am on the "dashboard" page/)

    // Verify proper Gherkin structure
    expect(content).toMatch(/^Feature: Login/m)
    expect(content).toMatch(/^\s+Scenario: Successful login/m)
    expect(content).toMatch(/^\s+Scenario: Failed login/m)
    expect(content).toMatch(/^\s+Given /m)
    expect(content).toMatch(/^\s+When /m)
    expect(content).toMatch(/^\s+Then /m)
    expect(content).toMatch(/^\s+And /m)
  })

  test('should show updated values in read mode after save', async () => {
    const { window } = ctx

    // Click Done to return to read mode
    await window.locator(SEL.doneBtn).click()
    await expect(window.locator(SEL.editModeBtn)).toBeVisible()

    // Read mode should display the new value
    const builder = window.locator(SEL.scenarioBuilder)
    await expect(builder).toContainText('dashboard')
  })

  test('should preserve Gherkin format after save', async () => {
    // Verify the full Gherkin structure of the saved file
    const featurePath = path.join(workspacePath, 'features', 'login.feature')
    const content = fs.readFileSync(featurePath, 'utf-8')
    const lines = content.split('\n')

    // Feature header should be at the top
    expect(lines[0]).toBe('Feature: Login')

    // Each scenario should have correct indentation (2 spaces)
    const scenarioLines = lines.filter(l => l.trimStart().startsWith('Scenario:'))
    expect(scenarioLines.length).toBe(2)
    for (const line of scenarioLines) {
      expect(line).toMatch(/^ {2}Scenario:/)
    }

    // Steps should be indented 4 spaces
    const stepLines = lines.filter(l => /^\s+(Given|When|Then|And)\s/.test(l))
    expect(stepLines.length).toBeGreaterThan(0)
    for (const line of stepLines) {
      expect(line).toMatch(/^ {4}(Given|When|Then|And) /)
    }

    // No consecutive empty lines (max one blank between sections)
    expect(content).not.toMatch(/\n\n\n/)
  })

  test('should persist saved changes when switching features and back', async () => {
    const { window } = ctx

    // Ensure folder panel is visible
    const folderPanel = window.locator(SEL.featureTree)
    const isPanelVisible = await folderPanel.isVisible()
    if (!isPanelVisible) {
      await window.locator('button[title="Show folder panel"]').click()
      await expect(folderPanel).toBeVisible()
    }

    // Expand cart folder
    const cartFolder = window.locator(`${SEL.featureTreeFolder}[data-path="cart"]`)
    await cartFolder.locator('.node-toggle').click()

    // Switch to checkout.feature
    const checkoutNode = window.locator(`${SEL.featureTreeFile}[data-path="cart/checkout.feature"]`)
    await checkoutNode.locator('.node-content').click()
    await expect(window.locator(SEL.scenarioBuilder)).toContainText('shopper')

    // Ensure folder panel is visible again before switching back
    const isPanelStillVisible = await folderPanel.isVisible()
    if (!isPanelStillVisible) {
      await window.locator('button[title="Show folder panel"]').click()
      await expect(folderPanel).toBeVisible()
    }

    // Switch back to login.feature
    const loginNode = window.locator(`${SEL.featureTreeFile}[data-path="login.feature"]`)
    await loginNode.click()

    // Verify the previously saved change persists (read from file → store)
    const builder = window.locator(SEL.scenarioBuilder)
    await expect(builder).toContainText('dashboard')

    // Also verify in edit mode
    await window.locator(SEL.editModeBtn).click()
    const argInputs = window.locator(SEL.inlineArgInput)
    await expect(argInputs.first()).toHaveValue('dashboard')

    // Return to read mode
    await window.locator(SEL.doneBtn).click()
    await expect(window.locator(SEL.editModeBtn)).toBeVisible()
  })

  test('should show step catalog in edit mode', async () => {
    const { window } = ctx

    // Switch to edit mode
    await window.locator(SEL.editModeBtn).click()

    // Step selector panel should appear with step items
    await expect(window.locator(SEL.stepSelector)).toBeVisible()
    const stepItems = window.locator(SEL.stepItem)
    const count = await stepItems.count()
    expect(count).toBeGreaterThan(0)

    // Return to read mode
    await window.locator(SEL.doneBtn).click()
  })
})
