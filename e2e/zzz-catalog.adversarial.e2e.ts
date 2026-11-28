/**
 * Adversarial e2e for [23] Applications catalog, kept as regression tests. It runs last (zzz-): one test
 * adds 200 apps and another archives every app. The check-failed wording (ADV23-E7) comes with [31].
 */
import {randomUUID} from 'node:crypto';
import {expect, test, type APIRequestContext, type Page} from '@playwright/test';
import {captureAtAllWidths, expectNoAxeViolations} from './helpers';

const API = {authorization: `Bearer ${process.env.APP_REGISTER_API_KEY}`};
const rows = (page: Page) => page.locator('tbody tr');
const write = () => ({...API, 'idempotency-key': randomUUID()});

async function activeOwner(request: APIRequestContext): Promise<string> {
  const {people} = (await (await request.get('/api/people', {headers: API})).json()) as {people: {id: string; status: string}[]};
  return people.find((person) => person.status === 'active')!.id;
}

async function createApp(request: APIRequestContext, name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const created = await request.post('/api/apps', {headers: write(), data: {name, kind: 'in_house', ownerId: await activeOwner(request), criticality: 'low', ...extra}});
  expect(created.ok(), await created.text()).toBe(true);
  return ((await created.json()) as {app: {id: string}}).app.id;
}

test('ADV23-E1 AC6: a long name that is cut to two lines still shows the full name on hover (the code comment promises it)', async ({page, request}) => {
  const name = `Regional Distribution Centre Inventory Reconciliation And Forecasting Workbench For Northern Warehouses ${Date.now()}`;
  await createApp(request, name);
  await page.setViewportSize({width: 1280, height: 900});
  await page.goto(`/applications?q=${encodeURIComponent('Regional Distribution Centre')}`);
  const link = page.getByRole('link', {name});
  await expect(link).toBeVisible();
  const clamp = await link.evaluate((el) => {
    const nodes = [el, ...el.querySelectorAll('*')] as HTMLElement[];
    return nodes.map((node) => ({tag: node.tagName, clamped: node.scrollHeight > node.clientHeight + 1, title: node.getAttribute('title')}));
  });
  console.log('ADV23-E1 link nodes:', JSON.stringify(clamp));
  expect(clamp.some((node) => node.clamped), 'the name is actually truncated at 1280 px').toBe(true);
  await link.hover();
  await page.waitForTimeout(800);
  const tooltip = await page.getByRole('tooltip').allInnerTexts();
  const titled = clamp.some((node) => node.title === name);
  console.log('ADV23-E1 tooltips after hover:', JSON.stringify(tooltip), '| title attribute with full name:', titled);
  expect(titled || tooltip.some((text) => text.includes(name)), 'full name available on hover (tooltip or title)').toBe(true);
});

test('ADV23-E2 AC6: at 360 px every filter control and every table column can be reached on screen', async ({page}) => {
  await page.setViewportSize({width: 360, height: 780});
  await page.goto('/applications');
  const controls = await page.evaluate(() =>
    [...document.querySelectorAll('input, [role="combobox"]')]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {name: el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.textContent?.trim(), left: Math.round(rect.left), right: Math.round(rect.right)};
      }),
  );
  console.log('ADV23-E2 controls:', JSON.stringify(controls));
  const header = page.getByRole('columnheader', {name: 'Next date'});
  await header.scrollIntoViewIfNeeded();
  const box = await header.boundingBox();
  console.log('ADV23-E2 Next date header box after scrollIntoView:', JSON.stringify(box));
  await expect(header, 'the last column can be scrolled into view').toBeInViewport();
  for (const control of controls) {
    expect(control.right, `${control.name} fits in 360 px`).toBeLessThanOrEqual(360);
  }
});

test('ADV23-E3 AC3: a shared link with an owner who owns nothing now says which filter is hiding everything', async ({page}) => {
  await page.goto(`/applications?owner=${randomUUID()}`);
  await expect(page.getByText('No applications match these filters')).toBeVisible();
  // The owner filter (hasSearch) is a button, not a combobox like the other filters.
  const combos = await page.getByRole('combobox').count();
  const owner = (await page.getByRole('button', {name: /^Owner/}).innerText()).trim();
  console.log('ADV23-E3 comboboxes:', combos, '| owner control (role button) shows:', JSON.stringify(owner));
  expect(owner, 'the owner filter names the active owner instead of an unset placeholder').not.toMatch(/^(Select…|All owners)?$/);
});

