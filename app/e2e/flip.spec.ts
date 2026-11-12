import { test, expect, type Page } from '@playwright/test';
import { importBooks } from './helpers';

async function dragCorner(page: Page, shot?: string) {
  const box = (await page.locator('.stf__parent').boundingBox())!;
  const sx = box.x + box.width - 8;
  const sy = box.y + box.height - 12;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) {
    await page.mouse.move(sx - (box.width * 0.9 * i) / 24, sy - 60 * Math.sin((i / 24) * Math.PI));
    await page.waitForTimeout(16);
    if (shot && i === 12) await page.screenshot({ path: shot });
  }
  await page.mouse.up();
}

test.describe('page-curl', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('drag, keyboard, resume', async ({ page }, info) => {
    await importBooks(page, ['small-text.pdf']);
    await page.getByText('Added — open').click();
    const status = page.locator('p.sr-only[aria-live]');
    await expect(page.locator('.stf__parent')).toBeVisible({ timeout: 15_000 });
    await expect(status).toHaveText('Page 1 of 20');

    await page.keyboard.press('ArrowRight');
    await expect(status).toHaveText('Page 2–3 of 20');

    await page.waitForTimeout(1500); // let the keyboard flip finish
    await dragCorner(page, `test-results/screens/${info.project.name}-curl.png`);
    await expect(status).toHaveText('Page 4–5 of 20');

    await page.keyboard.press('ArrowLeft');
    await expect(status).toHaveText('Page 2–3 of 20');

    await page.waitForTimeout(700);
    await page.reload();
    await expect(status).toHaveText('Page 2–3 of 20');
  });
});

test.describe('page-curl on a phone-sized screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: false });

  test('single page curls and turns', async ({ page }, info) => {
    await importBooks(page, ['small-text.pdf']);
    await page.getByText('Added — open').click();
    const status = page.locator('p.sr-only[aria-live]');
    await expect(page.locator('.stf__parent')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await dragCorner(page, `test-results/screens/${info.project.name}-curl-phone.png`);
    await expect(status).toHaveText('Page 2 of 20');
  });
});
