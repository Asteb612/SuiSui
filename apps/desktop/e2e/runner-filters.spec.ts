import { test, expect, type Page } from '@playwright/test'
import { launchApp, closeApp, type AppContext } from './helpers/app'
import { copyFixture, cleanupFixture } from './helpers/fixtures'
import { SEL } from './helpers/selectors'

/**
 * The runner's filter panel, against a fixture with exact known numbers
 * (`fixtures/workspaces/runner-filters/README.md`): 8 tests across 3 features,
 * one of them a 3-row `Scenario Outline`.
 *
 * Three things were wrong and are asserted here:
 *
 * 1. The feature checkboxes rendered every box ticked when the selection was
 *    EMPTY (which means "no filter"). Clicking a ticked box then read as
 *    "deselect one" but was really the first tick of an empty list, so every
 *    other feature silently dropped out.
 * 2. The count counted authored scenarios, so a `Scenario Outline` counted once
 *    instead of once per example row — the panel promised fewer tests than ran.
 * 3. Only the open tab's filter applied. A folder and a tag could not be
 *    combined, which is the main thing anyone wants two filters for.
 *
 * No test here runs Playwright: the panel reads `.feature` files (Constitution III).
 */

/** The count reads "N scenarios across M features will run". */
async function matchedCount(window: Page): Promise<number> {
  const text = (await window.locator(SEL.runnerMatchedCount).textContent()) ?? ''
  const match = text.match(/(\d+)\s+scenario/)
  return match ? Number(match[1]) : -1
}

async function expectCount(window: Page, expected: number): Promise<void> {
  await expect
    .poll(() => matchedCount(window), { timeout: 5_000 })
    .toBe(expected)
}

function featureRow(window: Page, relativePath: string) {
  return window.locator(`${SEL.featureFilterItem}[data-path="${relativePath}"]`)
}

function tagChip(window: Page, tag: string) {
  return window.locator(`${SEL.tagFilterItem}[data-tag="${tag}"]`)
}

/**
 * Tick a folder in the PrimeVue tree by its label (the last path segment).
 *
 * Child folders are not in the DOM until their parent is expanded, so this
 * expands the root first when the wanted node is not there yet.
 */
async function toggleFolder(window: Page, label: string): Promise<void> {
  const node = window.locator('.p-tree-node-label').filter({ hasText: new RegExp(`^${label}$`) })

  if ((await node.count()) === 0) {
    await window.locator('.p-tree-node-toggle-button').first().click()
    await expect(node).toHaveCount(1)
  }

  // The label's parent is the node row, which holds that node's own checkbox.
  await node.locator('xpath=..').locator('.p-tree-node-checkbox').click()
}