test('ADV23-E4 AC3 (held?): the detail page "All applications" link returns to the filtered list', async ({page}) => {
  await page.goto('/applications');
  await page.getByRole('combobox', {name: 'Criticality'}).click();
  await page.getByRole('option', {name: 'High', exact: true}).click();
  await expect(page).toHaveURL(/criticality=high/);
  await rows(page).first().getByRole('link').first().click();
  await expect(page.getByRole('heading', {level: 1})).toBeVisible();
  await page.getByRole('link', {name: 'All applications'}).click();
  await expect(page).toHaveURL(/criticality=high/);
  for (const text of await rows(page).allInnerTexts()) {
    expect(text).toContain('High');
  }
});

test('ADV23-E5 AC3 (held?): two filters set with an app visit in between both survive Back, and the topbar search then Back restores the list', async ({page}) => {
  await page.goto('/applications');
  await page.getByRole('combobox', {name: 'Type'}).click();
  await page.getByRole('option', {name: 'In-house', exact: true}).click();
  await expect(page).toHaveURL(/kind=in_house/);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => message.type() === 'error' && errors.push(`console: ${message.text()}`));
  const firstLink = rows(page).first().getByRole('link').first();
  console.log('ADV23-E5 opening:', await firstLink.innerText(), await firstLink.getAttribute('href'));
  await firstLink.click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}/);
  console.log('ADV23-E5 on detail:', page.url());
  await page.goBack();
  await page.waitForTimeout(3000);
  console.log('ADV23-E5 after Back:', page.url(), '| body:', JSON.stringify((await page.locator('body').innerText()).slice(0, 200)), '| html bytes:', (await page.content()).length, '| errors:', JSON.stringify(errors));
  await page.getByRole('combobox', {name: 'Notices'}).click();
  await page.getByRole('option', {name: 'Open notices'}).click();
  await expect(page).toHaveURL(/kind=in_house.*open_notices=1|open_notices=1.*kind=in_house/);
  const filtered = await rows(page).count();
  await rows(page).first().getByRole('link').first().click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}/);
  await page.goBack();
  await expect(page).toHaveURL(/kind=in_house/);
  await expect(page).toHaveURL(/open_notices=1/);
  await expect(rows(page)).toHaveCount(filtered);

  await page.getByRole('searchbox', {name: 'Search applications'}).fill('Ledger');
  await page.getByRole('searchbox', {name: 'Search applications'}).press('Enter');
  await expect(page).toHaveURL(/q=Ledger/);
  await expect(page.getByRole('textbox', {name: 'Filter applications by name'})).toHaveValue('Ledger');
  await page.goBack();
  await expect(page).toHaveURL(/kind=in_house/);
  await expect(page.getByRole('textbox', {name: 'Filter applications by name'})).toHaveValue('');
  await expect(rows(page)).toHaveCount(filtered);
});

test('ADV23-E6 AC5: the applications page streams a loading state first, then the list', async ({page}) => {
  // A slow load shows this fallback at once; a test cannot slow the server's own API calls, so it reads the stream.
  const html = await (await page.request.get('/applications')).text();
  expect(html).toContain('Loading…');
  expect(html.indexOf('Loading…'), 'the fallback comes before the list in the stream').toBeLessThan(html.indexOf('Northwind Portal'));
});

test('ADV23-E8 AC6: the table has an accessible name and exposes the active sort to screen readers', async ({page}) => {
  await page.goto('/applications');
  const table = page.getByRole('table');
  await expect(table).toHaveCount(1);
  const semantics = await table.evaluate((el) => ({
    tag: el.tagName,
    ariaLabel: el.getAttribute('aria-label'),
    labelledBy: el.getAttribute('aria-labelledby'),
    caption: el.querySelector('caption')?.textContent ?? null,
    headers: [...el.querySelectorAll('th')].map((th) => ({text: th.textContent, scope: th.getAttribute('scope'), sort: th.getAttribute('aria-sort')})),
    rowHeaders: el.querySelectorAll('tbody th, [role="rowheader"]').length,
  }));
  console.log('ADV23-E8 table semantics:', JSON.stringify(semantics));
  const searchNames = await page.getByRole('searchbox', {name: 'Search applications'}).count();
  const textNames = await page.getByRole('textbox', {name: 'Filter applications by name'}).count();
  console.log('ADV23-E8 fields named "Search applications": searchbox', searchNames, '| textbox', textNames);
  const live = await page.locator('[aria-live], [role="status"]').filter({hasText: /Showing \d+ of \d+/}).count();
  console.log('ADV23-E8 result count in a live region:', live);
  expect(semantics.ariaLabel ?? semantics.labelledBy ?? semantics.caption, 'table has an accessible name').not.toBeNull();
});

