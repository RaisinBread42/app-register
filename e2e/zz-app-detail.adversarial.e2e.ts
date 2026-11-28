import {randomUUID} from 'node:crypto';
import {expect, test, type APIRequestContext, type Page} from '@playwright/test';
import {expectNoAxeViolations, expectNoHorizontalScroll} from './helpers';

/**
 * Adversarial review of [29] Application detail, kept as regression tests. Every test
 * starts with all matches New, no owner. Runs late (zz-) because it archives seeded data.
 */

const API = {authorization: `Bearer ${process.env.APP_REGISTER_API_KEY}`};
const SHOTS = process.env.ADV_SHOTS_DIR ?? 'e2e-artifacts/screenshots';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

type Match = {id: string; status: string; assignee: {id: string} | null; title: string; app: {id: string; name: string}};

async function allMatches(request: APIRequestContext): Promise<Match[]> {
  const response = await request.get('/api/notices?state=all', {headers: API});
  const {notices} = (await response.json()) as {notices: {title: string; matches: Omit<Match, 'title'>[]}[]};
  return notices.flatMap((notice) => notice.matches.map((match) => ({...match, title: notice.title})));
}

async function post(request: APIRequestContext, path: string, data?: unknown) {
  const response = await request.post(path, {headers: {...API, 'idempotency-key': randomUUID()}, data});
  expect(response.status(), `${path} ${await response.text()}`).toBeLessThan(300);
  return response.json();
}

async function resetMatches(request: APIRequestContext) {
  for (const match of await allMatches(request)) {
    if (match.status !== 'new') await post(request, `/api/notice-matches/${match.id}/status`, {status: 'new'});
    if (match.assignee) await post(request, `/api/notice-matches/${match.id}/assign`, {assigneeId: null});
  }
}

async function appId(request: APIRequestContext, name: string): Promise<string> {
  const {apps} = (await (await request.get('/api/apps', {headers: API})).json()) as {apps: {id: string; name: string}[]};
  const app = apps.find((row) => row.name === name);
  if (!app) throw new Error(`no active app named ${name}`);
  return app.id;
}

const hero = (page: Page) => page.getByRole('heading', {level: 1}).locator('xpath=ancestor::*[.//*[normalize-space()="HEALTH SCORE"]][1]');

test.beforeEach(async ({request}) => resetMatches(request));
test.afterAll(async ({request}) => resetMatches(request));

test('ADV-E1 AC6: the tabs follow the WAI-ARIA tabs pattern (tab → aria-controls → tabpanel)', async ({page, request}) => {
  await page.goto(`/applications/${await appId(request, 'Northwind Portal')}`);
  const selected = page.getByRole('tab', {name: 'Overview', selected: true});
  await expect(selected).toBeVisible();
  const controls = await selected.getAttribute('aria-controls');
  const panels = await page.getByRole('tabpanel').count();
  console.log('ADV-E1 aria-controls:', controls, '| tabpanel count:', panels);
  expect.soft(controls, 'selected tab has aria-controls').not.toBeNull();
  expect.soft(panels, 'one role=tabpanel element for the open tab').toBe(1);
});

test('ADV-E2 AC6: arrow keys, Home and End move between tabs; Enter opens one and puts it in the URL', async ({page, request}) => {
  await page.goto(`/applications/${await appId(request, 'Northwind Portal')}`);
  await page.getByRole('tab', {name: 'Overview'}).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', {name: 'Dependencies'})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', {name: 'Dependencies', selected: true})).toBeVisible();
  await expect(page).toHaveURL(/tab=dependencies/);
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', {name: 'Activity'})).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', {name: 'Overview'})).toBeFocused();
});

