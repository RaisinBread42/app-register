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
  const heading = dialog.getByRole('heading', {level: 2, name: title});
  await expect(heading).toBeVisible();
  // The close control sits in the shared header, beside the title (not some other "Close" button further down).
  await expect(dialog.locator('.astryx-dialog-header').getByRole('button')).toHaveCount(1);
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

test('AC5: after a refused save, in a laptop window and on a phone, the title, the error and both buttons stay in view; the title lines up with the fields', async ({page}) => {
  for (const viewport of [{width: 1280, height: 720}, {width: 360, height: 640}]) {
    await page.setViewportSize(viewport);
    await page.goto('/applications');
    await page.getByRole('button', {name: '+ Add application'}).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', {name: 'Add application'}).click();
    await expect(dialog.getByText('Not saved')).toBeVisible();
    for (const name of ['Add application', 'Cancel']) {
      await expect(dialog.getByRole('button', {name, exact: true}), `${viewport.width}×${viewport.height}: ${name}`).toBeInViewport({ratio: 1});
    }
    await expect(dialog.getByRole('heading', {level: 2, name: 'Add application'})).toBeInViewport();
    if (viewport.width === 1280) {
      const title = (await dialog.getByRole('heading', {level: 2, name: 'Add application'}).boundingBox())!;
      const label = (await dialog.getByText('Application name', {exact: true}).first().boundingBox())!;
      expect(Math.abs(title.x - label.x), 'title and fields share one left edge').toBeLessThanOrEqual(2);
    }
    await page.keyboard.press('Escape');
  }
});

test('AC5: the notice drawer has the same close control and button styles as the dialogs', async ({page}) => {
  await page.goto('/notices');
  await page.locator('a[data-inbox-row]').first().click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', {name: 'Close', exact: true}).click();
  await expect(drawer).toHaveCount(0);
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

test('AC6: the Renewal date and Notice deadline inputs line up in the Edit form, also when one shows an error, at 768 and 1280 px', async ({page}) => {
  await page.goto(`/applications/${await appId(page, 'Ledgerline')}/edit`);
  await expect(page.locator('label', {hasText: /^Renewal date/}).first()).toBeVisible();
  // The labels sit straight above their inputs in two equal columns; equal tops mean the inputs line up.
  const box = async (label: string) => (await page.locator('label', {hasText: new RegExp(`^${label}`)}).first().boundingBox())!;
  for (const width of [1280, 768]) {
    await page.setViewportSize({width, height: 900});
    const [notice, renewal] = [await box('Notice deadline'), await box('Renewal date')];
    expect(Math.abs(notice.y - renewal.y), `${width}px: same top`).toBeLessThanOrEqual(1);
  }
  await page.getByLabel('Renewal date', {exact: true}).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('99/99/2026');
  await page.keyboard.press('Tab');
  await page.getByRole('heading', {name: 'Licence and dates'}).click();
  await expect(page.getByText(/invalid date/i).first()).toBeVisible();
  const [notice, renewal] = [await box('Notice deadline'), await box('Renewal date')];
  expect(Math.abs(notice.y - renewal.y), 'with an error under one input').toBeLessThanOrEqual(1);
  await page.reload();
  await captureAtAllWidths(page, 'edit-form');
});
