import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { launchApp, closeApp, type AppContext } from '../helpers/app'
import { copyFixture, cleanupFixture } from '../helpers/fixtures'
import { SEL } from '../helpers/selectors'
import { openScenarioInEditMode, startRecorder, recorderFixture } from '../helpers/recorder'

/**
 * US3 — a recorded password is masked and inserted as a secret reference,
 * never as clear text (SC-004).
 */
test.describe('Recorder: sensitive data protection', () => {
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

  test('masks the password and inserts a secret reference', async () => {
    const { window } = ctx
    await openScenarioInEditMode(window)
    await startRecorder(window)

    // The password card shows a protected value + a secret chip.
    const passwordCard = window.locator(SEL.recordedAction).filter({ hasText: 'protected value' })
    await expect(passwordCard).toBeVisible()
    await expect(passwordCard.locator(SEL.secretChip)).toContainText('${PASSWORD}')

    await window.locator(SEL.recorderConfirm).click()

    // Save → only the reference is written to the .feature, never a typed value (SC-004).
    await window.locator(SEL.saveBtn).click()
    await expect(window.locator(SEL.saveBtn)).not.toBeVisible()

    const content = fs.readFileSync(path.join(workspacePath, 'features', 'login.feature'), 'utf-8')
    expect(content).toContain('${PASSWORD}')
  })
})
