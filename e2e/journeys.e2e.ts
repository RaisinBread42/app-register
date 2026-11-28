import {expect, test} from '@playwright/test';

test('daily check-in starter: Overview → an application → back returns to the same list', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', {level: 1, name: 'Overview'})).toBeVisible();

  await page.getByRole('link', {name: 'Applications', exact: true}).first().click();
  await expect(page.getByRole('heading', {level: 1, name: 'Applications'})).toBeVisible();
  const rowsBefore = await page.getByRole('row').count();

  await page.getByRole('link', {name: 'Ledgerline'}).first().click();
  await expect(page.getByRole('heading', {level: 1, name: 'Ledgerline'})).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('heading', {level: 1, name: 'Applications'})).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(rowsBefore);
});
