import {writeFileSync} from 'node:fs';
import {expect, test} from '@playwright/test';
import {E2E} from './e2e-config';

test('Journey A: the Overview leads with what needs attention; acting on the top item keeps it visible with its new status', async ({page}) => {
  const started = Date.now();
  await page.goto('/');
  await expect(page.getByRole('heading', {level: 1, name: 'Overview'})).toBeVisible();
  const loadMs = await page.evaluate(() => {
    const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    return Math.round(navigation.domContentLoadedEventEnd);
  });
  writeFileSync(`${E2E.artifactsDir}/overview-load.json`, JSON.stringify({domContentLoadedMs: loadMs, wallMs: Date.now() - started}));

  await expect(page.getByText(/Last successful check|No source has been checked yet/)).toBeVisible();
  await expect(page.getByText(/^\d+ needs? attention$/)).toBeVisible();
  // No metric-card wall and no distribution chart (spec §4.1, §7).
  await expect(page.getByText('Health distribution')).toHaveCount(0);
  await expect(page.getByText('Average health score')).toHaveCount(0);

  const counts = page.getByText(/^(none|\d+) critical/).first();
  const countsBefore = await counts.textContent();
  const queue = page.getByRole('heading', {name: 'Needs attention'}).locator('xpath=ancestor::*[3]');
  const top = queue.getByRole('link').filter({hasNotText: /All notices|snoozed/}).first();
  const title = await top.textContent();
  await top.click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('heading', {level: 2, name: title!})).toBeVisible();
  await drawer.getByRole('button', {name: 'Mark reviewing'}).click();
  await expect(drawer.getByText(/^Reviewing/)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await page.getByRole('navigation').first().getByRole('link', {name: /^Overview$/}).click();
  // The acted-on item is still listed, with its new status, and the in-review count moved.
  await expect(page.getByRole('link', {name: title!}).locator('xpath=..')).toContainText('· Reviewing');
  await expect(counts).not.toHaveText(countsBefore!);
  expect(loadMs).toBeLessThan(5000);
});
