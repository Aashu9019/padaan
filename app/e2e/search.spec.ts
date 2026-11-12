// Hits the real Open Library / Internet Archive APIs. Skip with NO_NETWORK=1.
import { test, expect } from '@playwright/test';

test.skip(!!process.env.NO_NETWORK, 'needs internet');

test('searches free sources and downloads a book', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/add');
  await page.getByPlaceholder(/Title or author/).fill('pride and prejudice austen');
  const ia = page.getByRole('region', { name: 'Internet Archive' });
  await expect(ia.getByRole('button').first()).toBeVisible({ timeout: 30_000 });
  await ia.getByRole('button').first().click();
  await page.getByRole('button', { name: 'Download' }).click();
  page.on('console', (m) => console.log('console:', m.text()));
  const downloads = page.getByRole('region', { name: 'Downloads' });
  await expect(downloads.getByText(/Added — open|Already in your library|alert/))
    .toBeVisible({
      timeout: 150_000,
    })
    .catch(async (e) => {
      console.log('downloads:', await downloads.innerText().catch(() => 'none'));
      throw e;
    });
  await downloads.getByRole('link').first().click();
  await expect(page.getByRole('img', { name: 'Page 1' })).toBeVisible({ timeout: 20_000 });
});

test('explains when a pasted link is a web page', async ({ page }) => {
  await page.goto('/add?tab=link');
  await page.getByRole('textbox').fill('https://archive.org/metadata/prideprejudice00aust');
  await page.getByRole('button', { name: 'Download' }).click();
  await expect(page.getByRole('region', { name: 'Downloads' }).getByRole('alert')).toBeVisible({
    timeout: 30_000,
  });
});

test('downloads a pasted direct PDF link', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/add?tab=link');
  await page
    .getByRole('textbox')
    .fill('https://ia800609.us.archive.org/7/items/prideprejudice00aust/prideprejudice00aust.pdf');
  await page.getByRole('button', { name: 'Download' }).click();
  await expect(
    page
      .getByRole('region', { name: 'Downloads' })
      .getByText(/Added — open|Already in your library/),
  ).toBeVisible({ timeout: 150_000 });
});
