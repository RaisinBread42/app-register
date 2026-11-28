import {execSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect, test, type APIRequestContext, type Page} from '@playwright/test';
import {expectNoHorizontalScroll} from './helpers';

/**
 * Adversarial review of [27] (Notices inbox). Each test states the rule it
 * expects; a failure is a finding. Every test starts from all matches New, no owner.
 */

const API = {authorization: `Bearer ${process.env.APP_REGISTER_API_KEY}`};
const rows = (page: Page) => page.locator('a[data-inbox-row]');

type Match = {id: string; status: string; statusNote: string | null; assignee: {id: string; name: string} | null; title: string};

async function allMatches(request: APIRequestContext): Promise<Match[]> {
  const response = await request.get('/api/notices?state=all', {headers: API});
  const {notices} = (await response.json()) as {notices: {title: string; matches: Omit<Match, 'title'>[]}[]};
  return notices.flatMap((notice) => notice.matches.map((match) => ({...match, title: notice.title})));
}

async function post(request: APIRequestContext, path: string, data: unknown) {
  const response = await request.post(path, {headers: {...API, 'idempotency-key': randomUUID()}, data});
  expect(response.status(), `${path} ${await response.text()}`).toBeLessThan(300);
}

async function matchTitled(request: APIRequestContext, text: string): Promise<Match> {
  const match = (await allMatches(request)).find((row) => row.title.includes(text));
  if (!match) throw new Error(`no match titled ${text}`);
  return match;
}

const toasts = (page: Page) => page.getByRole('region', {name: 'Notifications'});
const toastUndo = (page: Page, text: RegExp | string) =>
  toasts(page).getByText(text).locator('xpath=ancestor::*[.//button[normalize-space()="Undo"]][1]').getByRole('button', {name: 'Undo'});

async function resetMatches(request: APIRequestContext) {
  for (const match of await allMatches(request)) {
    if (match.status !== 'new') await post(request, `/api/notice-matches/${match.id}/status`, {status: 'new'});
    if (match.assignee) await post(request, `/api/notice-matches/${match.id}/assign`, {assigneeId: null});
  }
}

test.beforeEach(async ({request}) => resetMatches(request));
// The suites after this one expect the seeded state.
test.afterAll(async ({request}) => resetMatches(request));

test('A: the r shortcut confirms with a toast and offers Undo, like the Mark reviewing button', async ({page}) => {
  await page.goto('/notices');
  await page.locator('body').click();
  await page.keyboard.press('j');
  await page.keyboard.press('r');
  await expect(page.locator('tbody tr').first(), 'r did fire the server action').toContainText('Reviewing');
  await expect(page.getByRole('button', {name: 'Undo'}), 'confirmation + Undo after r').toBeVisible({timeout: 3000});
});

test('B: r on a Handled row does not silently reopen it and wipe the evidence', async ({page, request}) => {
  const target = await matchTitled(request, 'prototype pollution');
  await post(request, `/api/notice-matches/${target.id}/status`, {status: 'handled', note: 'Upgraded lodash in PR #12'});
  await page.goto('/notices?status=handled');
  await page.locator('body').click();
  await page.keyboard.press('j');
  await page.keyboard.press('r');
  await page.waitForTimeout(1500);
  const after = (await allMatches(request)).find((row) => row.id === target.id)!;
  expect({status: after.status, note: after.statusNote}, 'handled match after pressing r').toEqual({status: 'handled', note: 'Upgraded lodash in PR #12'});
});

test('C: ? pressed inside the open drawer does not stack a second modal on it (no nested modals)', async ({page}) => {
  await page.goto('/notices');
  await rows(page).first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', {name: 'Mark reviewing'}).focus();
  await page.keyboard.press('?');
  await page.waitForTimeout(500);
  await expect(page.getByRole('heading', {name: 'Keyboard shortcuts'}), 'help dialog stacked on the drawer').toHaveCount(0);
});

