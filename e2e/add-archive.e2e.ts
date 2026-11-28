import {expect, test} from '@playwright/test';
import {expectNoAxeViolations} from './helpers';

/** [24] Add with only the essentials, see the setup checklist, archive with Undo, unarchive from the Archived list. */
test('adding by keyboard lands on the new app with its setup checklist and no score; archive offers Undo; Archived lists it with Unarchive', async ({page}) => {
  const name = `Tally Board ${Date.now()}`;
  await page.goto('/applications');
  await page.getByRole('button', {name: '+ Add application'}).click();
  const dialog = page.getByRole('dialog');
  await expectNoAxeViolations(page);

  // Keyboard only: name (focused), type (keep SaaS), criticality, owner, then Add.
  await page.keyboard.type(name);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('combobox', {name: /^Criticality/})).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('option', {name: 'Medium'}).press('Enter');
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', {name: /^Owner/})).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.type('Avery');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', {name: 'Add application'}).focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', {level: 1, name})).toBeVisible();
  const checklist = page.getByRole('heading', {name: 'Set up monitoring'}).locator('xpath=ancestor::*[3]');
  for (const item of ['Supplier and contract dates', 'Where it runs', 'First check by a source']) {
    await expect(checklist.getByText(item, {exact: true})).toBeVisible();
  }
  await expect(page.getByText('Insufficient data').first()).toBeVisible();
  await expect(page.getByText('100', {exact: true})).toHaveCount(0);
  await expectNoAxeViolations(page);

  await page.getByRole('button', {name: 'Archive'}).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('alerts stop');
  await expect(confirm).toContainText('leaves the applications list');
  await confirm.getByRole('button', {name: 'Archive application'}).click();
  await expect(page).toHaveURL(/\/applications$/);
  await expect(page.getByRole('link', {name})).toHaveCount(0);
  await page.getByRole('region', {name: 'Notifications'}).getByRole('button', {name: 'Undo'}).click();
  await expect(page.getByText(`${name} is active again`).first()).toBeVisible();
  await expect(page.getByRole('link', {name}).first()).toBeVisible();

  // The archive toast keeps its Undo until dismissed (WCAG 2.2.1); close it before going on.
  await page.getByRole('region', {name: 'Notifications'}).getByRole('button', {name: /dismiss|close/i}).first().click();

  // Archive again, then bring it back from the Archived list.
  await page.getByRole('link', {name}).first().click();
  await page.getByRole('button', {name: 'Archive'}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Archive application'}).click();
  await expect(page).toHaveURL(/\/applications$/);
  await page.getByRole('combobox', {name: 'Status'}).click();
  await page.getByRole('option', {name: /^Archived/}).click();
  await expect(page).toHaveURL(/state=archived/);
  const row = page.locator('tbody tr').filter({hasText: name});
  await row.getByRole('button', {name: 'Unarchive'}).click();
  await expect(page.getByText(`${name} is active again`).first()).toBeVisible();
  await expect(row).toHaveCount(0);
});
