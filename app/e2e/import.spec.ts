import { test, expect } from '@playwright/test';
import { fixture } from './helpers';

test('imports PDFs, detects duplicates and rejects non-PDFs', async ({ page }) => {
  await page.goto('/add?tab=import');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Choose PDF files/ }).click();
  await (
    await chooser
  ).setFiles([fixture('small-text.pdf'), fixture('second-book.pdf'), fixture('not-a-pdf.pdf')]);

  const imports = page.getByRole('region', { name: 'Imports' });
  await expect(imports.getByText('Added — open')).toHaveCount(2, { timeout: 30_000 });
  await expect(imports.getByText('Not a PDF file.')).toBeVisible();

  const again = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Choose PDF files/ }).click();
  await (await again).setFiles([fixture('small-text.pdf')]);
  await expect(imports.getByText('Already in your library — open it')).toBeVisible({
    timeout: 30_000,
  });

  await page.goto('/');
  await expect(page.getByRole('link', { name: /The Lamp by the River/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Letters from the Orchard/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Library/ })).toContainText('2');
});

test('unlocks a password-protected PDF', async ({ page }) => {
  await page.goto('/add?tab=import');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Choose PDF files/ }).click();
  await (await chooser).setFiles([fixture('locked.pdf')]);
  const field = page.getByLabel('PDF password');
  await field.fill('wrong');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('That password didn’t work')).toBeVisible();
  await field.fill('padaan');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Added — open')).toBeVisible({ timeout: 30_000 });
});
