import { test, expect } from '@playwright/test'
import { launchApp, closeApp, ensureFolderPanelVisible, type AppContext } from './helpers/app'
import { copyFixture, cleanupFixture } from './helpers/fixtures'
import { SEL } from './helpers/selectors'

/**
 * E2E coverage for the AI assistant (US1–US4) driven end-to-end through the app.
 *
 * In test mode (APP_TEST_MODE=1) the AI service uses a FakeAIProvider with a
 * context-aware responder (see electron/ipc/handlers.ts) — no real model, CLI, or
 * network is touched (Constitution Principle III). These tests exercise the real
 * renderer → IPC → streaming → validation/reconciliation path with deterministic
 * fake output.
 */
test.describe('AI assistant (fake provider)', () => {
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

  test('AI entry points are hidden until a provider is configured', async () => {
    const w = ctx.window
    // No provider yet → the "Generate with AI" entry point is absent (FR-014).
    await expect(w.locator('[data-testid="ai-generate-btn"]')).toHaveCount(0)
    // The settings gear is always available.
    await expect(w.locator('[data-testid="settings-btn"]')).toBeVisible()
  })

  test('configuring a provider enables the AI entry points', async () => {
    const w = ctx.window
    // Settings gear → general Settings dialog → open AI provider settings.
    await w.locator('[data-testid="settings-btn"]').click()
    await expect(w.locator('[data-testid="settings-dialog"]')).toBeVisible()
    await w.locator('[data-testid="settings-open-ai"]').click()
    await expect(w.locator('[data-testid="ai-settings-dialog"]')).toBeVisible()

    // Select the always-available BYOK provider.
    await w.locator('[data-testid="ai-provider-select"]').click()
    await w.getByRole('option', { name: /Bring your own key/i }).click()
    await w.locator('[data-testid="ai-settings-save"]').click()

    // Entry point now visible (FR-014).
    await expect(w.locator('[data-testid="ai-generate-btn"]')).toBeVisible()
  })

  /** Ensure the builder is showing login.feature in edit mode (idempotent across tests). */
  async function openLoginInEditMode() {
    const w = ctx.window
    const done = w.locator(SEL.doneBtn)
    const alreadyEditing =
      (await w.locator(SEL.scenarioBuilder).isVisible().catch(() => false)) &&
      (await done.isVisible().catch(() => false))
    if (!alreadyEditing) {
      // The folder panel auto-hides after a feature is opened; reopen it to re-select.
      await ensureFolderPanelVisible(w)
      await w.locator(`${SEL.featureTreeFile}[data-path="login.feature"]`).click()
      await expect(w.locator(SEL.scenarioBuilder)).toBeVisible()
      const editBtn = w.locator(SEL.editModeBtn)
      if (await editBtn.isVisible().catch(() => false)) {
        await editBtn.click()
      }
    }
    await expect(done).toBeVisible()
  }

  test('auto-fills step arguments (US4)', async () => {
    const w = ctx.window
    await openLoginInEditMode()

    // The per-step "Auto-fill (AI)" button appears in edit mode; clicking the first
    // one fills that step's args, so the first inline arg input takes the fake value.
    const autoFill = w.locator('[data-testid^="ai-autofill-"]').first()
    await expect(autoFill).toBeVisible()
    await autoFill.click()

    await expect(w.locator(SEL.inlineArgInput).first()).toHaveValue('AI value', { timeout: 10_000 })
  })

  test('suggests a matching existing step (US3)', async () => {
    const w = ctx.window
    await openLoginInEditMode()

    // Open the add-step dialog (first "Add step" affordance in edit mode).
    await w.getByRole('button', { name: 'Add step' }).first().click()

    // Sanity: the workspace step catalog is loaded (so a match is possible).
    await expect(w.getByText('I am on the', { exact: false }).first()).toBeVisible({ timeout: 10_000 })

    // Describe an action and ask the assistant to suggest a step.
    await w.getByPlaceholder(/describe an action for AI/i).fill('open the landing page')
    await w.locator('[data-testid="ai-suggest-step"]').click()

    // The fake returns a real existing step → a suggestion (not "no match") is shown.
    await expect(w.locator('[data-testid="ai-suggestion"]')).toBeVisible({ timeout: 10_000 })
    await expect(w.locator('[data-testid="ai-suggestion-accept"]')).toBeVisible()
    await w.locator('[data-testid="ai-suggestion-accept"]').click()

    // Dialog closes (step accepted).
    await expect(w.locator('[data-testid="ai-suggestion"]')).toHaveCount(0)
  })

  test('generates a scenario from a description and inserts it (US2)', async () => {
    const w = ctx.window
    await w.locator('[data-testid="ai-generate-btn"]').click()
    await expect(w.locator('[data-testid="ai-generation-dialog"]')).toBeVisible()

    await w.locator('[data-testid="ai-gen-description"]').fill('a user visits the home page')
    await w.locator('[data-testid="ai-gen-generate"]').click()

    // The draft streams in, then validation runs and Accept becomes enabled.
    const draft = w.locator('[data-testid="ai-gen-draft"]')
    await expect(draft).toHaveValue(/Feature: AI generated/, { timeout: 15_000 })

    const accept = w.locator('[data-testid="ai-gen-accept"]')
    await expect(accept).toBeEnabled({ timeout: 15_000 })
    await accept.click()

    // The generated scenario is inserted into the builder (its name lands in the
    // scenario-name field; the generated steps render in the builder).
    await expect(w.locator('[data-testid="ai-generation-dialog"]')).toHaveCount(0)
    await expect(w.getByPlaceholder('Scenario name...')).toHaveValue('generated flow')
    await expect(w.locator(SEL.scenarioBuilder)).toContainText('I am on the')
  })
})
