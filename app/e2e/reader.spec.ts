import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fixture, importBooks } from './helpers';

test('reads, resumes on the same page, and opens offline', async ({
  page,
  context,
  browserName,
}) => {
  await importBooks(page, ['small-text.pdf']);
  await page.getByText('Added — open').click();
  await expect(page.getByRole('img', { name: 'Page 1' })).toBeVisible({ timeout: 15_000 });

  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(900); // let each page turn finish
  }
  const status = page.locator('[aria-live="polite"]').filter({ hasText: /^Page/ });
  const before = await status.textContent();
  expect(before).not.toBe('Page 1 of 20');
  await page.waitForTimeout(700); // progress write is debounced

  await page.reload();
  await expect(status).toHaveText(before!);

  test.skip(browserName === 'webkit', 'offline via service worker checked on Chromium');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(status).toHaveText(before!);
  await expect(page.locator('img[alt^="Page"]:visible').first()).toBeVisible();
});

test('opens a 1,000-page book quickly', async ({ page }) => {
  test.skip(!existsSync(fixture('large-1000.pdf')), 'run make_fixtures.py --large');
  await importBooks(page, ['large-1000.pdf']);
  const started = Date.now();
  await page.getByText('Added — open').click();
  await expect(page.getByRole('img', { name: 'Page 1' })).toBeVisible({ timeout: 10_000 });
  const elapsed = Date.now() - started;
  console.log(`first page in ${elapsed} ms`);
  expect(elapsed).toBeLessThan(2000);
  await page.keyboard.press('End');
  await expect(page.locator('p.sr-only[aria-live]')).toHaveText('Page 1000 of 1000', {
    timeout: 10_000,
  });
  await expect(page.getByRole('img', { name: 'Page 1000' })).toBeAttached({ timeout: 10_000 });
});