test('ADV-E3 AC6: at 360 px the Overview tab stacks its columns and nothing overflows its card', async ({page, request}) => {
  const id = await appId(request, 'Northwind Portal');
  await page.setViewportSize({width: 1280, height: 900});
  await page.goto(`/applications/${id}`);
  await page.screenshot({path: `${SHOTS}/adv29-detail-1280.png`, fullPage: true});
  await page.setViewportSize({width: 360, height: 780});
  await page.waitForLoadState('networkidle');
  await page.screenshot({path: `${SHOTS}/adv29-detail-360.png`, fullPage: true});
  await expectNoHorizontalScroll(page);

  const layout = await page.evaluate(() => {
    const byText = (text: string) =>
      [...document.querySelectorAll<HTMLElement>('h1,h2,h3,span,p,div')].find((el) => el.childElementCount === 0 && el.textContent?.trim() === text);
    /** The nearest ancestor whose parent is a CSS grid (a grid cell). */
    const cell = (el: HTMLElement | undefined) => {
      let node = el ?? null;
      while (node?.parentElement && getComputedStyle(node.parentElement).display !== 'grid') node = node.parentElement;
      return node;
    };
    const needs = cell(byText('Open notices on this application, most severe first'));
    const status = cell(byText('Status by monitored dimension'));
    const scoreLabel = byText('HEALTH SCORE');
    const meta = cell(byText('Backup owner'))?.parentElement;
    const review = [...document.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Review notice');
    const box = (el: Element | null | undefined) => (el ? el.getBoundingClientRect() : null);
    return {
      needsWidth: Math.round(box(needs)?.width ?? -1),
      statusLeft: Math.round(box(status)?.left ?? -1),
      needsLeft: Math.round(box(needs)?.left ?? -1),
      metaColumns: meta ? getComputedStyle(meta).gridTemplateColumns : null,
      reviewRight: Math.round(box(review)?.right ?? -1),
      needsRight: Math.round(box(needs)?.right ?? -1),
      scoreLabelRight: Math.round(box(scoreLabel)?.right ?? -1),
      viewport: document.documentElement.clientWidth,
    };
  });
  console.log('ADV-E3 360px layout:', JSON.stringify(layout));
  expect.soft(layout.statusLeft, '"Current status" card sits below "Needs attention", not beside it').toBe(layout.needsLeft);
  expect.soft(layout.needsWidth, '"Needs attention" card uses the phone width').toBeGreaterThan(280);
  expect.soft(layout.metaColumns?.split(' ').length, 'header facts reflow to fewer columns on a phone').toBeLessThan(3);
  expect.soft(layout.reviewRight, '"Review notice" stays inside its card').toBeLessThanOrEqual(layout.needsRight);
  expect.soft(layout.scoreLabelRight, 'the health score is on screen, not clipped past the right edge').toBeLessThanOrEqual(layout.viewport);
  await expectNoAxeViolations(page);
});

test('ADV-E4 Verification: open a notice from "Needs attention", then Back returns to the application', async ({page}) => {
  await page.goto('/applications');
  await page.getByRole('link', {name: 'Northwind Portal'}).first().click();
  await expect(page.getByRole('heading', {level: 1, name: 'Northwind Portal'})).toBeVisible();
  const detailUrl = page.url();
  await page.getByRole('link', {name: 'Review notice'}).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', {level: 1, name: 'Northwind Portal'})).toBeVisible();
  expect(page.url()).toBe(detailUrl);
  await expect(page.getByRole('tab', {name: 'Overview', selected: true})).toBeVisible();
});

test('ADV-E5 acting on a notice, then Back: "Needs attention" shows the new status, not the old one', async ({page}) => {
  await page.goto('/applications');
  await page.getByRole('link', {name: 'Northwind Portal'}).first().click();
  const statusLine = page.getByText(/ · New$/).first();
  const title = (await statusLine.locator('xpath=preceding-sibling::*[1]').textContent())!.trim();
  const row = statusLine.locator('xpath=ancestor::*[.//a[normalize-space()="Review notice"]][1]');
  await row.getByRole('link', {name: 'Review notice'}).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('heading', {level: 2, name: title})).toBeVisible();
  await drawer.getByRole('button', {name: 'Mark reviewing'}).click();
  await expect(drawer.getByText(/^Reviewing/)).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', {level: 1, name: 'Northwind Portal'})).toBeVisible();
  const after = await page.getByText(title, {exact: true}).locator('xpath=following-sibling::*[1]').textContent();
  console.log('ADV-E5', title, '→ after Back:', after);
  expect(after).toMatch(/· Reviewing$/);
});

test('ADV-E6 AC4: the open tab is restored on Back after leaving the page', async ({page}) => {
  await page.goto('/applications');
  await page.getByRole('link', {name: 'Northwind Portal'}).first().click();
  await page.getByRole('tab', {name: 'Activity'}).click();
  await expect(page).toHaveURL(/tab=activity/);
  await page.getByRole('link', {name: 'All applications'}).click();
  await expect(page.getByRole('heading', {level: 1, name: 'Applications'})).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/tab=activity/);
  await expect(page.getByRole('tab', {name: 'Activity', selected: true})).toBeVisible();
  await expect(page.getByRole('heading', {level: 2, name: 'Activity'})).toBeVisible();
  await expectNoAxeViolations(page);
});

