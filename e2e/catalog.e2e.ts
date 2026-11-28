import {randomUUID} from 'node:crypto';
import {expect, test} from '@playwright/test';
import {captureAtAllWidths, expectNoAxeViolations, expectNoHorizontalScroll} from './helpers';

const API = {authorization: `Bearer ${process.env.APP_REGISTER_API_KEY}`};
const rows = (page: import('@playwright/test').Page) => page.locator('tbody tr');

test('AC1/AC2: rows show type, owner, criticality, health with a word and the highest active issue; the most severe issue comes first', async ({page}) => {
  await page.goto('/applications');
  for (const header of ['Application', 'Type', 'Owner', 'Criticality', 'Health', 'Highest active issue', 'Next date']) {
    await expect(page.getByRole('columnheader', {name: header})).toBeVisible();
  }
  // Seed: Northwind Portal has the only critical open notice and is critical itself.
  const top = rows(page).first();
  await expect(top).toContainText('Northwind Portal');
  await expect(top).toContainText('Critical');
  await expect(top.getByRole('link', {name: /request smuggling/})).toBeVisible();
  // No pending pills, and an app with nothing checked says so instead of looking healthy.
  await expect(page.getByText('Coming soon', {exact: true})).toHaveCount(0);
  await expect(rows(page).filter({hasText: 'Room Booker'})).toContainText('Not monitored');
  await expectNoAxeViolations(page);
});

test('AC3: criticality, owner, health and open-notice filters live in the URL and survive opening an app and coming back', async ({page}) => {
  await page.goto('/applications');
  await page.getByRole('combobox', {name: 'Criticality'}).click();
  await page.getByRole('option', {name: 'Critical', exact: true}).click();
  await expect(page).toHaveURL(/criticality=critical/);
  await page.getByRole('combobox', {name: 'Notices'}).click();
  await page.getByRole('option', {name: 'Open notices'}).click();
  await expect(page).toHaveURL(/open_notices=1/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Northwind Portal');

  await page.getByRole('link', {name: 'Northwind Portal'}).first().click();
  await expect(page.getByRole('heading', {level: 1, name: 'Northwind Portal'})).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/criticality=critical/);
  await expect(page).toHaveURL(/open_notices=1/);
  await expect(rows(page)).toHaveCount(1);
});

test('AC5: a filter with no match explains it and Clear filters brings every application back', async ({page}) => {
  await page.goto('/applications?q=zzz-no-such-app');
  await expect(page.getByText('No applications match these filters')).toBeVisible();
  await page.getByRole('button', {name: 'Clear filters'}).click();
  await expect(page).toHaveURL(/\/applications$/);
  await expect(rows(page).first()).toContainText('Northwind Portal');
});

test('AC6: at 360 px there is no page-wide sideways scroll and a long name wraps with the full name still available', async ({page, request}) => {
  const name = `Regional Distribution Centre Inventory Reconciliation And Forecasting Workbench ${Date.now()}`;
  const {people} = (await (await request.get('/api/people', {headers: API})).json()) as {people: {id: string; status: string}[]};
  const owner = people.find((person) => person.status === 'active')!;
  const created = await request.post('/api/apps', {
    headers: {...API, 'idempotency-key': randomUUID()},
    data: {name, kind: 'in_house', ownerId: owner.id, criticality: 'low'},
  });
  expect(created.ok(), await created.text()).toBe(true);

  await page.setViewportSize({width: 360, height: 780});
  await page.goto(`/applications?q=${encodeURIComponent('Regional Distribution')}`);
  await expect(page.getByRole('link', {name})).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoAxeViolations(page);
  await captureAtAllWidths(page, 'catalog-long-name');
  await page.goto('/applications?q=zzz-no-such-app');
  await captureAtAllWidths(page, 'catalog-no-results');
});
