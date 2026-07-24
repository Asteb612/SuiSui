import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';

const { Given, When, Then } = createBdd();

// Navigation steps
Given('I am on the {string} page', async ({ page }, pageName: string) => {
  const trimmed = pageName.trim();
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    await page.goto(trimmed);
    return;
  }
  if (trimmed.startsWith('//')) {
    await page.goto(`https:${trimmed}`);
    return;
  }
  const target =
    trimmed === '' || trimmed === '/'
      ? '/'
      : trimmed.startsWith('/')
        ? trimmed
        : `/${trimmed}`;
  await page.goto(target);
});

Given('I am logged in as {string}', async ({ page }, username: string) => {
  // Override this step with your actual login implementation
  await page.goto('/login');
  await page.fill('[name="username"], [name="email"], #username, #email', username);
  await page.fill('[name="password"], #password', 'password');
  await page.click('[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
});

// Interaction steps
When('I click on {string}', async ({ page }, element: string) => {
  await page.click(element);
});

When('I fill {string} with {string}', async ({ page }, field: string, value: string) => {
  await page.fill(field, value);
});

When('I select {string} from {string}', async ({ page }, option: string, dropdown: string) => {
  await page.selectOption(dropdown, option);
});

When('I wait for {int} seconds', async ({ page }, seconds: number) => {
  await page.waitForTimeout(seconds * 1000);
});

When('I fill in the form with the following data (Field, Value):', async ({ page }, table) => {
  for (const row of table.rows()) {
    await page.fill(row[0], row[1]);
  }
});

When('I check {string}', async ({ page }, element: string) => {
  await page.check(element);
});

When('I uncheck {string}', async ({ page }, element: string) => {
  await page.uncheck(element);
});

When('I press {string}', async ({ page }, key: string) => {
  await page.keyboard.press(key);
});

When('I upload {string} to {string}', async ({ page }, file: string, element: string) => {
  await page.setInputFiles(element, file);
});

// Assertion steps
Then('I should see {string}', async ({ page }, text: string) => {
  await page.locator(`text=${text}`).waitFor({ state: 'visible' });
});

Then('I should not see {string}', async ({ page }, text: string) => {
  await page.locator(`text=${text}`).waitFor({ state: 'hidden' });
});

Then('the URL should contain {string}', async ({ page }, urlPart: string) => {
  await expect(page).toHaveURL(new RegExp(urlPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

Then('the element {string} should be visible', async ({ page }, selector: string) => {
  await expect(page.locator(selector)).toBeVisible();
});

Then('the element {string} should be hidden', async ({ page }, selector: string) => {
  await expect(page.locator(selector)).toBeHidden();
});

Then('the element {string} should contain the text {string}', async ({ page }, selector: string, text: string) => {
  await expect(page.locator(selector)).toContainText(text);
});

Then('the field {string} should have the value {string}', async ({ page }, selector: string, value: string) => {
  await expect(page.locator(selector)).toHaveValue(value);
});

Then('the checkbox {string} should be checked', async ({ page }, selector: string) => {
  await expect(page.locator(selector)).toBeChecked();
});

Then('the element {string} should be enabled', async ({ page }, selector: string) => {
  await expect(page.locator(selector)).toBeEnabled();
});

Then('there should be {int} {string} elements', async ({ page }, count: number, selector: string) => {
  await expect(page.locator(selector)).toHaveCount(count);
});

Then('the page title should contain {string}', async ({ page }, title: string) => {
  await expect(page).toHaveTitle(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
