import {expect, test} from '@playwright/test';
import {captureAtAllWidths, expectNoAxeViolations, expectNoHorizontalScroll} from './helpers';

/** [49] The Governance Board: summary first, figures that drill down to the existing lists, every width. */

test('the board opens from the nav with the as-of time, an executive summary first, and every section', async ({page}) => {
  await page.goto('/');
  await page.getByRole('navigation').first().getByRole('link', {name: /^Governance$/}).click();
  await expect(page.getByRole('heading', {level: 1, name: 'Governance'})).toBeVisible();
  await expect(page.getByText(/^As of /)).toBeVisible();
  const headings = await page.getByRole('heading', {level: 2}).allInnerTexts();
  expect(headings.slice(0, 5)).toEqual(['Executive summary', 'Portfolio health', 'Outstanding risk', 'Ownership and accountability', 'Overdue and upcoming']);
  await expect(page.getByText(/notices? (is|are) open|No notices are open/)).toBeVisible();
  await expectNoAxeViolations(page);
});

test('a figure drills down to the filtered list in one click (open security notices → the Notices list filtered by kind)', async ({page}) => {
  await page.goto('/governance');
  const security = page.getByRole('row').filter({hasText: 'Security advisory'});
  const open = security.getByRole('link').first();
  const count = Number(await open.innerText());
  await open.click();
  await expect(page).toHaveURL(/\/notices\?category=security/);
  await expect(page.locator('a[data-inbox-row]')).toHaveCount(count);
});

test('a severity figure and an owner drill down to the filtered lists', async ({page}) => {
  await page.goto('/governance');
  const severities = page.getByRole('heading', {name: 'Open notices by severity'}).locator('xpath=..');
  const critical = severities.getByRole('link', {name: /^\d+ Critical$/});
  const count = Number(await critical.innerText());
  await critical.click();
  await expect(page).toHaveURL(/\/notices\?severity=critical/);
  await expect(page.locator('a[data-inbox-row]')).toHaveCount(count);

  await page.goto('/governance');
  const owners = page.getByRole('heading', {name: 'Open items by owner'}).locator('xpath=..');
  const owner = owners.getByRole('link').first();
  const name = await owner.innerText();
  await owner.click();
  await expect(page).toHaveURL(/\/applications\?owner=/);
  await expect(page.getByRole('row').nth(1)).toContainText(name);
});

test('a portfolio figure drills down to the filtered applications list', async ({page}) => {
  await page.goto('/governance');
  await page.getByText('Insufficient data', {exact: true}).locator('xpath=..').getByRole('link').click();
  await expect(page).toHaveURL(/\/applications\?health=not_monitored/);
  await expect(page.getByRole('heading', {level: 1, name: 'Applications'})).toBeVisible();
});

test('at 360, 768 and 1280 px the board fits without sideways scroll and passes axe', async ({page}) => {
  await page.setViewportSize({width: 360, height: 780});
  await page.goto('/governance');
  await expect(page.getByRole('heading', {level: 1, name: 'Governance'})).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoAxeViolations(page);
  await captureAtAllWidths(page, 'governance');
});
