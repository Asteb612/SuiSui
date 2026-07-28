import { test, expect, type Page } from '@playwright/test'
import { launchApp, closeApp, type AppContext } from './helpers/app'
import { copyFixture, cleanupFixture } from './helpers/fixtures'

const INPUT = '[data-testid="global-search-input"]'
const PANEL = '[data-testid="global-search-panel"]'
const EMPTY = '[data-testid="global-search-empty"]'
const RESULT = (i: number) => `[data-testid="global-search-result-${i}"]`

/** Focus search the way a user does — via the keyboard shortcut, never by clicking. */
async function openSearch(window: Page) {
  await window.keyboard.press('Control+K')
  await expect(window.locator(INPUT)).toBeFocused()
}

/**
 * Type a query and wait for it to SETTLE.
 *
 * The panel becomes visible the instant you type, before the debounced query has
 * resolved — waiting only on the panel would assert against an in-flight state.
 */
async function search(window: Page, text: string) {
  await openSearch(window)
  await window.locator(INPUT).fill(text)
  await expect(window.locator(PANEL)).toBeVisible()
  await expect(window.locator('[data-testid="global-search-searching"]')).toBeHidden()
}

async function resetSearch(window: Page) {
  await window.locator(INPUT).fill('')
  await window.keyboard.press('Escape')
}

test.describe('Global Search', () => {
  let ctx: AppContext
  let workspacePath: string

  test.beforeAll(async () => {
    workspacePath = await copyFixture('search')
    ctx = await launchApp(workspacePath)
  })

  test.afterAll(async () => {
    await closeApp(ctx)
    await cleanupFixture(workspacePath)
  })

  test.beforeEach(async () => {
    await resetSearch(ctx.window)
  })

  test('Ctrl+K focuses the header search input', async () => {
    const { window } = ctx
    await expect(window.locator('[data-testid="global-search"]')).toBeVisible()
    await openSearch(window)
  })

  test('finds a scenario by name and shows its owning feature', async () => {
    const { window } = ctx
    await search(window, 'failed login')

    const first = window.locator(RESULT(0))
    await expect(first).toBeVisible()
    await expect(first).toContainText('Failed login')
    await expect(first).toContainText('User login')
  })

  test('finds a feature by name', async () => {
    const { window } = ctx
    await search(window, 'payment checkout')
    await expect(window.locator(RESULT(0))).toContainText('Payment checkout')
  })

  test('matches all query words in any order', async () => {
    const { window } = ctx
    await search(window, 'login failed')
    await expect(window.locator(RESULT(0))).toContainText('Failed login')
  })

  test('lists duplicate scenario names from different files separately', async () => {
    const { window } = ctx
    await search(window, 'successful login')

    const rows = window.locator(`${PANEL} [data-testid^="global-search-result-"]`)
    await expect(rows.filter({ hasText: 'Successful login' })).toHaveCount(2)
    await expect(window.locator(PANEL)).toContainText('login.feature')
    await expect(window.locator(PANEL)).toContainText('payment.feature')
  })

  test('returns a Scenario Outline as one result and never its Examples values', async () => {
    const { window } = ctx
    await search(window, 'login as')
    await expect(window.locator(RESULT(0))).toContainText('Login as')

    // `supervisor` only exists inside the Examples table — it must not be searchable.
    await window.locator(INPUT).fill('supervisor')
    await expect(window.locator(EMPTY)).toBeVisible()
  })

  test('matches accent- and case-insensitively', async () => {
    const { window } = ctx
    await search(window, 'connexion')
    await expect(window.locator(RESULT(0))).toContainText('Connexion')
  })

  test('shows an explicit empty state for a query that matches nothing', async () => {
    const { window } = ctx
    await search(window, 'zzz-nothing-matches-this')
    await expect(window.locator(EMPTY)).toBeVisible()
  })

  test('treats regex metacharacters as literal text', async () => {
    const { window } = ctx
    await search(window, '.*')
    await expect(window.locator(EMPTY)).toBeVisible()
  })

  test('navigates to the matched scenario using only the keyboard', async () => {
    const { window } = ctx
    await search(window, 'failed login')

    await window.keyboard.press('ArrowDown')
    await window.keyboard.press('ArrowUp')
    await window.keyboard.press('Enter')

    // Panel closes and the editor lands on the matched scenario.
    await expect(window.locator(PANEL)).toBeHidden()
    await expect(window.locator('[data-testid="status-bar"]')).toBeVisible()
    await expect(window.locator('body')).toContainText('Failed login')
  })

  test('Escape dismisses the results panel', async () => {
    const { window } = ctx
    await search(window, 'login')
    await window.keyboard.press('Escape')
    await expect(window.locator(PANEL)).toBeHidden()
  })

  test('keeps returning results despite an unparseable feature file', async () => {
    const { window } = ctx
    await search(window, 'login')

    // Other files are unaffected...
    await expect(window.locator(RESULT(0))).toBeVisible()
    // ...and the skipped file is surfaced to the author.
    await expect(window.locator('[data-testid="global-search-unparsed"]')).toContainText(
      'broken.feature'
    )
  })

  test.describe('tags and filtering', () => {
    test('matches a tag with and without a leading @', async () => {
      const { window } = ctx

      await search(window, 'smoke')
      const withoutAt = await window
        .locator(`${PANEL} [data-testid^="global-search-result-"]`)
        .count()
      expect(withoutAt).toBeGreaterThan(0)

      await window.locator(INPUT).fill('@smoke')
      await expect(window.locator('[data-testid="global-search-searching"]')).toBeHidden()
      await expect(window.locator(`${PANEL} [data-testid^="global-search-result-"]`)).toHaveCount(
        withoutAt
      )
    })

    test('shows which tag matched', async () => {
      const { window } = ctx
      await search(window, 'billing')
      await expect(window.locator('[data-testid="global-search-matched-tag"]').first()).toContainText(
        '@billing'
      )
    })

    test('narrows results with the type filter', async () => {
      const { window } = ctx
      await search(window, 'login')

      const all = await window.locator(`${PANEL} [data-testid^="global-search-result-"]`).count()
      await window.locator('[data-testid="global-search-filter-feature"]').click()
      const features = await window
        .locator(`${PANEL} [data-testid^="global-search-result-"]`)
        .count()

      expect(features).toBeLessThan(all)
      expect(features).toBeGreaterThan(0)
    })

    test('resets the type filter when the query is cleared', async () => {
      const { window } = ctx
      await search(window, 'login')
      await window.locator('[data-testid="global-search-filter-feature"]').click()

      await window.locator(INPUT).fill('')
      await window.locator(INPUT).fill('login')
      await expect(window.locator('[data-testid="global-search-searching"]')).toBeHidden()

      await expect(window.locator('[data-testid="global-search-filter-all"]')).toHaveClass(/active/)
    })
  })
})

