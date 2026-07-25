import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { launchApp, closeApp, type AppContext } from '../helpers/app'
import { copyFixture, cleanupFixture } from '../helpers/fixtures'
import { SEL } from '../helpers/selectors'
import { recorderFixture } from '../helpers/recorder'

/**
 * Recording from the header Record button with no scenario open: confirming asks
 * for a name and creates a brand-new scenario from the recorded steps, saved and
 * displayed. Drives the FakeRecorderAdapter (no real browser — Constitution III).
 */
test.describe('Recorder: create a new scenario', () => {
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

  test('records via the header button and creates a named scenario', async () => {
    const { window } = ctx
    // No feature open → the global Record entry point.
    await window.locator(SEL.recordBtnGlobal).click()
    await expect(window.locator(SEL.recorderStart)).toBeVisible()
    await window.locator(SEL.recorderStart).click()
    await expect(window.locator(SEL.recordedAction).first()).toBeVisible()

    // Confirm → the button reads "Create scenario" and prompts for a name.
    const confirm = window.locator(SEL.recorderConfirm)
    await expect(confirm).toBeEnabled()
    await expect(confirm).toHaveText(/Create scenario/)
    await confirm.click()

    await expect(window.locator(SEL.newScenarioNameInput)).toBeVisible()
    await window.locator(SEL.newScenarioNameInput).fill('Recorded Login')
    await window.locator(SEL.createScenarioButton).click()

    // The new scenario is displayed and written to disk with the recorded steps.
    await expect(window.locator(SEL.scenarioBuilder)).toBeVisible()
    const featurePath = path.join(workspacePath, 'features', 'recorded-login.feature')
    await expect.poll(() => fs.existsSync(featurePath)).toBe(true)
    const content = fs.readFileSync(featurePath, 'utf-8')
    expect(content).toContain('Feature: Recorded Login')
    expect(content).toContain('login-submit')
  })
})
