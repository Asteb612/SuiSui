import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { launchApp, closeApp, type AppContext } from './helpers/app'
import { copyFixture, cleanupFixture } from './helpers/fixtures'

const BROWSER = '[data-testid="tag-browser"]'
const FILTER = '[data-testid="tag-filter"]'
const tagRow = (name: string) => `[data-testid="tag-row-${name}"]`
const tagCount = (name: string) => `[data-testid="tag-count-${name}"]`

/**
 * Expected counts for the `tags` fixture. Feature-level tags apply to every
 * scenario beneath them, and a scenario carrying a tag both directly and by
 * inheritance is counted once.
 */
const EXPECTED = {
  auth: 3, // login.feature: feature-level, 3 scenarios
  smoke: 4, // login: 1 direct; payment: feature-level over 3 scenarios
  critical: 1, // login: 1 direct
  Smoke: 1, // distinct from `smoke` — Gherkin tags are case-sensitive
  billing: 3, // payment.feature: feature-level, 3 scenarios
  'smoke-test': 1, // must not be confused with `smoke`
  lonely: 0, // declared on a feature with no scenarios
  crlf: 1,
  windows: 1,
}

async function openTagView(window: Page) {
  await window.locator('[data-testid="tags-btn"]').click()
  await expect(window.locator(BROWSER)).toBeVisible()
  await expect(window.locator('[data-testid="tag-indexing"]')).toBeHidden()
}

