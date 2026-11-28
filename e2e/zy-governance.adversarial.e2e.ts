/**
 * Adversarial e2e for [49] Governance Board, kept as regression tests after the fixes. Read-only
 * checks first, then ones that add apps (prefixed ADV-49-W, which archive them again at the end).
 * Runs before the zz-/zzz- suites, which archive seeded apps.
 */
import {randomUUID} from 'node:crypto';
import {expect, test, type APIRequestContext, type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {AXE_TAGS, VIEWPORTS} from './e2e-config';
import {expectNoHorizontalScroll} from './helpers';

const API = {authorization: `Bearer ${process.env.APP_REGISTER_API_KEY}`};
const SHOTS = process.env.ADV_SHOTS_DIR ?? 'e2e-artifacts/screenshots';
/** Application rows only: an empty list renders its message in a row too. */
const appRows = (page: Page) => page.locator('tbody tr').filter({has: page.locator('a[href^="/applications/"]')});

async function post(request: APIRequestContext, path: string, data?: unknown) {
  const response = await request.post(path, {headers: {...API, 'idempotency-key': randomUUID()}, data});
  expect(response.status(), `${path} ${await response.text()}`).toBeLessThan(300);
  return response.json();
}

async function axe(page: Page): Promise<string[]> {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running' || animation.effect?.getTiming().iterations === Infinity),
  );
  const axePage = page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page'];
  const results = await new AxeBuilder({page: axePage}).withTags(AXE_TAGS).analyze();
  return results.violations.flatMap((violation) => violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')} ${node.html.slice(0, 100)}`));
}

test('ADV-49-E6 AC4: the seeded leaver (Casey) owns Inkpad CRM and Payroll Bridge, so both are listed under "Owner no longer active"', async ({page}) => {
  await page.goto('/governance');
  const section = page.getByRole('heading', {name: /^Owner no longer active/}).locator('xpath=..');
  const summary = await page.getByRole('heading', {name: 'Executive summary'}).locator('xpath=..').innerText();
  expect(summary).not.toContain('Every application has an active owner');
  await expect(section.getByRole('link', {name: 'Inkpad CRM'})).toBeVisible();
  await expect(section.getByRole('link', {name: 'Payroll Bridge'})).toBeVisible();
});

test('ADV-49-E1 AC7: every portfolio health figure opens an Applications list with exactly that many rows', async ({page}) => {
  const labels = ['Need attention', 'of them critical', 'of them on out-of-date data', 'Insufficient data', 'Healthy'];
  const results: string[] = [];
  for (const label of labels) {
    await page.goto('/governance');
    const link = page.getByRole('link', {name: new RegExp(`^\\d+ applications: ${label}$`)});
    const count = Number(await link.innerText());
    await link.click();
    await expect(page.getByRole('heading', {level: 1, name: 'Applications'})).toBeVisible();
    await page.waitForLoadState('networkidle');
    const shown = await appRows(page).count();
    results.push(`${label}: board ${count} → ${page.url().replace(/^https?:\/\/[^/]+/, '')} shows ${shown}`);
  }
  const wrong = results.filter((line) => {
    const [, board, shown] = line.match(/board (\d+) .* shows (\d+)/)!;
    return board !== shown;
  });
  expect(wrong, 'figures whose drill-down shows a different number').toEqual([]);
});

test('ADV-49-E2 AC6: the summary and the figure under the same words agree (out-of-date data, need attention)', async ({page}) => {
  await page.goto('/governance');
  const summary = await page.getByRole('heading', {name: 'Executive summary'}).locator('xpath=..').innerText();
  const stale = Number(await page.getByRole('link', {name: /^\d+ applications: of them on out-of-date data$/}).innerText());
  const attention = Number(await page.getByRole('link', {name: /^\d+ applications: Need attention$/}).innerText());
  const saidAttention = summary.match(/(\d+) applications? needs? attention/);
  expect(saidAttention && Number(saidAttention[1]), 'summary "need attention" vs figure "Need attention"').toBe(attention);
  const saidStale = summary.match(/(\d+) applications? rests? on out-of-date data/);
  expect(saidStale ? Number(saidStale[1]) : 0, 'summary "out-of-date data" vs figure "Data out of date"').toBe(stale);
});

test('ADV-49-E3 AC10: axe clean at 360, 768 and 1280, in light and dark, and no sideways scroll at any width', async ({page}) => {
  const found: string[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({colorScheme: scheme});
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({width: viewport.width, height: viewport.height});
      await page.goto('/governance');
      await expect(page.getByRole('heading', {level: 1, name: 'Governance'})).toBeVisible();
      await expectNoHorizontalScroll(page);
      found.push(...(await axe(page)).map((line) => `${scheme} ${viewport.width}: ${line}`));
      await page.screenshot({path: `${SHOTS}/adv49-${scheme}-${viewport.width}.png`, fullPage: true});
    }
  }
  expect(found).toEqual([]);
});

