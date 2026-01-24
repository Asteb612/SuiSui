import { createBdd } from 'playwright-bdd';

const { Given, When, Then } = createBdd();

// Navigation steps
Given('I am on the {string} page', async ({ page }, pageName: string) => {
  await page.goto(`/${pageName}`);
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

// Assertion steps
Then('I should see {string}', async ({ page }, text: string) => {
  await page.locator(`text=${text}`).waitFor({ state: 'visible' });
});

Then('I should not see {string}', async ({ page }, text: string) => {
  await page.locator(`text=${text}`).waitFor({ state: 'hidden' });
});

Then('the URL should contain {string}', async ({ page }, urlPart: string) => {
  await page.waitForURL(`**/*${urlPart}*`);
});

Then('the element {string} should be visible', async ({ page }, selector: string) => {
  await page.locator(selector).waitFor({ state: 'visible' });
});
