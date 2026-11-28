import {randomUUID} from 'node:crypto';
import {expect, test, type APIRequestContext, type Page} from '@playwright/test';
import {expectNoAxeViolations, expectNoHorizontalScroll} from './helpers';

/** Adversarial review of [24], kept as regression tests: Add with the essentials, setup checklist, archive with Undo, unarchive. */

const API = {authorization: `Bearer ${process.env.APP_REGISTER_API_KEY}`};
const SHOTS = process.env.ADV_SHOTS_DIR ?? 'e2e-artifacts/screenshots';

async function post(request: APIRequestContext, path: string, data?: unknown) {
  const response = await request.post(path, {headers: {...API, 'idempotency-key': randomUUID()}, data});
  expect(response.status(), `${path} ${await response.text()}`).toBeLessThan(300);
  return response.json();
}

async function activeOwnerId(request: APIRequestContext): Promise<string> {
  const {people} = (await (await request.get('/api/people', {headers: API})).json()) as {people: {id: string; name: string; status: string}[]};
  return people.find((person) => person.status === 'active' && person.name.startsWith('Avery'))!.id;
}

async function newApp(request: APIRequestContext, name: string, extra: Record<string, unknown> = {}) {
  return (await post(request, '/api/apps', {name, kind: 'in_house', criticality: 'low', ownerId: await activeOwnerId(request), ...extra})).app as {id: string};
}

async function readApp(request: APIRequestContext, id: string): Promise<{archivedAt: string | null}> {
  return (await (await request.get(`/api/apps/${id}`, {headers: API})).json()).app;
}

const toasts = (page: Page) => page.getByRole('region', {name: 'Notifications'});

async function archiveFromPage(page: Page, id: string) {
  await page.goto(`/applications/${id}`);
  await page.getByRole('button', {name: 'Archive', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Archive application'}).click();
  await expect(page).toHaveURL(/\/applications$/);
}

async function addByMouse(page: Page, name: string) {
  await page.getByRole('button', {name: '+ Add application'}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', {name: 'Application name'}).fill(name);
  await dialog.getByRole('combobox', {name: /^Criticality/}).click();
  await page.getByRole('option', {name: 'High'}).click();
  await dialog.getByRole('button', {name: /^Owner/}).click();
  await page.getByRole('option', {name: /Avery Quinn/}).click();
  await dialog.getByRole('button', {name: 'Add application'}).click();
  return dialog;
}

async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'BODY';
    return `${el.tagName.toLowerCase()}[role=${el.getAttribute('role') ?? ''}] "${(el.getAttribute('aria-label') ?? el.innerText ?? '').trim().slice(0, 40)}"`;
  });
}

test('ADV-E1 AC4: the Undo offered after archiving is still there 7 s later (not an auto-hiding info toast)', async ({page, request}) => {
  const app = await newApp(request, `Adv Undo Timer ${Date.now()}`);
  await archiveFromPage(page, app.id);
  const undo = toasts(page).getByRole('button', {name: 'Undo'});
  await expect(undo).toBeVisible();
  await expectNoAxeViolations(page);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(7000);
  const count = await undo.count();
  console.log('ADV-E1 Undo buttons 7 s after archiving:', count);
  expect(count, 'Undo still offered 7 s after archiving').toBeGreaterThan(0);
});

test('ADV-E2 AC4: "<name> is active again" is only said when the app is active (second Undo after it was archived again)', async ({page, request}) => {
  const name = `Adv Undo Twice ${Date.now()}`;
  const app = await newApp(request, name);
  await archiveFromPage(page, app.id);
  const undo = toasts(page).getByRole('button', {name: 'Undo'}).first();
  await undo.click();
  await expect(page.getByText(`${name} is active again`).first()).toBeVisible();
  expect((await readApp(request, app.id)).archivedAt).toBeNull();

  // Meanwhile it is archived again (another tab, a colleague, the API); the first toast is still on screen.
  await post(request, `/api/apps/${app.id}/archive`);
  await undo.click();
  // The repeated Undo replays the earlier answer: the page says the app was archived again instead of "active again".
  await expect(page.getByText(/archived again/).first()).toBeVisible();
  expect((await readApp(request, app.id)).archivedAt, 'still archived, as the page says').not.toBeNull();
});

