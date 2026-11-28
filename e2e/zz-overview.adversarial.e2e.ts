/**
 * Adversarial e2e for [28] Overview, kept as regression tests. Runs after the other suites (zz-)
 * because it snoozes, reviews and archives seeded data.
 */
import {randomUUID} from 'node:crypto';
import {expect, test, type Page} from '@playwright/test';

const keyNumber = async (page: Page) => (await page.getByText(/^\d+ needs? attention$/).textContent())!;
/** The line under the urgent count: "1 critical · 2 in review · 1 snoozed". */
const attentionDetail = async (page: Page) => (await page.getByText(/^(none|\d+) critical/).first().textContent())!;

test('ADV-E1 AC4: after snoozing the top critical notice, the Overview still counts it (snoozed counted separately)', async ({page}) => {
  await page.goto('/');
  const before = await keyNumber(page);
  const queueText = await page.getByRole('heading', {name: 'Needs attention'}).locator('xpath=ancestor::*[3]').innerText();
  console.log('ADV-E1 before:', before, '| queue:', queueText.replace(/\n+/g, ' / '));

  await page.goto('/notices');
  const top = page.locator('a[data-inbox-row]').first();
  const title = (await top.textContent())!;
  await top.click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', {name: 'Snooze'}).click();
  await drawer.getByLabel('Snooze until').fill('2099-01-01');
  await drawer.getByRole('textbox', {name: 'Reason'}).fill('adversarial');
  await drawer.getByRole('button', {name: 'Snooze'}).click();
  await expect(page.getByText(/^Snoozed:/).first()).toBeVisible();

  await page.goto('/');
  const after = await keyNumber(page);
  const body = await page.locator('body').innerText();
  console.log('ADV-E1 snoozed:', title, '| after:', after, '| title on Overview:', body.includes(title), '| "snooz" on Overview:', /snooz/i.test(body));
  expect(body, 'AC4: snoozed items are counted separately on the Overview').toMatch(/\d+\s+snoozed/i);
});

test('ADV-E2 Journey A verification: acknowledge the top item, return, and the counts change', async ({page}) => {
  await page.goto('/');
  const before = await attentionDetail(page);
  const queue = page.getByRole('heading', {name: 'Needs attention'}).locator('xpath=ancestor::*[3]');
  await queue.getByRole('link').filter({hasNotText: /All notices|snoozed/}).first().click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', {name: 'Mark reviewing'}).click();
  await expect(drawer.getByText(/^Reviewing/)).toBeVisible();
  // Browser Back, the way a user "returns to Overview".
  const trail: string[] = [page.url()];
  for (let i = 0; i < 6 && new URL(page.url()).pathname !== '/'; i += 1) {
    await page.goBack();
    await page.waitForLoadState('networkidle');
    trail.push(page.url());
  }
  console.log('ADV-E2 back trail:', trail.join(' -> '));
  await expect(page.getByRole('heading', {level: 1, name: 'Overview'})).toBeVisible();
  // In review still needs attention (the urgent total stays); the in-review count moves (spec Journey A step 4).
  const after = await attentionDetail(page);
  console.log('ADV-E2 counts before:', before, '| after acknowledge:', after);
  expect(after, 'issue #47 verification: "acknowledge it, return, and see the count change"').not.toBe(before);
});

test('ADV-E3 recent activity names the application that was archived', async ({page, request}) => {
  const key = process.env.APP_REGISTER_API_KEY!;
  const auth = {authorization: `Bearer ${key}`};
  const {apps} = await (await request.get('/api/apps', {headers: auth})).json();
  const target = apps.find((app: {name: string}) => app.name === 'Room Booker');
  const archived = await request.post(`/api/apps/${target.id}/archive`, {headers: {...auth, 'idempotency-key': randomUUID()}});
  expect(archived.ok()).toBe(true);

  await page.goto('/');
  const activity = page.getByRole('heading', {name: 'Recent activity'}).locator('xpath=ancestor::*[3]');
  const text = await activity.innerText();
  console.log('ADV-E3 activity:', text.replace(/\n+/g, ' / '));
  expect(text, 'the archive event should say which app').toContain('Room Booker');
});
