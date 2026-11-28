import {expect, test, type Page} from '@playwright/test';
import {captureAtAllWidths, expectNoAxeViolations} from './helpers';

/** [30] One dialog layout, a long form keeps its title in view, reduced motion, and aligned date fields. */

const API = {authorization: `Bearer ${process.env.APP_REGISTER_API_KEY}`};

async function appId(page: Page, name: string): Promise<string> {
  const {apps} = (await (await page.request.get('/api/apps', {headers: API})).json()) as {apps: {id: string; name: string}[]};
  return apps.find((app) => app.name === name)!.id;
}

/** Opens a dialog from its button, then checks the shared layout: titled heading, a close control, axe, Escape and focus return. */
async function checkDialog(page: Page, opener: ReturnType<Page['getByRole']>, title: string) {
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', {level: 2, name: title})).toBeVisible();
  await expect(dialog.getByRole('button', {name: /close/i}).first()).toBeVisible();
  // Check contrast once the dialog has finished fading in, not halfway through.
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
}

test('AC5: every dialog has the same layout (title, close control), passes axe, closes on Escape and returns focus to its opener', async ({page}) => {
  await page.goto('/applications');
  await checkDialog(page, page.getByRole('button', {name: '+ Add application'}), 'Add application');

  await page.goto('/settings?section=people');
  await checkDialog(page, page.getByRole('button', {name: '+ Add person'}), 'Add person');

  await page.goto('/settings?section=api-keys');
  await checkDialog(page, page.getByRole('button', {name: 'Create API key'}), 'Create API key');

  const portal = await appId(page, 'Northwind Portal');
  await page.goto(`/applications/${portal}?tab=dependencies`);
  await checkDialog(page, page.getByRole('button', {name: 'Add dependency'}), 'Add dependency');
  await page.goto(`/applications/${portal}?tab=hosting`);
  await checkDialog(page, page.getByRole('button', {name: 'Add hosting'}), 'Add hosting');

  await page.goto('/notices');
  await checkDialog(page, page.getByRole('button', {name: 'Keyboard shortcuts'}), 'Keyboard shortcuts');
});

test('AC5: in a short window a long dialog keeps its title and buttons in view while its fields scroll', async ({page}) => {
  await page.setViewportSize({width: 1280, height: 520});
  await page.goto('/applications');
  await page.getByRole('button', {name: '+ Add application'}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', {name: 'Category'}).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('heading', {level: 2, name: 'Add application'})).toBeInViewport();
  await expect(dialog.getByRole('button', {name: 'Add application'})).toBeInViewport();
  await page.screenshot({path: 'e2e-artifacts/screenshots/dialog-add-application-520h.png'});
});

test('AC4: with reduced motion the notice drawer appears without animating', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto('/notices');
  await page.locator('a[data-inbox-row]').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // Two frames on, an animation cut short by reduced motion has ended; a normal slide (about 200 ms) would still run.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  // Colour fades on hover are not motion; anything that moves or fades the drawer in would be.
  const moving = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.playState === 'running')
      .filter((animation) => !(animation instanceof CSSTransition) || /transform|translate|opacity|inset|left|right|top|bottom/.test(animation.transitionProperty))
      .map((animation) => (animation instanceof CSSTransition ? animation.transitionProperty : (animation as CSSAnimation).animationName)),
  );
  expect(moving).toEqual([]);
});

test('AC6: the Renewal date and Notice deadline inputs line up in the Edit form', async ({page}) => {
  await page.goto(`/applications/${await appId(page, 'Ledgerline')}/edit`);
  const box = async (label: string) => (await page.getByLabel(label, {exact: true}).boundingBox())!;
  const [notice, renewal] = [await box('Notice deadline'), await box('Renewal date')];
  expect(Math.abs(notice.y + notice.height - (renewal.y + renewal.height))).toBeLessThanOrEqual(1);
  await captureAtAllWidths(page, 'edit-form');
});
