import { expect, type Page } from '@playwright/test'
import path from 'node:path'
import { SEL } from './selectors'

/** Absolute path to a checked-in recorder NDJSON fixture. */
export function recorderFixture(name: string): string {
  return path.resolve(__dirname, '..', 'fixtures', 'recorder', name)
}

/** Select a feature and switch the scenario builder into edit mode. */
export async function openScenarioInEditMode(window: Page, feature = 'login.feature'): Promise<void> {
  await window.locator(`${SEL.featureTreeFile}[data-path="${feature}"]`).click()
  await expect(window.locator(SEL.scenarioBuilder)).toBeVisible()
  await window.locator(SEL.editModeBtn).click()
  await expect(window.locator(SEL.doneBtn)).toBeVisible()
}

/** Open the recorder dialog, start recording, and wait for the fixture to replay. */
export async function startRecorder(window: Page): Promise<void> {
  await window.locator(SEL.recordBtn).click()
  await expect(window.locator(SEL.recorderStart)).toBeVisible()
  await window.locator(SEL.recorderStart).click()
  // The fake adapter replays the fixture → action cards appear.
  await expect(window.locator(SEL.recordedAction).first()).toBeVisible()
}