/**
 * Regression: search on a workspace RESTORED FROM SETTINGS.
 *
 * The suite above always opens the workspace by selection, which goes through
 * WORKSPACE_SET. Real users relaunch the app and the workspace comes back via
 * WORKSPACE_GET — a path that once left the index empty, so every search
 * reported "no results". Separate describe because it needs its own launches.
 */
test.describe('Global Search — restored workspace', () => {
  test('indexes a workspace restored from settings on relaunch', async () => {
    const workspacePath = await copyFixture('search')

    // First launch: select the workspace so it is persisted to settings.
    const first = await launchApp(workspacePath)
    const userDataDir = first.userDataDir
    await closeApp(first)

    // Second launch: same userData, NO TEST_WORKSPACE_PATH — the workspace is
    // restored from settings, exactly as it is for a real user.
    const second = await launchApp(undefined, undefined, userDataDir)
    const { window } = second

    await expect(window.locator('[data-testid="global-search"]')).toBeVisible({ timeout: 20_000 })
    await window.keyboard.press('Control+K')
    await window.locator(INPUT).fill('failed login')
    await expect(window.locator(PANEL)).toBeVisible()
    await expect(window.locator('[data-testid="global-search-searching"]')).toBeHidden()

    await expect(window.locator(RESULT(0))).toContainText('Failed login')

    await closeApp(second)
    await cleanupFixture(workspacePath)
  })
})