test.describe('Tag Management', () => {
  let ctx: AppContext
  let workspacePath: string

  test.beforeAll(async () => {
    workspacePath = await copyFixture('tags')
    ctx = await launchApp(workspacePath)
  })

  test.afterAll(async () => {
    await closeApp(ctx)
    await cleanupFixture(workspacePath)
  })

  test.beforeEach(async () => {
    const { window } = ctx
    if (!(await window.locator(BROWSER).isVisible())) {
      await openTagView(window)
    }
    await window.locator(FILTER).fill('')
  })

  test('lists every tag in the workspace', async () => {
    const { window } = ctx
    for (const name of Object.keys(EXPECTED)) {
      await expect(window.locator(tagRow(name))).toBeVisible()
    }
  })

  test('shows a correct scenario count for every tag', async () => {
    const { window } = ctx
    for (const [name, count] of Object.entries(EXPECTED)) {
      await expect(window.locator(tagCount(name))).toHaveText(String(count))
    }
  })

  test('counts a feature-level tag for every scenario in that feature', async () => {
    const { window } = ctx
    await expect(window.locator(tagCount('auth'))).toHaveText('3')
  })

  test('counts a scenario once when it carries a tag directly and by inheritance', async () => {
    const { window } = ctx
    // payment.feature declares @smoke at feature level AND on "Pay by card".
    await window.locator(tagRow('smoke')).click()
    const rows = window.locator(`${BROWSER} [data-testid^="tag-usage-"]`)
    await expect(rows).toHaveCount(4)
    await expect(rows.filter({ hasText: 'Pay by card' })).toHaveCount(1)
  })

  test('keeps tags differing only by case distinct', async () => {
    const { window } = ctx
    await expect(window.locator(tagCount('smoke'))).toHaveText('4')
    await expect(window.locator(tagCount('Smoke'))).toHaveText('1')
  })

  test('does not confuse a tag with another that has it as a prefix', async () => {
    const { window } = ctx
    await expect(window.locator(tagCount('smoke-test'))).toHaveText('1')
  })

  test('marks a tag on a feature with no scenarios as orphaned', async () => {
    const { window } = ctx
    await expect(window.locator(tagCount('lonely'))).toHaveText('0')
    await expect(window.locator(tagRow('lonely'))).toContainText('no scenarios')
  })

  test('marks direct and inherited usages distinctly', async () => {
    const { window } = ctx
    await window.locator(tagRow('smoke')).click()

    const direct = window.locator(`${BROWSER} [data-testid^="tag-origin-"]`).filter({ hasText: 'direct' })
    const inherited = window
      .locator(`${BROWSER} [data-testid^="tag-origin-"]`)
      .filter({ hasText: 'inherited' })

    expect(await direct.count()).toBeGreaterThan(0)
    expect(await inherited.count()).toBeGreaterThan(0)
  })

  test('shows the owning feature and file for each scenario', async () => {
    const { window } = ctx
    await window.locator(tagRow('critical')).click()
    const row = window.locator(`${BROWSER} [data-testid^="tag-usage-"]`).first()
    await expect(row).toContainText('Successful login')
    await expect(row).toContainText('User login')
    await expect(row).toContainText('login.feature')
  })

  test('filters the tag list by name', async () => {
    const { window } = ctx
    await window.locator(FILTER).fill('bill')
    await expect(window.locator(tagRow('billing'))).toBeVisible()
    await expect(window.locator(tagRow('auth'))).toBeHidden()
  })

  test('switches between most-used and alphabetical order', async () => {
    const { window } = ctx
    const names = () =>
      window.locator(`${BROWSER} [data-testid^="tag-row-"] .tag-name`).allTextContents()

    await window.locator('[data-testid="tag-sort-count"]').click()
    const byCount = await names()
    await window.locator('[data-testid="tag-sort-alpha"]').click()
    const byAlpha = await names()

    expect(byAlpha).not.toEqual(byCount)
    expect(byAlpha).toEqual([...byAlpha].sort((a, b) => a.localeCompare(b)))
  })

  test('reports a feature file that could not be read', async () => {
    const { window } = ctx
    await expect(window.locator('[data-testid="tag-unparsed"]')).toContainText('broken.feature')
  })

  test('navigates to the scenario behind a usage', async () => {
    const { window } = ctx
    await window.locator(tagRow('critical')).click()
    await window.locator(`${BROWSER} [data-testid^="tag-usage-"]`).first().click()

    await expect(window.locator(BROWSER)).toBeHidden()
    await expect(window.locator('body')).toContainText('Successful login')

    await openTagView(window)
  })

  test('run is disabled for a tag no scenario carries', async () => {
    const { window } = ctx
    await window.locator(tagRow('lonely')).click()
    await expect(window.locator('[data-testid="tag-run-btn"]')).toBeDisabled()
  })

  test('runs a tag through the existing runner', async () => {
    const { window } = ctx
    await window.locator(tagRow('billing')).click()
    await expect(window.locator('[data-testid="tag-run-btn"]')).toBeEnabled()
    await window.locator('[data-testid="tag-run-btn"]').click()

    // Hands off to the runner view rather than adding a second run mechanism.
    await expect(window.locator(BROWSER)).toBeHidden()
    await expect(window.locator('body')).toContainText('Test Runner')

    await openTagView(window)
  })
})

/**
 * Bulk editing writes to the user's .feature files, so these assertions check
 * the files on disk, not just the UI.
 */
