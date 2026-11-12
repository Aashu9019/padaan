import { db, type Bookmark, type Progress, type Settings } from './storage/db';

/**
 * Metadata-only backup: reading positions, bookmarks, edited titles and settings.
 * Books are matched by content fingerprint, so a backup restores onto the same PDFs even
 * after they were re-imported on another device (where their ids differ).
 */
export interface BackupFile {
  app: 'padaan';
  version: 1;
  exportedAt: number;
  books: Array<{
    hash: string;
    title: string;
    author?: string;
    sourceUrl?: string;
    progress?: Omit<Progress, 'bookId'>;
    bookmarks: Array<Omit<Bookmark, 'id' | 'bookId'>>;
  }>;
  settings?: Omit<Settings, 'key' | 'proxyToken'>;
}

export async function exportBackup(): Promise<BackupFile> {
  const [books, progress, bookmarks, settings] = await Promise.all([
    db.books.toArray(),
    db.progress.toArray(),
    db.bookmarks.toArray(),
    db.settings.get('app'),
  ]);
  const progressBy = new Map(progress.map((p) => [p.bookId, p]));
  let safeSettings: BackupFile['settings'];
  if (settings) {
    // The proxy token is a secret; it never leaves the device in a backup.
    const { key: _key, proxyToken: _token, ...rest } = settings;
    safeSettings = rest;
  }
  return {
    app: 'padaan',
    version: 1,
    exportedAt: Date.now(),
    books: books.map((b) => {
      const p = progressBy.get(b.id);
      return {
        hash: b.hash,
        title: b.title,
        author: b.author,
        sourceUrl: b.sourceUrl,
        progress: p ? { page: p.page, updatedAt: p.updatedAt } : undefined,
        bookmarks: bookmarks
          .filter((m) => m.bookId === b.id)
          .map(({ page, label, createdAt }) => ({ page, label, createdAt })),
      };
    }),
    settings: safeSettings,
  };
}

export class InvalidBackupError extends Error {
  readonly name = 'InvalidBackupError';
  constructor() {
    super('This file is not a Padaan backup.');
  }
}

export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new InvalidBackupError();
  }
  const file = data as Partial<BackupFile>;
  if (file?.app !== 'padaan' || file.version !== 1 || !Array.isArray(file.books)) {
    throw new InvalidBackupError();
  }
  return file as BackupFile;
}

export interface RestoreSummary {
  matched: number;
  missing: number;
}

/**
 * Applies a backup to books already on this device. Newer progress wins; bookmarks are merged
 * without duplicates. Books in the backup that aren't here are counted as missing.
 */
export async function restoreBackup(backup: BackupFile): Promise<RestoreSummary> {
  let matched = 0;
  let missing = 0;
  await db.transaction('rw', db.books, db.progress, db.bookmarks, db.settings, async () => {
    for (const entry of backup.books) {
      const book = await db.books.where('hash').equals(entry.hash).first();
      if (!book) {
        missing++;
        continue;
      }
      matched++;
      await db.books.update(book.id, { title: entry.title, author: entry.author });
      if (entry.progress) {
        const current = await db.progress.get(book.id);
        if (!current || current.updatedAt < entry.progress.updatedAt) {
          const page = Math.min(Math.max(entry.progress.page, 0), book.pageCount - 1);
          await db.progress.put({ bookId: book.id, page, updatedAt: entry.progress.updatedAt });
        }
      }
      const existing = new Set(
        (await db.bookmarks.where('bookId').equals(book.id).toArray()).map((m) => m.page),
      );
      for (const mark of entry.bookmarks) {
        if (existing.has(mark.page) || mark.page < 0 || mark.page >= book.pageCount) continue;
        existing.add(mark.page);
        await db.bookmarks.add({ ...mark, id: crypto.randomUUID(), bookId: book.id });
      }
    }
    if (backup.settings) {
      const current = await db.settings.get('app');
      await db.settings.put({
        ...backup.settings,
        key: 'app',
        proxyToken: current?.proxyToken ?? '',
      } as Settings);
    }
  });
  return { matched, missing };
}
