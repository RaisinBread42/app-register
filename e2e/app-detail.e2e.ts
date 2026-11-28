import {expect, test} from '@playwright/test';
import {expectNoAxeViolations} from './helpers';

const openPortal = async (page: import('@playwright/test').Page) => {
  await page.goto('/applications');
  await page.getByRole('link', {name: 'Northwind Portal'}).first().click();
  await expect(page.getByRole('heading', {level: 1, name: 'Northwind Portal'})).toBeVisible();
};

test('the detail page leads with health drivers: header facts, open notices, top three deductions, in-house fields', async ({page}) => {
  await openPortal(page);
  for (const label of ['Owner', 'Backup owner', 'Criticality', 'Environments', 'Last checked']) {
    await expect(page.getByText(label, {exact: true}).first()).toBeVisible();
  }
  await expect(page.getByRole('heading', {name: 'Needs attention'})).toBeVisible();
  await expect(page.getByRole('link', {name: 'Review notice'}).first()).toBeVisible();
  await expect(page.getByText('Where it runs')).toBeVisible();
  await expect(page.getByText('Azure App Service, UK South')).toBeVisible();

  await expect(page.getByText(/^−\d+ pts$/)).toHaveCount(3);
  await page.getByRole('button', {name: 'See scoring details'}).click();
  expect(await page.getByText(/^−\d+ pts$/).count()).toBeGreaterThan(3);
  await expectNoAxeViolations(page);
});

test('Review notice opens the notice in the inbox; the Activity tab then shows what was done', async ({page}) => {
  await openPortal(page);
  await page.getByRole('link', {name: 'Review notice'}).first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', {name: 'Mark reviewing'}).click();
  await expect(drawer.getByText(/^Reviewing/)).toBeVisible();

  await openPortal(page);
  await page.getByRole('tab', {name: 'Activity'}).click();
  await expect(page).toHaveURL(/tab=activity/);
  await expect(page.getByText(/changed the status of “.+” on .+ \(now Reviewing\)/).first()).toBeVisible();
});
