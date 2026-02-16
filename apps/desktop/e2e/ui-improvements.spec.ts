import { test, expect } from '@playwright/test'
import { launchApp, closeApp, type AppContext } from './helpers/app'
import { copyFixture, cleanupFixture } from './helpers/fixtures'
import { SEL } from './helpers/selectors'

test.describe('UI Improvements', () => {
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

  test('should show >> button to reopen folder panel', async () => {
    const { window } = ctx

    // Select a feature to trigger folder panel auto-hide
    const loginNode = window.locator(`${SEL.featureTreeFile}[data-path="login.feature"]`)
    await loginNode.click()
    await expect(window.locator(SEL.scenarioBuilder)).toBeVisible()

    // Folder panel should be hidden, >> button should appear
    const openPanelBtn = window.locator('button[title="Show folder panel"]')
    await expect(openPanelBtn).toBeVisible()

    // Click >> to reopen folder panel
    await openPanelBtn.click()
    await expect(window.locator(SEL.featureTree)).toBeVisible()

    // << button should now be visible to close it again
    const closePanelBtn = window.locator('button[title="Hide folder panel"]')
    await expect(closePanelBtn).toBeVisible()

    // Close panel again for next tests
    await closePanelBtn.click()
  })

  test('should show red Cancel button when changes are dirty', async () => {
    const { window } = ctx

    // Switch to edit mode
    await window.locator(SEL.editModeBtn).click()
    await expect(window.locator(SEL.doneBtn)).toBeVisible()

    // Edit an arg to make the scenario dirty
    const argInputs = window.locator(SEL.inlineArgInput)
    const firstInput = argInputs.first()
    await firstInput.clear()
    await firstInput.fill('modified-value')

    // Cancel button should appear with danger severity (outlined red)
    const cancelBtn = window.locator('button:has-text("Cancel")')
    await expect(cancelBtn).toBeVisible()

    // Click Cancel to discard changes
    await cancelBtn.click()

    // After cancel, dirty state should be cleared — Cancel and Save should disappear
    await expect(cancelBtn).not.toBeVisible()
    await expect(window.locator(SEL.saveBtn)).not.toBeVisible()

    // Done button should be enabled
    await expect(window.locator(SEL.doneBtn)).toBeEnabled()
  })

  test('should show scenario pagination with add/remove buttons in edit mode', async () => {
    const { window } = ctx

    // login.feature has 2 scenarios so pagination should be visible even in read mode
    // But we're in edit mode, verify pagination is visible
    const pagination = window.locator('.scenario-pagination')
    await expect(pagination).toBeVisible()

    // Should show pagination dots
    const dots = pagination.locator('.pagination-dot')
    const dotCount = await dots.count()
    expect(dotCount).toBe(2) // login.feature has 2 scenarios

    // In edit mode, should show add (+) and delete (trash) buttons
    const addBtn = pagination.locator('button[title="Add new scenario"]')
    await expect(addBtn).toBeVisible()

    const deleteBtn = pagination.locator('button[title="Remove current scenario"]')
    await expect(deleteBtn).toBeVisible()
  })

  test('should add a new scenario via pagination + button', async () => {
    const { window } = ctx

    const pagination = window.locator('.scenario-pagination')
    const addBtn = pagination.locator('button[title="Add new scenario"]')

    // Add a new scenario
    await addBtn.click()

    // Should now have 3 pagination dots
    const dots = pagination.locator('.pagination-dot')
    await expect(dots).toHaveCount(3)

    // The new scenario should be active (last dot should be active)
    const activeDot = pagination.locator('.pagination-dot.active')
    await expect(activeDot).toBeVisible()
  })

  test('should remove a scenario via pagination trash button', async () => {
    const { window } = ctx

    const pagination = window.locator('.scenario-pagination')
    const deleteBtn = pagination.locator('button[title="Remove current scenario"]')

    // Remove the current (newly added) scenario
    await deleteBtn.click()

    // Should be back to 2 scenarios
    const dots = pagination.locator('.pagination-dot')
    await expect(dots).toHaveCount(2)
  })

  test('should not show duplicate tags in edit mode', async () => {
    const { window } = ctx

    // Discard changes from previous tests if dirty
    const cancelBtn = window.locator('button:has-text("Cancel")')
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click()
    }

    // Navigate to the builder in edit mode
    const builder = window.locator(SEL.scenarioBuilder)
    await expect(builder).toBeVisible()

    // The read-only tags div should NOT be visible in edit mode
    // (only TagsEditor should be shown)
    const readOnlyTags = builder.locator('.scenario-tags')
    await expect(readOnlyTags).not.toBeVisible()

    // Exit edit mode
    await window.locator(SEL.doneBtn).click()
    await expect(window.locator(SEL.editModeBtn)).toBeVisible()
  })

  test('should show Add step buttons in drop zones', async () => {
    const { window } = ctx

    // Enter edit mode
    await window.locator(SEL.editModeBtn).click()
    await expect(window.locator(SEL.doneBtn)).toBeVisible()

    // Drop zones should contain "Add step" buttons (hidden by default, visible on hover)
    const addStepBtns = window.locator('.add-step-btn')
    const count = await addStepBtns.count()
    expect(count).toBeGreaterThan(0)

    // Exit edit mode
    await window.locator(SEL.doneBtn).click()
  })
})
