import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { launchApp, closeApp, type AppContext } from '../helpers/app'
import { copyFixture, cleanupFixture } from '../helpers/fixtures'
import { SEL } from '../helpers/selectors'
import { openScenarioInEditMode, startRecorder, recorderFixture } from '../helpers/recorder'

/**
 * US1 — record a browser session → editable cards → insert into the scenario.
 * Drives the whole pipeline through the injected FakeRecorderAdapter replaying
 * a checked-in NDJSON fixture (no real browser — Constitution III).
 */
test.describe('Recorder: record and insert', () => {
  let ctx: AppContext
  let workspacePath: string

  test.beforeAll(async () => {
    workspacePath = await copyFixture('with-features')
    ctx = await launchApp(workspacePath, { RECORDER_FIXTURE: recorderFixture('session.ndjson') })
  })

  test.afterAll(async () => {
    await closeApp(ctx)
    await cleanupFixture(workspacePath)
  })

  test('records readable cards and inserts matched steps into the scenario', async () => {
    const { window } = ctx
    await openScenarioInEditMode(window)
    await startRecorder(window)

    // Readable action cards for the login flow.
    const cards = window.locator(SEL.recordedAction)
    await expect(cards).toHaveCount(4)
    await expect(window.locator(SEL.recorderActions)).toContainText('Open "/login"')
    await expect(cards.filter({ hasText: 'Email field' })).toBeVisible()
    await expect(cards.filter({ hasText: 'Sign in' })).toBeVisible()

    // Confirm → steps are appended to the current scenario.
    await expect(window.locator(SEL.recorderConfirm)).toBeEnabled()
    await window.locator(SEL.recorderConfirm).click()

    // Save and verify the recorded steps landed in the .feature file (SC-005).
    await window.locator(SEL.saveBtn).click()
    await expect(window.locator(SEL.saveBtn)).not.toBeVisible()

    const content = fs.readFileSync(path.join(workspacePath, 'features', 'login.feature'), 'utf-8')
    expect(content).toContain('login-submit')
    expect(content).toContain('arthur@example.com')
    expect(content).toContain('I am on the "/login" page')
  })
})