test('ADV-49-E4 the board loads with no console errors or hydration warnings', async ({page}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || /hydrat/i.test(message.text())) errors.push(message.text().slice(0, 200));
  });
  page.on('pageerror', (error) => errors.push(error.message.slice(0, 200)));
  await page.goto('/governance');
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
});

test('ADV-49-E5 personal data: the board page does not ship people\'s emails it never shows', async ({page, request}) => {
  const {people} = (await (await request.get('/api/people', {headers: API})).json()) as {people: {email: string; status: string}[]};
  const board = await (await page.request.get('/governance')).text();
  const onBoard = people.filter((person) => board.includes(person.email)).map((person) => `${person.email.replace(/^(.).*@/, '$1…@')} (${person.status})`);
  expect(onBoard, 'emails sent to the browser by /governance').toEqual([]);
});

test('ADV-49-W1 AC4/AC7: with 11 apps lacking a backup owner, the board shows all of them or a count and a way to the rest', async ({page, request}) => {
  const {people} = (await (await request.get('/api/people', {headers: API})).json()) as {people: {id: string; name: string; status: string}[]};
  const ownerId = people.find((person) => person.status === 'active')!.id;
  for (let index = 1; index <= 11; index += 1) {
    await post(request, '/api/apps', {name: `ADV49 Solo ${String(index).padStart(2, '0')}`, kind: 'in_house', ownerId, backupOwnerId: null, renewalDate: '2027-01-10'});
  }
  const {apps} = (await (await request.get('/api/apps', {headers: API})).json()) as {apps: {backupOwner: unknown; renewalDate: string | null}[]};
  const lacking = apps.filter((app) => app.backupOwner === null).length;

  await page.goto('/governance');
  const section = page.getByRole('heading', {name: /^No active backup owner/}).locator('xpath=..');
  await expect(section.getByRole('link', {name: /^ADV49 Solo \d\d$/})).toHaveCount(11);
  expect(await section.getByRole('heading').innerText()).toBe(`No active backup owner (${await section.getByRole('link').count()})`);
  expect(await section.getByRole('link').count(), 'every app with no backup owner is listed').toBeGreaterThanOrEqual(lacking);
});

test('ADV-49-W1b AC5: once 11 renewals fall 31–60 days out, the seeded Brightdesk notice deadline and Ledgerline renewal in the same window are still on the board', async ({page, request}) => {
  await page.goto('/governance');
  const window60 = page.getByRole('heading', {name: /^In 31–60 days/}).locator('xpath=..');
  await expect(window60.getByRole('link', {name: /^ADV49 Solo/})).toHaveCount(11);
  await expect(window60.getByRole('link', {name: 'Brightdesk'})).toBeVisible();
  await expect(window60.getByRole('link', {name: 'Ledgerline'})).toBeVisible();

  // Leave the register as the later suites expect it.
  const {apps} = (await (await request.get('/api/apps', {headers: API})).json()) as {apps: {id: string; name: string}[]};
  for (const app of apps.filter((candidate) => candidate.name.startsWith('ADV49 Solo'))) {
    await post(request, `/api/apps/${app.id}/archive`);
  }
});
