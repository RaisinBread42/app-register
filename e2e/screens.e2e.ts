import {expect, test} from '@playwright/test';
import {captureAtAllWidths, expectNoAxeViolations, expectNoHorizontalScroll} from './helpers';

/** Every primary screen: loads, passes axe, has no sideways scroll on a phone, and is captured at three widths. */
const SCREENS = [
  {name: 'overview', path: '/', heading: 'Overview'},
  {name: 'applications', path: '/applications', heading: 'Applications'},
  {name: 'sources', path: '/sources', heading: 'Sources'},
  {name: 'settings', path: '/settings', heading: 'Settings'},
  {name: 'people', path: '/people', heading: 'People'},
] as const;

for (const screen of SCREENS) {
  test(`${screen.name}: loads, is accessible and fits every width`, async ({page}) => {
    await page.goto(screen.path);
    await expect(page.getByRole('heading', {level: 1, name: screen.heading})).toBeVisible();
    await expectNoAxeViolations(page);
    await page.setViewportSize({width: 360, height: 780});
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
    await captureAtAllWidths(page, screen.name);
  });
}

test('application detail: loads, is accessible and fits every width', async ({page}) => {
  await page.goto('/applications');
  await page.getByRole('link', {name: 'Northwind Portal'}).first().click();
  await expect(page.getByRole('heading', {level: 1, name: 'Northwind Portal'})).toBeVisible();
  await expectNoAxeViolations(page);
  await page.setViewportSize({width: 360, height: 780});
  await expectNoHorizontalScroll(page);
  await expectNoAxeViolations(page);
  await captureAtAllWidths(page, 'application-detail');
});
