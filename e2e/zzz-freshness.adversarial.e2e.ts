/**
 * Adversarial e2e for [31] source freshness, kept as regression tests after the fixes. The e2e server
 * blocks the outside network, so every live check fails: seeded apps that had a good reading must turn
 * stale, never green or "Healthy". Tests run in order (and after the other suites, as this one leaves the
 * seeded apps stale): E1 makes the outage happen, the rest look at what it left. An earlier suite archives
 * every app, so E1 first brings back the three it uses.
 */
import {randomUUID} from 'node:crypto';
import {expect, test, type APIRequestContext, type Page} from '@playwright/test';
import {E2E} from './e2e-config';

const API = {authorization: `Bearer ${process.env.APP_REGISTER_API_KEY}`};
type Health = {score: number | null; status: string; staleSince: string | null; hasFailedCheck: boolean};
type App = {id: string; name: string; health: Health};

const SEEDED = ['Staff Directory', 'Northwind Portal', 'Fleet Tracker'];

async function apps(request: APIRequestContext, query = ''): Promise<App[]> {
  return ((await (await request.get(`/api/apps${query}`, {headers: API})).json()) as {apps: App[]}).apps;
}

async function unarchiveSeeded(request: APIRequestContext): Promise<void> {
  for (const app of (await apps(request, '?state=archived')).filter((archived) => SEEDED.includes(archived.name))) {
    const restored = await request.post(`/api/apps/${app.id}/unarchive`, {headers: {...API, 'idempotency-key': randomUUID()}});
    expect(restored.ok(), await restored.text()).toBe(true);
  }
}

async function idOf(request: APIRequestContext, name: string): Promise<string> {
  return (await apps(request)).find((app) => app.name === name)!.id;
}

const shot = (page: Page, name: string) => page.screenshot({path: `${E2E.screenshotsDir}/adv31-${name}.png`, fullPage: true});
const squash = (text: string) => text.replace(/\s+/g, ' ');

/** The row of the named app on the applications list, as text, and each badge as "text=variant". */
async function listRow(page: Page, name: string): Promise<{text: string; badges: string[]}> {
  const row = page.locator('tbody tr').filter({hasText: name}).first();
  await expect(row).toBeVisible();
  const badges = await row.locator('[data-variant]').evaluateAll((nodes) => nodes.map((node) => `${node.textContent}=${node.getAttribute('data-variant')}`));
  return {text: squash(await row.innerText()), badges};
}

async function openApplications(page: Page, query = ''): Promise<void> {
  await page.setViewportSize({width: 1280, height: 900});
  await page.goto(`/applications${query}`);
  await expect(page.getByRole('table')).toBeVisible();
}

async function openDetail(page: Page, request: APIRequestContext, name: string, tab = ''): Promise<void> {
  await page.setViewportSize({width: 1280, height: 900});
  await page.goto(`/applications/${await idOf(request, name)}${tab ? `?tab=${tab}` : ''}`);
  await expect(page.getByText('HEALTH SCORE', {exact: true})).toBeVisible();
}

test('ADV31-E1 AC2/AC5: an outage turns the seeded readings stale; the list and the Healthy filter never show them as healthy', async ({page, request}) => {
  await unarchiveSeeded(request);
  for (const name of SEEDED) {
    const id = await idOf(request, name);
    const hosting = await request.post(`/api/apps/${id}/hosting/refresh`, {headers: API});
    const deps = await request.post(`/api/apps/${id}/dependencies/refresh`, {headers: API});
    expect(hosting.ok() && deps.ok(), `${name} refreshes answer`).toBe(true);
  }

  await openApplications(page);
  await shot(page, 'applications-stale');
  const staff = await listRow(page, 'Staff Directory');
  expect(staff.text).toContain('Stale since');
  expect(staff.text, 'no all-clear after a failed check').not.toContain('No active issues');
  expect(staff.badges.join(' '), 'a stale score is never green').not.toContain('green');

  await openApplications(page, '?health=healthy');
  expect((await page.locator('tbody tr').allInnerTexts()).join(' ')).not.toContain('Staff Directory');
});

test('ADV31-E2 a critical app (score 58, red before the outage) keeps a red score pill once its reading is stale', async ({page}) => {
  await openApplications(page);
  const northwind = await listRow(page, 'Northwind Portal');
  expect(northwind.badges, 'the score pill (not the criticality badge)').toContain('58=red');
  expect(northwind.text).toMatch(/stale since/i);
});

test('ADV31-E3 AC2: the detail page of a stale app never calls it "Healthy" and shows no green tick', async ({page, request}) => {
  await openDetail(page, request, 'Staff Directory');
  await expect(page.getByText('Current health score')).toBeVisible();
  await shot(page, 'staff-directory-detail');
  const hero = await page.getByText('HEALTH SCORE', {exact: true}).locator('xpath=..').innerText();
  const breakdown = squash(await page.getByText('Current health score').locator('xpath=ancestor::*[contains(., "Starting score")][1]').innerText());
  expect(hero).toContain('Stale since');
  expect(breakdown, 'the breakdown must not call stale data healthy').not.toMatch(/Current health score Healthy/);
  await expect(page.getByText('✓', {exact: true})).toHaveCount(0);
});

test('ADV31-E4 the "Last checked" line does not say hosting was never checked when its last good reading is the one shown', async ({page, request}) => {
  await openDetail(page, request, 'Staff Directory');
  const line = squash(await page.locator('body').innerText()).match(/Last checked (.{0,70})/)?.[1];
  expect(line, 'the hosting reading is kept and labelled stale, so it was checked').not.toContain('Hosting not checked yet');
});

test('ADV31-E5 Hosting tab after a failed "Check now": Last checked moves, and the row says which reading it shows and why', async ({page, request}) => {
  await openDetail(page, request, 'Staff Directory', 'hosting');
  const checkNow = page.getByRole('button', {name: 'Check now'});
  await expect(checkNow).toBeVisible();
  const id = await idOf(request, 'Staff Directory');
  const checkedAt = async () =>
    ((await (await request.get(`/api/apps/${id}`, {headers: API})).json()) as {app: {hosting: {healthCheckedAt: string}[]}}).app.hosting[0].healthCheckedAt;
  const before = await checkedAt();
  await checkNow.click();
  await expect(checkNow).toBeEnabled();
  // A failed run still counts as a run: "Last checked" moves on, while the reading shown keeps its own date.
  await expect.poll(checkedAt).not.toBe(before);
  await shot(page, 'staff-directory-hosting');
  await expect(page.locator('tbody tr').first()).toContainText('the latest check failed');
  await expect(page.getByText('Last good check', {exact: true})).toBeVisible();
  await expect(page.getByText('No open incidents', {exact: true})).toHaveCount(0);
});

test('ADV31-E6 AC3/AC4: Settings › Monitoring sources and the Overview after the outage', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 900});
  await page.goto('/settings?section=sources');
  await expect(page.getByText('npm registry').first()).toBeVisible();
  await shot(page, 'settings-sources');
  await page.setViewportSize({width: 360, height: 780});
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  await page.setViewportSize({width: 1280, height: 900});
  await page.goto('/');
  await expect(page.getByRole('heading', {name: 'Overview'})).toBeVisible();
  await shot(page, 'overview');
  await expect(page.getByText(/Last successful check/).first()).toBeVisible();
  expect((await page.getByText(/out of date/).allInnerTexts()).length, 'stale sources are flagged').toBeGreaterThan(0);
});