test('ADV-E7 AC4: Back after switching tabs on the page (record where it lands)', async ({page}) => {
  await page.goto('/applications');
  await page.getByRole('link', {name: 'Northwind Portal'}).first().click();
  await expect(page.getByRole('heading', {level: 1, name: 'Northwind Portal'})).toBeVisible();
  await page.getByRole('tab', {name: 'Dependencies'}).click();
  await expect(page).toHaveURL(/tab=dependencies/);
  await page.getByRole('tab', {name: 'Hosting & infrastructure'}).click();
  await expect(page).toHaveURL(/tab=hosting/);
  await page.goBack();
  await page.waitForLoadState('networkidle');
  console.log('ADV-E7 Back after two tab switches lands on:', new URL(page.url()).pathname + new URL(page.url()).search);
  await expect(page.getByRole('heading', {level: 1})).toBeVisible();
});

test('ADV-E8 AC1: the header shows coverage beside the score, and does not claim hosting for an app with no hosting', async ({page, request}) => {
  await page.goto(`/applications/${await appId(request, 'Fleet Tracker')}`);
  const text = (await hero(page).innerText()).replace(/\n+/g, ' / ');
  const hosting = await page.getByText('Hosting & infrastructure', {exact: true}).last().locator('xpath=ancestor::*[2]').innerText();
  console.log('ADV-E8 Fleet Tracker header:', text);
  console.log('ADV-E8 Fleet Tracker "Current status" hosting row:', hosting.replace(/\n+/g, ' '));
  expect.soft(text, 'AC1: "score plus coverage"').toMatch(/coverage|\d of \d/i);
  expect.soft(text, 'Fleet Tracker records no hosting, so the score is not based on hosting').not.toContain('dependencies and hosting');
});

test('ADV-E9 Activity: no person ids or emails; a snooze says until when', async ({page, request}) => {
  const id = await appId(request, 'Northwind Portal');
  const matches = (await allMatches(request)).filter((match) => match.app.id === id);
  const {people} = (await (await request.get('/api/people', {headers: API})).json()) as {people: {id: string; email: string; status: string}[]};
  const person = people.find((row) => row.status === 'active')!;
  await post(request, `/api/notice-matches/${matches[0].id}/assign`, {assigneeId: person.id});
  await post(request, `/api/notice-matches/${matches.at(-1)!.id}/status`, {status: 'snoozed', snoozedUntil: '2099-01-01', note: 'Waiting for the vendor fix'});
  await page.goto(`/applications/${id}?tab=activity`);
  const panel = page.getByRole('heading', {level: 2, name: 'Activity'}).locator('xpath=ancestor::*[3]');
  const text = await panel.innerText();
  console.log('ADV-E9 Activity:', text.replace(/\n+/g, ' / ').slice(0, 600));
  expect(text, 'no person or record ids').not.toMatch(UUID);
  expect(text, 'no emails').not.toContain(person.email);
  expect.soft(text, 'a snooze in the history says until when').toMatch(/2099/);
  await expectNoAxeViolations(page);
});

test('ADV-E10 AC4: an unknown or repeated tab in the URL falls back safely', async ({page, request}) => {
  const id = await appId(request, 'Northwind Portal');
  await page.goto(`/applications/${id}?tab=../../settings`);
  await expect(page.getByRole('tab', {name: 'Overview', selected: true})).toBeVisible();
  await page.goto(`/applications/${id}?tab=activity&tab=hosting`);
  await expect(page.getByRole('tab', {name: 'Activity', selected: true})).toBeVisible();
  await page.goto(`/applications/${id}?tab=licence`);
  await expect(page.getByRole('tab', {name: 'Licences', selected: true})).toBeVisible();
  await expectNoAxeViolations(page);
});

