import {expect, test} from '@playwright/test';

test('primary navigation is Overview, Applications, Notices and Settings, reachable by keyboard with the current page marked', async ({page}) => {
  await page.goto('/');
  const nav = page.getByRole('navigation').first();
  for (const name of ['Overview', 'Applications', 'Notices', 'Settings']) {
    await expect(nav.getByRole('link', {name, exact: true})).toBeVisible();
  }
  await expect(nav.getByRole('link', {name: 'Sources', exact: true})).toHaveCount(0);
  await expect(nav.getByRole('link', {name: 'People', exact: true})).toHaveCount(0);

  const notices = nav.getByRole('link', {name: 'Notices', exact: true});
  await notices.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', {level: 1, name: 'Notices'})).toBeVisible();
  await expect(nav.getByRole('link', {name: 'Notices', exact: true})).toHaveAttribute('aria-current', 'page');
});

test('old Sources and People links land in Settings', async ({page}) => {
  await page.goto('/sources');
  await expect(page.getByRole('tab', {name: 'Monitoring sources', selected: true})).toBeVisible();
  await page.goto('/people');
  await expect(page.getByRole('tab', {name: 'People', selected: true})).toBeVisible();
  await expect(page.getByRole('cell', {name: 'Avery Quinn'})).toBeVisible();
});

test('an unknown page or application shows the branded not-found page with a way back', async ({page}) => {
  for (const path of ['/no-such-page', '/applications/00000000-0000-4000-8000-000000000000']) {
    await page.goto(path);
    await expect(page.getByText('This page could not be found')).toBeVisible();
    await page.getByRole('link', {name: 'Back to applications'}).click();
    await expect(page.getByRole('heading', {level: 1, name: 'Applications'})).toBeVisible();
  }
});

test('search and filters survive opening an application and coming back', async ({page}) => {
  await page.goto('/applications');
  await page.getByRole('textbox', {name: 'Search applications'}).last().fill('ledger');
  await expect(page).toHaveURL(/q=ledger/);
  await page.getByRole('link', {name: 'Ledgerline'}).first().click();
  await expect(page.getByRole('heading', {level: 1, name: 'Ledgerline'})).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('textbox', {name: 'Search applications'}).last()).toHaveValue('ledger');
  await expect(page.getByRole('link', {name: 'Brightdesk'})).toHaveCount(0);
});

test('the open tab of an application is in the URL and survives a reload', async ({page}) => {
  await page.goto('/applications');
  await page.getByRole('link', {name: 'Northwind Portal'}).first().click();
  await page.getByRole('tab', {name: 'Dependencies'}).click();
  await expect(page).toHaveURL(/tab=dependencies/);
  await page.reload();
  await expect(page.getByRole('tab', {name: 'Dependencies', selected: true})).toBeVisible();
});