test('D: closing the drawer with Escape returns focus to the row that opened it (WAI-ARIA dialog)', async ({page}) => {
  await page.goto('/notices');
  await page.locator('body').click();
  await page.keyboard.press('j');
  await page.keyboard.press('j');
  await expect(rows(page).nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const focused = await page.evaluate(() => `${document.activeElement?.tagName} ${document.activeElement?.textContent?.slice(0, 40)}`);
  expect(focused, 'focus after Escape').toContain((await rows(page).nth(1).textContent())!.slice(0, 20));
});

test('E: after closing a drawer with Escape, one Back leaves the inbox (no duplicate history entry)', async ({page}) => {
  await page.goto('/applications');
  await page.getByRole('navigation').first().getByRole('link', {name: /^Notices/}).click();
  await expect(page).toHaveURL(/\/notices$/);
  await rows(page).first().click();
  await expect(page).toHaveURL(/notice=/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/notice=/);
  await page.goBack();
  await expect(page, 'one Back after Escape').toHaveURL(/\/applications/, {timeout: 3000});
});

test('F: a filter with no open rows does not say "Nothing needs attention" while other notices are open', async ({page}) => {
  await page.goto('/notices?category=licensing');
  await expect(page.locator('a[data-inbox-row]')).toHaveCount(0);
  await expect(page.getByText('Nothing needs attention', {exact: true}), 'claim with 4 open notices outside the filter').toHaveCount(0);
});

test('G: "Nothing needs attention" is not claimed while a source has never been checked', async ({page, request}) => {
  const {sources} = (await (await request.get('/api/settings/monitoring-sources', {headers: API})).json()) as {sources: {name: string; status: string}[]};
  const neverChecked = sources.filter((source) => source.status === 'configured').map((source) => source.name);
  expect(neverChecked, 'precondition: sources never checked').toContain('endoflife.date');
  for (const match of await allMatches(request)) {
    await post(request, `/api/notice-matches/${match.id}/status`, {status: 'handled', note: 'done'});
  }
  await page.goto('/notices');
  await expect(page.getByText(/the sources were checked/), `shown although never checked: ${neverChecked.join(', ')}`).toHaveCount(0);
});

test('H: a half-filled Snooze form for one notice does not carry over to the next notice', async ({page}) => {
  await page.goto('/notices');
  await rows(page).first().click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', {name: 'Snooze'}).click();
  await drawer.getByRole('textbox', {name: 'Reason'}).fill('Reason typed for the FIRST notice');
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await rows(page).nth(1).click();
  await expect(page.getByRole('dialog').getByRole('textbox', {name: 'Reason'}), 'snooze form open on the second notice').toHaveCount(0);
});

test('I: Undo on the "Marked as reviewing" toast undoes the review, not a later assignment', async ({page, request}) => {
  const target = await matchTitled(request, 'prototype pollution');
  await page.goto('/notices');
  await rows(page).filter({hasText: 'prototype pollution'}).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', {name: 'Mark reviewing'}).click();
  await expect(toasts(page).getByText(/^Marked as reviewing:/)).toBeVisible();
  await drawer.getByRole('button', {name: 'Assign owner'}).click();
  await drawer.getByRole('button', {name: /^Owner/}).click();
  await page.getByRole('option', {name: 'Avery Quinn'}).click();
  await drawer.getByRole('button', {name: 'Assign owner'}).click();
  await expect(toasts(page).getByText('Owner assigned')).toBeVisible();
  await toastUndo(page, /^Marked as reviewing:/).click();
  await page.waitForTimeout(1500);
  const after = (await allMatches(request)).find((row) => row.id === target.id)!;
  expect({status: after.status, owner: after.assignee?.name ?? null}, 'after Undo on the review toast').toEqual({status: 'new', owner: 'Avery Quinn'});
});

test('J1: after Back, a different action on the same notice is not refused (Idempotency-Key reuse)', async ({page}) => {
  await page.goto('/notices');
  await rows(page).filter({hasText: 'prototype pollution'}).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', {name: 'Mark reviewing'}).click();
  await expect(drawer.getByText(/^Reviewing/)).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', {name: 'Mark handled'}).click();
  await page.getByRole('dialog').getByRole('textbox', {name: 'Evidence'}).fill('Upgraded lodash');
  await page.getByRole('dialog').getByRole('button', {name: 'Mark handled'}).click();
  await expect(toasts(page).getByText(/^Marked handled:/)).toBeVisible({timeout: 5000});
});

test('J2: after Back, reopening the same notice from the list and acting again is not refused', async ({page}) => {
  await page.goto('/notices');
  await rows(page).filter({hasText: 'prototype pollution'}).click();
  await page.getByRole('dialog').getByRole('button', {name: 'Mark reviewing'}).click();
  await expect(page.getByRole('dialog').getByText(/^Reviewing/)).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await rows(page).filter({hasText: 'prototype pollution'}).click();
  await page.getByRole('dialog').getByRole('button', {name: 'Assign owner'}).click();
  await page.getByRole('dialog').getByRole('button', {name: /^Owner/}).click();
  await page.getByRole('option', {name: 'Avery Quinn'}).click();
  await page.getByRole('dialog').getByRole('button', {name: 'Assign owner'}).click();
  await expect(toasts(page).getByText('Owner assigned')).toBeVisible();
  await page.keyboard.press('Escape');
  await rows(page).filter({hasText: 'prototype pollution'}).focus();
  await page.keyboard.press('r');
  await page.waitForTimeout(1000);
  await rows(page).filter({hasText: 'prototype pollution'}).click();
  await page.getByRole('dialog').getByRole('button', {name: 'Snooze'}).click();
  await page.getByRole('dialog').getByLabel('Snooze until').fill('2099-01-01');
  await page.getByRole('dialog').getByRole('textbox', {name: 'Reason'}).fill('x');
  await page.getByRole('dialog').getByRole('button', {name: 'Snooze'}).click();
  await expect(toasts(page).getByText(/^Snoozed:/)).toBeVisible();
});

test('K: a deep link to a notice that is not in the inbox explains why instead of showing nothing', async ({page}) => {
  await page.goto('/notices?notice=not-a-real-notice');
  await expect(page.getByRole('heading', {level: 1, name: 'Notices'})).toBeVisible();
  await expect(page).toHaveURL(/notice=not-a-real-notice/);
  await expect(page.getByText(/not found|no longer|could not|isn.t open|resolved/i), 'any explanation').toBeVisible({timeout: 3000});
});

test('L: at 360px the open drawer causes no horizontal page scroll and keeps its actions reachable', async ({page}) => {
  await page.setViewportSize({width: 360, height: 780});
  await page.goto('/notices');
  await expectNoHorizontalScroll(page);
  await rows(page).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoHorizontalScroll(page);
  // The drawer slides in, so wait for it to settle before measuring.
  const snooze = page.getByRole('dialog').getByRole('button', {name: 'Snooze'});
  await expect.poll(async () => {
    const box = await snooze.boundingBox();
    return box ? box.x + box.width : Infinity;
  }, {message: 'Snooze button right edge'}).toBeLessThanOrEqual(360);
});

test('M: j typed while a filter menu is open does not pull focus to the rows behind it', async ({page}) => {
  await page.goto('/notices');
  await page.getByRole('combobox', {name: 'Status'}).click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('j');
  await expect(rows(page).first(), 'focus jumped to a row with the menu open').not.toBeFocused();
});

test('N: Ctrl+click on a notice row opens it in a new tab like any link', async ({page, context}) => {
  await page.goto('/notices');
  const control = context.waitForEvent('page', {timeout: 3000}).catch(() => null);
  await page.getByRole('navigation').first().getByRole('link', {name: 'Applications'}).click({modifiers: ['Control']});
  expect(await control, 'control: Ctrl+click on a plain link opens a tab').not.toBeNull();
  const popup = context.waitForEvent('page', {timeout: 3000}).catch(() => null);
  await rows(page).first().click({modifiers: ['Control']});
  expect(await popup, 'new tab from Ctrl+click').not.toBeNull();
});

test('P: j pressed inside the open drawer keeps focus in the drawer, and r then does not act on a row behind it', async ({page, request}) => {
  await page.goto('/notices');
  await rows(page).nth(1).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', {name: 'Snooze'}).focus();
  await page.keyboard.press('j');
  await page.keyboard.press('r');
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog,[role="dialog"]'))), 'focus inside drawer').toBe(true);
  expect((await allMatches(request)).filter((row) => row.status !== 'new'), 'rows changed by r').toEqual([]);
});

test('Q: a javascript: source URL from a feed is not rendered as a live link', async ({page}) => {
  const sql = (statement: string) => execSync(`psql "${process.env.DATABASE_URL}" -Atc "${statement}"`).toString().trim();
  const where = "where title like 'Demo advisory: request%'";
  const original = sql(`select source_url from notices ${where}`);
  sql(`update notices set source_url = 'javascript:alert(document.domain)' ${where}`);
  try {
    await page.goto('/notices');
    await rows(page).filter({hasText: 'request smuggling'}).click();
    const link = page.getByRole('dialog').getByText(/View source/);
    const href = await link.evaluate((el) => el.closest('a')?.getAttribute('href') ?? null);
    expect(href ?? '', 'rendered href').not.toMatch(/^javascript:/i);
  } finally {
    sql(`update notices set source_url = '${original}' ${where}`);
  }
});

test('R: Undo that the server refuses tells the user instead of failing silently', async ({page}) => {
  await page.goto('/notices');
  await rows(page).filter({hasText: 'prototype pollution'}).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', {name: 'Mark reviewing'}).click();
  await expect(toasts(page).getByText(/^Marked as reviewing:/)).toBeVisible();
  await drawer.getByRole('button', {name: 'Snooze'}).click();
  await drawer.getByLabel('Snooze until').fill('2099-01-01');
  await drawer.getByRole('textbox', {name: 'Reason'}).fill('Vendor fix due');
  await drawer.getByRole('button', {name: 'Snooze'}).click();
  await expect(toasts(page).getByText(/^Snoozed:/)).toBeVisible();
  await toastUndo(page, /^Snoozed:/).click();
  await expect(drawer.getByText(/^Reviewing/)).toBeVisible();
  await toastUndo(page, /^Marked as reviewing:/).click();
  await page.waitForTimeout(1500);
  const status = await drawer.getByText(/^(New|Reviewing|Snoozed)/).first().textContent();
  const message = await page.getByText(/nothing to undo|not undone|could not undo/i).count();
  expect({status: status?.split(' ')[0], explained: message > 0}, 'second Undo: either works or says why').not.toEqual({status: 'Reviewing', explained: false});
});