test('ADV-E11 AC5: "See scoring details" toggles all deductions and says it is expanded; copy fits the count', async ({page, request}) => {
  await page.goto(`/applications/${await appId(request, 'Northwind Portal')}`);
  const toggle = page.getByRole('button', {name: 'See scoring details'});
  await expect(page.getByText(/^−\d+ pts$/)).toHaveCount(3);
  console.log('ADV-E11 aria-expanded before:', await toggle.getAttribute('aria-expanded'));
  expect.soft(await toggle.getAttribute('aria-expanded'), 'a show-more toggle exposes its state').toBe('false');
  await toggle.click();
  const all = await page.getByText(/^−\d+ pts$/).count();
  await page.getByRole('button', {name: 'Show the top three'}).click();
  await expect(page.getByText(/^−\d+ pts$/)).toHaveCount(3);
  console.log('ADV-E11 Northwind deductions in full:', all);

  const visible = await page.getByText(/^−\d+ pts$/).allTextContents();
  const lost = visible.reduce((total, text) => total + Number(text.replace(/\D/g, '')), 0);
  const score = Number(await page.getByText('Current health score').locator('xpath=ancestor::*[2]').innerText().then((text) => text.replace(/\D/g, '')));
  const remainder = await page.getByText(/more deduction|other deduction/i).count();
  console.log('ADV-E11 default breakdown: 100 −', lost, '≠', score, '| remainder rows:', remainder);
  expect.soft(100 - lost === score || remainder > 0, 'the default breakdown reads as a ledger: 100 − shown = score, or says the rest are hidden').toBe(true);

  await page.goto(`/applications/${await appId(request, 'Fleet Tracker')}`);
  const shown = await page.getByText(/^−\d+ pts$/).count();
  const subtitle = await page.getByText(/three biggest deductions|Every deduction/).textContent();
  console.log('ADV-E11 Fleet Tracker deductions:', shown, '| subtitle:', subtitle);
  expect.soft(shown < 3 ? subtitle : 'n/a', 'with fewer than three deductions the subtitle should not promise three').not.toBe('The three biggest deductions');
});

test('ADV-E12 AC6: long names and values do not overflow at 360 px', async ({page, request}) => {
  const {people} = (await (await request.get('/api/people', {headers: API})).json()) as {people: {id: string; status: string}[]};
  const owner = people.find((row) => row.status === 'active')!;
  const name = `Customer-Onboarding-Identity-Verification-Gateway-${randomUUID().slice(0, 8)}`;
  const created = await post(request, '/api/apps', {
    name,
    kind: 'in_house',
    criticality: 'high',
    environments: ['production', 'staging', 'development', 'other'],
    ownerId: owner.id,
    backupOwnerId: null,
    category: null,
    vendor: null,
    description: null,
    renewalDate: null,
    noticeDeadline: null,
    billingCycle: null,
    costCents: null,
    runtimeLocation: 'Kubernetes-cluster-prod-weu-01.internal.corp.example.test/namespaces/customer-onboarding',
    dataAndKeys: 'Passport scans; identity provider client secret',
    whatBreaksIfStopped: 'New customers cannot sign up',
    repositoryUrl: 'https://git.example.test/platform/customer-onboarding-identity-verification-gateway-service',
  });
  await page.setViewportSize({width: 360, height: 780});
  await page.goto(`/applications/${created.app.id}`);
  await expect(page.getByRole('heading', {level: 1, name})).toBeVisible();
  await page.screenshot({path: `${SHOTS}/adv29-long-360.png`, fullPage: true});
  const overflowing = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('h1, a, p, span')]
      .filter((el) => !el.closest('[role=tablist]'))
      .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && el.getBoundingClientRect().width > 0)
      .map((el) => `${el.tagName} "${el.textContent?.trim().slice(0, 40)}" right=${Math.round(el.getBoundingClientRect().right)}`),
  );
  console.log('ADV-E12 elements past the 360 px edge:', overflowing);
  await expectNoHorizontalScroll(page);
  expect(overflowing, 'nothing is cut off past the right edge').toEqual([]);
});

test('ADV-E13 archived application: read-only, Activity shows the archive, Needs attention does not send you to the inbox', async ({page, request}) => {
  const id = await appId(request, 'Fleet Tracker');
  const before = (await allMatches(request)).filter((match) => match.app.id === id).length;
  await post(request, `/api/apps/${id}/archive`);
  await page.goto(`/applications/${id}`);
  await expect(page.getByText('Archived', {exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Archive'})).toHaveCount(0);
  await expect(page.getByRole('link', {name: 'Edit application'})).toHaveCount(0);
  const needs = await page.getByRole('heading', {level: 2, name: 'Needs attention'}).locator('xpath=ancestor::*[3]').innerText();
  const inbox = (await allMatches(request)).filter((match) => match.app.id === id).length;
  console.log('ADV-E13 matches before archive:', before, '| in inbox after:', inbox, '| Needs attention:', needs.replace(/\n+/g, ' / '));
  await page.getByRole('tab', {name: 'Activity'}).click();
  await expect(page.getByText(/archived Fleet Tracker/)).toBeVisible();
  await expectNoAxeViolations(page);
  expect.soft(inbox === 0 ? needs : '', 'the inbox hides archived apps, so do not point there').not.toContain('are in the Notices inbox');
});