test('ADV-E3 AC5: the whole Add flow by keyboard alone (Tab to Add, Enter), through the criticality error', async ({page}) => {
  const name = `Adv Keyboard ${Date.now()}`;
  await page.goto('/applications');
  await page.getByRole('button', {name: '+ Add application'}).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  const addButton = dialog.getByRole('button', {name: 'Add application'});
  await expect(dialog.getByRole('textbox', {name: /^Application name/})).toBeFocused();
  await page.keyboard.type(name);

  const stops: string[] = [];
  const tabTo = async (isTarget: () => Promise<boolean>, key = 'Tab') => {
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press(key);
      stops.push(await focused(page));
      if (await isTarget()) return true;
    }
    return false;
  };
  const isFocused = (locator: ReturnType<Page['locator']>) => () => locator.evaluate((el) => el === document.activeElement).catch(() => false);

  expect(await tabTo(isFocused(addButton)), 'Tab reaches Add application').toBe(true);
  console.log('ADV-E3 tab stops name → Add:', stops);
  await page.keyboard.press('Enter');
  await expect(dialog.getByText(/^Criticality: choose/).first()).toBeVisible();
  const criticality = dialog.getByRole('combobox', {name: /^Criticality/});
  console.log('ADV-E3 after the error: focus =', await focused(page), '| criticality aria-invalid =', await criticality.getAttribute('aria-invalid'), '| aria-describedby =', await criticality.getAttribute('aria-describedby'));
  const announced = await page.evaluate((text) =>
    [...document.querySelectorAll('[role="alert"], [aria-live="assertive"], [aria-live="polite"], [role="status"]')].some((el) => el.textContent?.includes(text)),
  'Criticality: choose');
  const describedBy = (await criticality.getAttribute('aria-describedby')) ?? '';
  const describesError = await page.evaluate((ids) => ids.split(' ').some((id) => document.getElementById(id)?.textContent?.includes('Criticality: choose')), describedBy);
  console.log('ADV-E3 error in a live region:', announced, '| criticality described by the error:', describesError);
  expect.soft(announced || describesError, 'the criticality error is announced or tied to its field').toBe(true);

  stops.length = 0;
  expect(await tabTo(isFocused(criticality), 'Shift+Tab'), 'Shift+Tab reaches Criticality').toBe(true);
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  console.log('ADV-E3 criticality chosen by keyboard:', await criticality.innerText());
  const owner = dialog.getByRole('button', {name: /^Owner/});
  expect(await tabTo(isFocused(owner)), 'Tab reaches Owner').toBe(true);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Avery');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  stops.length = 0;
  expect(await tabTo(isFocused(addButton)), 'Tab reaches Add application again').toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', {level: 1, name})).toBeVisible();
  console.log('ADV-E3 focus on the new app page:', await focused(page));
});

test('ADV-E4 AC5: a name already in use is refused naming the field and how to fix it', async ({page, request}) => {
  const name = `Adv Duplicate ${Date.now()}`;
  await newApp(request, name);
  await page.goto('/applications');
  const dialog = await addByMouse(page, name);
  await expect(dialog.getByText(/already has this name/)).toBeVisible();
  const message = (await dialog.getByText(/already has this name/).innerText()).trim();
  console.log('ADV-E4 duplicate-name message:', JSON.stringify(message));
  expect.soft(message, 'names the field').toMatch(/application name/i);
  expect.soft(message, 'says how to fix it').toMatch(/choose|pick|use another|different|rename|unarchive/i);
});

test('ADV-E5 AC4: Unarchive in the Archived list by keyboard keeps focus on the page (not dropped to body)', async ({page, request}) => {
  const name = `Adv Focus ${Date.now()}`;
  const app = await newApp(request, name);
  await post(request, `/api/apps/${app.id}/archive`);
  await page.goto('/applications?state=archived');
  const row = page.locator('tbody tr').filter({hasText: name});
  await row.getByRole('button', {name: 'Unarchive'}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(`${name} is active again`).first()).toBeVisible();
  await expect(row).toHaveCount(0);
  const where = await focused(page);
  console.log('ADV-E5 focus after Unarchive:', where);
  expect(where, 'focus after the row left').not.toBe('BODY');
});

