import { test, expect } from '@playwright/test';

test('app shell loads and works offline', async ({ page, context, browserName }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Library' })).toBeVisible();
  test.skip(browserName === 'webkit', 'Service worker offline check runs on Chromium');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Library' })).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});