test.describe('Tag Management — bulk editing', () => {
  let ctx: AppContext
  let workspacePath: string

  const featureFile = (relative: string) =>
    path.join(workspacePath, 'features', relative)

  test.beforeAll(async () => {
    workspacePath = await copyFixture('tags')
    ctx = await launchApp(workspacePath)
    await openTagView(ctx.window)
  })

  test.afterAll(async () => {
    await closeApp(ctx)
    await cleanupFixture(workspacePath)
  })

  test('adds a tag across scenarios in two files and updates counts', async () => {
    const { window } = ctx
    const before = readFileSync(featureFile('login.feature'), 'utf-8')

    await window.locator(tagRow('smoke')).click()
    await window.locator('[data-testid="tag-select-all"]').click()
    await expect(window.locator('[data-testid="tag-selection-count"]')).toContainText('4 selected')

    await window.locator('[data-testid="tag-bulk-btn"]').click()
    await expect(window.locator('[data-testid="bulk-tag-dialog"]')).toBeVisible()

    await window.locator('[data-testid="bulk-tag-input"]').fill('release')
    await expect(window.locator('[data-testid="bulk-preview-count"]')).toHaveText('4')
    await expect(window.locator('[data-testid="bulk-preview-files"]')).toHaveText('2')

    await window.locator('[data-testid="bulk-apply"]').click()
    await expect(window.locator('[data-testid="bulk-outcome"]')).toContainText('Changed 4')
    await window.locator('[data-testid="bulk-close"]').click()

    // Counts refresh with no manual action (FR-026).
    await expect(window.locator(tagCount('release'))).toHaveText('4')

    // Only tag lines changed (FR-023): appended to the existing line, so the
    // file keeps exactly the same number of lines.
    const after = readFileSync(featureFile('login.feature'), 'utf-8')
    expect(after).toContain('@smoke @critical @release')
    expect(after.split('\n').length).toBe(before.split('\n').length)
  })

  test('rejects an invalid tag name before writing', async () => {
    const { window } = ctx
    await window.locator(tagRow('billing')).click()
    await window.locator('[data-testid="tag-select-all"]').click()
    await window.locator('[data-testid="tag-bulk-btn"]').click()

    await window.locator('[data-testid="bulk-tag-input"]').fill('two words')
    await expect(window.locator('[data-testid="bulk-tag-invalid"]')).toBeVisible()
    await expect(window.locator('[data-testid="bulk-apply"]')).toBeDisabled()

    await window.locator('[data-testid="bulk-close"]').click()
  })

  test('reports scenarios that inherit a tag as not individually removable', async () => {
    const { window } = ctx
    // @billing is declared at feature level on payment.feature.
    await window.locator(tagRow('billing')).click()
    await window.locator('[data-testid="tag-select-all"]').click()
    await window.locator('[data-testid="tag-bulk-btn"]').click()

    await window.locator('[data-testid="bulk-op-remove"]').click()
    await window.locator('[data-testid="bulk-tag-input"]').fill('billing')

    await expect(window.locator('[data-testid="bulk-preview-blocked"]')).toContainText('inherit')
    await expect(window.locator('[data-testid="bulk-apply"]')).toBeDisabled()

    await window.locator('[data-testid="bulk-close"]').click()
  })

  test('add then remove restores the file byte-for-byte', async () => {
    const { window } = ctx
    // Round-trip on a fresh tag. Note this must be add-then-remove: removing an
    // existing tag and re-adding it legitimately moves it to the end of its tag
    // line, so only this direction can assert exact equality.
    const original = readFileSync(featureFile('login.feature'), 'utf-8')

    await window.locator(tagRow('auth')).click()
    await window.locator('[data-testid="tag-select-all"]').click()

    // Add — covers both the "append to existing tag line" and "insert a new tag
    // line" paths, since login.feature has scenarios of both kinds.
    await window.locator('[data-testid="tag-bulk-btn"]').click()
    await window.locator('[data-testid="bulk-tag-input"]').fill('roundtrip')
    await window.locator('[data-testid="bulk-apply"]').click()
    await expect(window.locator('[data-testid="bulk-outcome"]')).toContainText('Changed 3')
    await window.locator('[data-testid="bulk-close"]').click()

    const tagged = readFileSync(featureFile('login.feature'), 'utf-8')
    expect(tagged).not.toBe(original)
    expect(tagged).toContain('@roundtrip')

    // Remove it again.
    await window.locator(tagRow('roundtrip')).click()
    await window.locator('[data-testid="tag-select-all"]').click()
    await window.locator('[data-testid="tag-bulk-btn"]').click()
    await window.locator('[data-testid="bulk-op-remove"]').click()
    await window.locator('[data-testid="bulk-tag-input"]').fill('roundtrip')
    await window.locator('[data-testid="bulk-apply"]').click()
    await window.locator('[data-testid="bulk-close"]').click()

    expect(readFileSync(featureFile('login.feature'), 'utf-8')).toBe(original)
  })
})
