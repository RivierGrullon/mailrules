import { expect, test } from '@playwright/test';
import { createEmailValidator, type EmailValidationResult } from 'mailrules';

test('rules, suggestions, copied examples and real React form', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await expect(
    page.getByRole('heading', { name: 'Give your email rules a test run.' }),
  ).toBeVisible();
  const email = page.getByLabel('Email to check', { exact: true });
  await email.fill('person@mailinator.com');
  await expect(page.locator('.decision')).toContainText('Rejected');
  await expect(page.locator('.result-json')).toContainText('disposable');
  await page.getByText('Rules for individual addresses', { exact: true }).click();
  await page.getByLabel('Allowlisted email addresses').fill('person@mailinator.com');
  await expect(page.locator('.decision')).toContainText('Accepted');
  await page.getByLabel('Blocked domains').fill('mailinator.com');
  await expect(page.locator('.decision')).toContainText('Rejected');
  await expect(page.locator('.result-json')).toContainText('blocked');
  await page.getByRole('button', { name: 'Classifications', exact: true }).click();
  await email.fill('support@gmail.com');
  await expect(page.locator('.result-json')).toContainText('"roleAccount": true');
  await expect(page.locator('.result-json')).toContainText('"freeProvider": true');
  await expect(page.locator('.decision')).toContainText('Accepted');
  await page.getByLabel('Role addresses').selectOption('block');
  await expect(page.locator('.decision')).toContainText('Rejected');
  await page.getByRole('button', { name: 'Signup defaults', exact: true }).click();
  await email.fill('User@gmial.com');
  await expect(page.getByRole('button', { name: 'Use User@gmail.com' })).toBeVisible();
  await page.getByRole('button', { name: 'Use User@gmail.com' }).click();
  await expect(email).toHaveValue('User@gmail.com');
  await page.getByRole('button', { name: 'Copy code', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('createEmailValidator');
  expect(clipboard).toContain('User@gmail.com');
  await page.getByRole('button', { name: 'Zod + React', exact: true }).click();
  await expect(page.locator('.code-example')).toContainText('zodResolver');
  await page.getByLabel('Signup email', { exact: true }).fill('not-an-email');
  await page.getByRole('button', { name: 'Try signup', exact: true }).click();
  await expect(page.locator('#signup-error')).toContainText('Enter a valid email');
  await page.getByLabel('Signup email', { exact: true }).fill(' Jane@EXAMPLE.COM ');
  await page.getByRole('button', { name: 'Try signup', exact: true }).click();
  await expect(page.locator('.form-success')).toContainText('Jane@example.com');
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('bad configuration, empty state and local-only validation', async ({ page }) => {
  await page.goto('./');
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.getByLabel('Email to check', { exact: true }).fill('');
  await expect(page.locator('.decision')).toContainText('Enter an email');
  await page.getByLabel('Blocked domains').fill('not a domain');
  await expect(page.getByRole('alert').filter({ hasText: 'blocklist' })).toBeVisible();
  await page.getByLabel('Blocked domains').fill('');
  await page.getByLabel('Email to check', { exact: true }).fill('person@example.com');
  await expect(page.locator('.decision')).toContainText('Accepted');
  expect(requests.filter((url) => !url.includes('127.0.0.1'))).toEqual([]);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test('copyable custom rules and form feedback reflect the current policy', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Warn about plus tags').check();
  await page.getByLabel('Email to check', { exact: true }).fill('User+tag@example.com');
  const code = await page.locator('.code-example').innerText();
  const results: EmailValidationResult[] = [];
  new Function(
    'createEmailValidator',
    'console',
    code.replace("import { createEmailValidator } from 'mailrules';", ''),
  )(createEmailValidator, { log: (r: EmailValidationResult) => results.push(r) });
  expect(results[0].email).toBe('User+tag@example.com');
  expect(results[0].warnings?.[0].code).toBe('plus_tag');
  await page.getByLabel('Signup email', { exact: true }).fill('jane@example.com');
  await page.getByRole('button', { name: 'Try signup', exact: true }).click();
  await expect(page.locator('.form-success')).toBeVisible();
  await page.getByLabel('Blocked domains').fill('example.com');
  await expect(page.locator('.form-success')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try signup', exact: true }).click();
  await expect(page.locator('#signup-error')).toContainText('not accepted');
  await page.getByLabel('Blocked domains').fill('');
  await page.getByText('Rules for individual addresses', { exact: true }).click();
  await page.getByLabel('Allowlisted email addresses').fill('"sales,team"@mailinator.com');
  await page.getByLabel('Email to check', { exact: true }).fill('"sales,team"@mailinator.com');
  await expect(page.locator('.decision')).toContainText('Accepted');
});