test('ADV-E6 360 px: the setup checklist and the Archived list fit (no page scroll), axe clean on both and on an archived app', async ({page, request}) => {
  const name = `Adv Narrow Checklist With A Long Name ${Date.now()}`;
  const app = await newApp(request, name);
  const archivedName = `Adv Narrow Archived ${Date.now()}`;
  const archived = await newApp(request, archivedName);
  await post(request, `/api/apps/${archived.id}/archive`);

  await page.setViewportSize({width: 360, height: 780});
  await page.goto(`/applications/${app.id}`);
  await expect(page.getByRole('heading', {name: 'Set up monitoring'})).toBeVisible();
  await page.screenshot({path: `${SHOTS}/adv24-checklist-360.png`, fullPage: true});
  await expectNoHorizontalScroll(page);

  await page.goto('/applications?state=archived');
  await expect(page.locator('tbody tr').filter({hasText: archivedName})).toHaveCount(1);
  await page.screenshot({path: `${SHOTS}/adv24-archived-360.png`, fullPage: true});
  await expectNoHorizontalScroll(page);
  const unarchiveBox = await page.locator('tbody tr').filter({hasText: archivedName}).getByRole('button', {name: 'Unarchive'}).boundingBox();
  console.log('ADV-E6 Unarchive button box at 360 px:', unarchiveBox);
  expect.soft(unarchiveBox && unarchiveBox.x + unarchiveBox.width <= 360, 'Unarchive visible without scrolling the table').toBe(true);

  await page.setViewportSize({width: 1280, height: 900});
  await expectNoAxeViolations(page);
  await page.goto(`/applications/${archived.id}`);
  await expect(page.getByRole('button', {name: 'Unarchive'})).toBeVisible();
  await expectNoAxeViolations(page);
});

test('ADV-E7 Archived list: a search that matches none says so, not "No archived applications"', async ({page, request}) => {
  const app = await newApp(request, `Adv Search Archived ${Date.now()}`);
  await post(request, `/api/apps/${app.id}/archive`);
  await page.goto('/applications?state=archived&q=zz-no-such-app-zz');
  await expect(page.getByRole('combobox', {name: 'Status'})).toBeVisible();
  const text = await page.locator('body').innerText();
  console.log('ADV-E7 empty state shown:', text.includes('No archived applications') ? '"No archived applications"' : 'other');
  expect.soft(text, 'claims there are no archived applications while some exist').not.toContain('No archived applications');
});

test('ADV-E8 AC1: after adding one app, Back to the list and adding a second one creates the second app', async ({page, request}) => {
  const stamp = Date.now();
  const first = `Adv Back First ${stamp}`;
  const second = `Adv Back Second ${stamp}`;
  await page.goto('/applications');
  await addByMouse(page, first);
  await expect(page.getByRole('heading', {level: 1, name: first})).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/applications(\?.*)?$/);
  await addByMouse(page, second);
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', {level: 1})).not.toHaveText('Applications');
  const heading = await page.getByRole('heading', {level: 1}).innerText();
  const {apps} = (await (await request.get('/api/apps', {headers: API})).json()) as {apps: {name: string}[]};
  console.log('ADV-E8 landed on:', heading, '| second app exists:', apps.some((row) => row.name === second));
  expect(apps.some((row) => row.name === second), 'second app created').toBe(true);
  expect(heading).toBe(second);
});

test('ADV-E9 unarchive refused because the name is in use: the message says how to fix it', async ({page, request}) => {
  const name = `Adv Reused ${Date.now()}`;
  const old = await newApp(request, name);
  await post(request, `/api/apps/${old.id}/archive`);
  await newApp(request, name);
  await page.goto('/applications?state=archived');
  await page.locator('tbody tr').filter({hasText: name}).getByRole('button', {name: 'Unarchive'}).click();
  const toast = toasts(page).getByText(/Could not unarchive/);
  await expect(toast).toBeVisible();
  const message = (await toast.innerText()).trim();
  console.log('ADV-E9 unarchive refused:', JSON.stringify(message));
  expect.soft(message, 'says how to fix it').toMatch(/rename|choose|different|another/i);
});

test('ADV-E10 archive → Undo → browser Back to the app page → Archive again really archives it (no stale Idempotency-Key)', async ({page, request}) => {
  const name = `Adv Back Archive ${Date.now()}`;
  const app = await newApp(request, name);
  await page.goto('/applications');
  await page.goto(`/applications/${app.id}`);
  await page.getByRole('button', {name: 'Archive', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Archive application'}).click();
  await expect(page).toHaveURL(/\/applications$/);
  await toasts(page).getByRole('button', {name: 'Undo'}).first().click();
  await expect(page.getByText(`${name} is active again`).first()).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', {level: 1, name})).toBeVisible();
  await page.getByRole('button', {name: 'Archive', exact: true}).click();
  await page.getByRole('alertdialog').getByRole('button', {name: 'Archive application'}).click();
  await expect(page).toHaveURL(/\/applications$/);
  const after = await readApp(request, app.id);
  console.log('ADV-E10 after the second Archive: archivedAt =', after.archivedAt);
  expect(after.archivedAt, 'archived after the UI said "archived"').not.toBeNull();
});