test.describe('Test runner filters', () => {
  let ctx: AppContext
  let workspacePath: string

  test.beforeAll(async () => {
    workspacePath = await copyFixture('runner-filters')
    ctx = await launchApp(workspacePath)
    await ctx.window.locator(SEL.runTestsBtn).click()
    await expect(ctx.window.locator(SEL.filterTabFeatures)).toBeVisible({ timeout: 15_000 })
  })

  test.afterAll(async () => {
    await closeApp(ctx)
    await cleanupFixture(workspacePath)
  })

  /**
   * Every test starts from "no filters" on the Features tab, whatever the
   * previous one left behind — the app instance is shared across the file, and
   * both the selection and the open tab persist.
   */
  test.beforeEach(async () => {
    const clear = ctx.window.locator('button', { hasText: 'Clear' })
    if (await clear.count()) await clear.first().click()
    await ctx.window.locator(SEL.filterTabFeatures).click()
    await expectCount(ctx.window, 8)
  })

  test('counts every example row of an outline, not the outline once', async () => {
    const { window } = ctx

    // 6 authored scenarios, 8 tests: the 3-row outline is the whole difference.
    await expectCount(window, 8)
    await expect(window.locator(SEL.featureFilterItem)).toHaveCount(3)

    // The per-file count is tests too, so the two never disagree.
    await expect(featureRow(window, 'features/auth/login.feature')).toContainText('4 tests')
    await expect(featureRow(window, 'features/cart/checkout.feature')).toContainText('2 tests')
  })

  test.describe('feature selection', () => {
    test('shows nothing ticked when nothing is selected, and says so', async () => {
      const { window } = ctx

      // The boxes must not claim a selection that does not exist — that is what
      // made the first click look like it was deselecting.
      await expect(window.locator(`${SEL.featureFilterItem}[data-selected="true"]`)).toHaveCount(0)
      await expect(window.locator(SEL.featuresNoFilterHint)).toBeVisible()
      await expectCount(window, 8)
    })

    test('selecting one feature narrows to it and leaves the others alone', async () => {
      const { window } = ctx

      await featureRow(window, 'features/smoke.feature').click()

      await expect(featureRow(window, 'features/smoke.feature')).toHaveAttribute(
        'data-selected',
        'true',
      )
      await expectCount(window, 2)
    })

    test('adds to the selection rather than replacing it', async () => {
      const { window } = ctx

      await featureRow(window, 'features/smoke.feature').click()
      await featureRow(window, 'features/cart/checkout.feature').click()

      await expect(window.locator(`${SEL.featureFilterItem}[data-selected="true"]`)).toHaveCount(2)
      await expectCount(window, 4)
    })

    test('clicking a ticked feature deselects only that one', async () => {
      const { window } = ctx

      await featureRow(window, 'features/smoke.feature').click()
      await featureRow(window, 'features/cart/checkout.feature').click()
      await featureRow(window, 'features/smoke.feature').click()

      await expect(featureRow(window, 'features/smoke.feature')).toHaveAttribute(
        'data-selected',
        'false',
      )
      await expect(featureRow(window, 'features/cart/checkout.feature')).toHaveAttribute(
        'data-selected',
        'true',
      )
      await expectCount(window, 2)
    })

    test('Select All ticks everything, and back to none means all again', async () => {
      const { window } = ctx

      await window.locator(SEL.featuresSelectAll).click()
      await expect(window.locator(`${SEL.featureFilterItem}[data-selected="true"]`)).toHaveCount(3)
      await expectCount(window, 8)

      await window.locator(SEL.featuresSelectAll).click()
      await expect(window.locator(`${SEL.featureFilterItem}[data-selected="true"]`)).toHaveCount(0)
      // No selection is no filter, so the same 8 tests run.
      await expectCount(window, 8)
    })
  })

  test.describe('tag selection', () => {
    test.beforeEach(async () => {
      await ctx.window.locator(SEL.filterTabTags).click()
    })

    test('counts the tests a tag matches, including inherited feature tags', async () => {
      const { window } = ctx

      // @smoke is on smoke.feature (both scenarios, by inheritance) and on one
      // scenario of checkout.feature.
      await tagChip(window, 'smoke').click()
      await expectCount(window, 3)
    })

    test('counts every example row when the tag is on an outline', async () => {
      const { window } = ctx

      await tagChip(window, 'slow').click()
      await expectCount(window, 3)
    })

    test('a feature-level tag covers everything beneath it', async () => {
      const { window } = ctx

      await tagChip(window, 'auth').click()
      await expectCount(window, 4)
    })

    test('several tags are an OR', async () => {
      const { window } = ctx

      await tagChip(window, 'slow').click()
      await tagChip(window, 'smoke').click()
      await expectCount(window, 6)
    })
  })

  test.describe('combining filters', () => {
    test('narrows a folder by a tag', async () => {
      const { window } = ctx

      await window.locator(SEL.filterTabFolders).click()
      await toggleFolder(window, 'cart')
      await expectCount(window, 2)

      await window.locator(SEL.filterTabTags).click()
      await tagChip(window, 'smoke').click()

      // Deliberately a tag that spans folders: @smoke is 3 tests across the
      // workspace and 1 inside features/cart. Anything that dropped the folder
      // the moment the tags tab opened would read 3 here.
      await expectCount(window, 1)
    })

    test('narrows a feature by a tag', async () => {
      const { window } = ctx

      await featureRow(window, 'features/smoke.feature').click()
      await window.locator(SEL.filterTabTags).click()
      await tagChip(window, 'smoke').click()

      await expectCount(window, 2)
    })

    test('reaches zero when the two disagree, rather than ignoring one', async () => {
      const { window } = ctx

      await featureRow(window, 'features/smoke.feature').click()
      await window.locator(SEL.filterTabTags).click()
      await tagChip(window, 'slow').click()

      await expectCount(window, 0)
    })

    test('unions features with folders — both answer "which files"', async () => {
      const { window } = ctx

      await featureRow(window, 'features/smoke.feature').click()
      await window.locator(SEL.filterTabFolders).click()
      await toggleFolder(window, 'cart')

      // smoke.feature (2) + everything under features/cart (2).
      await expectCount(window, 4)
    })

    test('keeps the name filter on top of a tag', async () => {
      const { window } = ctx

      await window.locator(SEL.filterTabTags).click()
      await tagChip(window, 'smoke').click()
      await window.locator('input[placeholder="Filter scenarios by name..."]').fill('boots')

      await expectCount(window, 1)
    })

    test('switching tabs changes what is shown, not what is filtered', async () => {
      const { window } = ctx

      await featureRow(window, 'features/auth/login.feature').click()
      await expectCount(window, 4)

      await window.locator(SEL.filterTabTags).click()
      await expectCount(window, 4)

      await window.locator(SEL.filterTabFolders).click()
      await expectCount(window, 4)
    })

    test('Clear puts every filter back, whichever tab set it', async () => {
      const { window } = ctx

      await featureRow(window, 'features/smoke.feature').click()
      await window.locator(SEL.filterTabTags).click()
      await tagChip(window, 'smoke').click()
      await expectCount(window, 2)

      await window.locator('button', { hasText: 'Clear' }).first().click()
      await expectCount(window, 8)
    })
  })
})
