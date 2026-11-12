import { expect, type Page } from '@playwright/test';
import path from 'node:path';

export const fixture = (name: string) =>
  path.join(import.meta.dirname, '..', 'tests', 'fixtures', name);

/** Imports files through the add page and waits until each is on the shelf. */
export async function importBooks(page: Page, names: string[]) {
  await page.goto('/add');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Choose PDF files/ }).click();
  await (await chooser).setFiles(names.map(fixture));
  await expect(page.getByText('Added — open')).toHaveCount(names.length, { timeout: 60_000 });
}
