// Not an assertion test: captures screenshots for visual review. Run with SCREENS=1.
import { test } from '@playwright/test';
import path from 'node:path';

const fixture = (name: string) => path.join(import.meta.dirname, '..', 'tests', 'fixtures', name);

test.skip(!process.env.SCREENS, 'set SCREENS=1');

test('library screenshots', async ({ page }, info) => {
  await page.goto('/');
  await page.screenshot({ path: `test-results/screens/${info.project.name}-empty.png` });
  await page.goto('/add?tab=import');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Choose PDF files/ }).click();
  await (await chooser).setFiles([fixture('small-text.pdf'), fixture('second-book.pdf')]);
  await page.getByText('Added — open').nth(1).waitFor();
  await page.screenshot({ path: `test-results/screens/${info.project.name}-add.png` });
  await page.goto('/');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `test-results/screens/${info.project.name}-library.png` });
});

test('reader screenshots', async ({ page }, info) => {
  const { importBooks } = await import('./helpers');
  await importBooks(page, ['small-text.pdf']);
  await page.getByText('Added — open').click();
  await page.getByRole('img', { name: 'Page 1' }).waitFor();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test-results/screens/${info.project.name}-reader.png` });
});
