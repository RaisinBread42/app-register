import {expect, test} from '@playwright/test';

test('adding an application asks for name, type, criticality and owner; backup owner is optional', async ({page}) => {
  await page.goto('/applications');
  await page.getByRole('button', {name: '+ Add application'}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', {name: 'Application name'}).fill('Quill Notes');
  await dialog.getByRole('button', {name: /^Owner/}).click();
  await page.getByRole('option', {name: /Avery Quinn/}).click();
  await dialog.getByRole('button', {name: 'Add application'}).click();
  await expect(dialog.getByText('Choose how critical this application is.')).toBeVisible();

  await dialog.getByRole('combobox', {name: /^Criticality/}).click();
  await page.getByRole('option', {name: 'High'}).click();
  await dialog.getByRole('button', {name: 'Add application'}).click();
  await expect(page.getByRole('link', {name: 'Quill Notes'}).first()).toBeVisible();

  await page.getByRole('link', {name: 'Quill Notes'}).first().click();
  await expect(page.getByText('No backup owner')).toBeVisible();
  await expect(page.getByText('High', {exact: true})).toBeVisible();
});

test('editing an application records its environments and repository, shown on its page', async ({page}) => {
  await page.goto('/applications');
  await page.getByRole('link', {name: 'Room Booker'}).first().click();
  await page.getByRole('link', {name: /Edit/}).first().click();
  await page.getByRole('checkbox', {name: 'Production'}).check();
  await page.getByRole('textbox', {name: 'Repository'}).fill('https://git.example.test/facilities/room-booker');
  await page.getByRole('button', {name: 'Save changes'}).click();
  await expect(page.getByRole('heading', {level: 1, name: 'Room Booker'})).toBeVisible();
  await expect(page.getByText('Production', {exact: true}).first()).toBeVisible();
  await expect(page.getByRole('link', {name: 'https://git.example.test/facilities/room-booker'})).toHaveAttribute('rel', /noopener/);
});
