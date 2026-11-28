import {expect, test} from '@playwright/test';
import {expectNoAxeViolations} from './helpers';

test('Journey C: open a notice, see app, reason and source, snooze it with a reason, and the list updates', async ({page}) => {
  await page.goto('/notices');
  await expect(page.getByRole('heading', {level: 1, name: 'Notices'})).toBeVisible();
  const first = page.locator('a[data-inbox-row]').first();
  await expect(first).toHaveText('Demo advisory: request smuggling in the router');

  await first.click();
  await expect(page).toHaveURL(/notice=/);
  const drawer = page.getByRole('dialog');
  for (const section of ['What happened', 'Which application', 'Why we think so', 'What to do', 'Source']) {
    await expect(drawer.getByRole('heading', {name: section})).toBeVisible();
  }
  await expect(drawer.getByRole('link', {name: 'Northwind Portal'})).toBeVisible();
  await expect(drawer.getByText('High confidence')).toBeVisible();
  await expectNoAxeViolations(page);

  await drawer.getByRole('button', {name: 'Snooze'}).click();
  await drawer.getByRole('button', {name: 'Snooze'}).click();
  await expect(drawer.getByText(/date after today/)).toBeVisible();
  await drawer.getByLabel('Snooze until').fill('2099-01-01');
  await drawer.getByRole('textbox', {name: 'Reason'}).fill('Waiting for the vendor fix');
  await drawer.getByRole('button', {name: 'Snooze'}).click();
  await expect(page.getByText(/^Snoozed:/).first()).toBeVisible();

  await page.goBack();
  await expect(page).not.toHaveURL(/notice=/);
  await expect(page.locator('a[data-inbox-row]', {hasText: 'request smuggling'})).toHaveCount(0);
  await page.getByRole('combobox', {name: 'Status'}).click();
  await page.getByRole('option', {name: 'Snoozed'}).click();
  await expect(page.locator('a[data-inbox-row]', {hasText: 'request smuggling'})).toHaveCount(1);
});

test('mark reviewing confirms with Undo, and Undo brings the notice back to new', async ({page}) => {
  await page.goto('/notices');
  await page.locator('a[data-inbox-row]', {hasText: 'prototype pollution'}).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', {name: 'Mark reviewing'}).click();
  await expect(drawer.getByText(/^Reviewing/)).toBeVisible();
  await page.getByRole('button', {name: 'Undo'}).click();
  await expect(drawer.getByText(/^New/)).toBeVisible();
});

test('the inbox works by keyboard: j moves between notices, Enter opens, ? lists the shortcuts', async ({page}) => {
  await page.goto('/notices');
  await page.locator('body').click();
  await page.keyboard.press('j');
  await expect(page.locator('a[data-inbox-row]').first()).toBeFocused();
  await page.keyboard.press('j');
  await expect(page.locator('a[data-inbox-row]').nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('?');
  await expect(page.getByRole('heading', {name: 'Keyboard shortcuts'})).toBeVisible();
});

test('a deep link to a notice opens its drawer, and the side nav shows the open count as text', async ({page}) => {
  await page.goto('/notices');
  const href = await page.locator('a[data-inbox-row]').first().getAttribute('href');
  await page.goto(href!);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('navigation').first().getByRole('link', {name: /^Notices \d+$/})).toBeVisible();
});
