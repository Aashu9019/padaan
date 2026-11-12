// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Book } from './storage/db';
import { exportBackup, InvalidBackupError, parseBackup, restoreBackup } from './backup';
import { DEFAULT_SETTINGS } from './storage/settings';

const book = (id: string, hash: string): Book => ({
  id,
  hash,
  title: `Book ${id}`,
  pageCount: 50,
  sizeBytes: 1000,
  source: 'import',
  blobKey: `b-${id}`,
  coverKey: `c-${id}`,
  pageAspect: 0.7,
  hasOutline: false,
  addedAt: 1,
});

beforeEach(async () => {
  await Promise.all([
    db.books.clear(),
    db.progress.clear(),
    db.bookmarks.clear(),
    db.settings.clear(),
  ]);
});

describe('backup', () => {
  it('round-trips progress, bookmarks and titles by hash, without the proxy token', async () => {
    await db.books.add({ ...book('a', 'h1'), title: 'Renamed' });
    await db.progress.put({ bookId: 'a', page: 12, updatedAt: 100 });
    await db.bookmarks.add({ id: 'm1', bookId: 'a', page: 3, createdAt: 5, label: 'Start' });
    await db.settings.put({ ...DEFAULT_SETTINGS, theme: 'sepia', proxyToken: 'secret' });

    const text = JSON.stringify(await exportBackup());
    expect(text).not.toContain('secret');

    // Fresh device: same PDF imported again under a new id.
    await Promise.all([
      db.books.clear(),
      db.progress.clear(),
      db.bookmarks.clear(),
      db.settings.clear(),
    ]);
    await db.books.add(book('z', 'h1'));
    await db.settings.put({ ...DEFAULT_SETTINGS, proxyToken: 'local' });

    const summary = await restoreBackup(parseBackup(text));
    expect(summary).toEqual({ matched: 1, missing: 0 });
    expect((await db.books.get('z'))?.title).toBe('Renamed');
    expect((await db.progress.get('z'))?.page).toBe(12);
    expect(await db.bookmarks.where('bookId').equals('z').count()).toBe(1);
    const settings = await db.settings.get('app');
    expect(settings?.theme).toBe('sepia');
    expect(settings?.proxyToken).toBe('local');

    // Restoring twice doesn't duplicate bookmarks.
    await restoreBackup(parseBackup(text));
    expect(await db.bookmarks.where('bookId').equals('z').count()).toBe(1);
  });

  it('keeps newer local progress and counts missing books', async () => {
    await db.books.add(book('a', 'h1'));
    await db.progress.put({ bookId: 'a', page: 30, updatedAt: 500 });
    const summary = await restoreBackup({
      app: 'padaan',
      version: 1,
      exportedAt: 0,
      books: [
        { hash: 'h1', title: 'Book a', progress: { page: 2, updatedAt: 100 }, bookmarks: [] },
        { hash: 'nope', title: 'Gone', bookmarks: [] },
      ],
    });
    expect(summary).toEqual({ matched: 1, missing: 1 });
    expect((await db.progress.get('a'))?.page).toBe(30);
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow(InvalidBackupError);
    expect(() => parseBackup('not json')).toThrow(InvalidBackupError);
  });
});