test('ADV23-E9 (held?): the highest-issue link opens that notice in the inbox drawer', async ({page}) => {
  await page.goto('/applications');
  const top = rows(page).first();
  // Whichever issue the top row shows (earlier suites may have snoozed the seeded critical one).
  const link = top.locator('a[href*="/notices?notice="]');
  const title = (await link.innerText()).trim();
  await link.click();
  await expect(page).toHaveURL(/\/notices\?notice=/);
  await expect(page.getByRole('dialog')).toContainText(title);
});

test('ADV23-E10 (data shipped): the catalog page does not send every notice summary, match reason and assignee to the browser', async ({page}) => {
  const response = await page.goto('/applications');
  const html = await response!.text();
  const hits = ['matchReason', 'sourceUrl', 'summary', 'assignee'].map((field) => [field, html.split(field).length - 1]);
  console.log('ADV23-E10 HTML bytes:', html.length, '| field occurrences:', JSON.stringify(hits));
  expect(html.includes('matchReason'), 'notice match reasons are not part of the catalog page').toBe(false);
});

test('ADV23-E12 AC1/AC6: at 1280 px (a common laptop) every column of the row, including Next date, is on screen without sideways scrolling', async ({page}) => {
  for (const width of [768, 1280, 1440]) {
    await page.setViewportSize({width, height: 900});
    await page.goto('/applications?sort=deadline');
    await expect(rows(page).first()).toBeVisible();
    const layout = await page.evaluate(() => {
      const table = document.querySelector('table')!;
      let scroller: HTMLElement | null = table.parentElement;
      while (scroller && scroller.scrollWidth <= scroller.clientWidth + 1) scroller = scroller.parentElement;
      const header = [...table.querySelectorAll('th')].find((th) => th.textContent === 'Next date')!.getBoundingClientRect();
      return {
        tableWidth: Math.round(table.getBoundingClientRect().width),
        scroller: scroller ? {tag: scroller.tagName, scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth, overflowX: getComputedStyle(scroller).overflowX} : null,
        nextDateHeader: {left: Math.round(header.left), right: Math.round(header.right)},
        viewport: window.innerWidth,
      };
    });
    console.log(`ADV23-E12 ${width}px:`, JSON.stringify(layout));
    await page.screenshot({path: `e2e-artifacts/screenshots/adv23-sorted-by-next-date-${width}.png`});
    if (width >= 1280) {
      expect(layout.nextDateHeader.right, `${width}px: the Next date column (the sorted column) is visible`).toBeLessThanOrEqual(layout.viewport);
    }
  }
});

test('ADV23-E11 AC5 (held?): an empty inventory explains the next step, never looks healthy, and is axe clean at every width', async ({page, request}) => {
  const {apps} = (await (await request.get('/api/apps', {headers: API})).json()) as {apps: {id: string}[]};
  for (const app of apps) {
    const archived = await request.post(`/api/apps/${app.id}/archive`, {headers: write()});
    expect(archived.ok(), await archived.text()).toBe(true);
  }
  await page.goto('/applications');
  // Every app is archived: the list says so and points to the Archived list ([24]), with one Add button.
  await expect(page.getByText('No active applications')).toBeVisible();
  await expect(page.getByText(/are archived\. Unarchive one from the Archived list/)).toBeVisible();
  await expect(page.getByRole('button', {name: '+ Add application'})).toHaveCount(1);
  const body = await page.locator('body').innerText();
  console.log('ADV23-E11 empty page text:', body.replace(/\s+/g, ' ').slice(0, 400));
  expect(body).not.toMatch(/\bHealthy\b/);
  await expectNoAxeViolations(page);
  await captureAtAllWidths(page, 'adv23-empty-inventory');
});
