import { db, type Book, type BookSource } from './storage/db';
import { ensureSpaceFor, getBlobStore, type BlobStore } from './storage/blob-store';
import { requestPersistence } from './storage/persist';
import { fingerprint } from './hash';
import { looksLikePdf, openPdf, PdfPasswordError, type OpenedPdf } from './pdf/pdfjs';
import { readPdfInfo, renderCover, titleFromFileName } from './pdf/metadata';

export class NotPdfError extends Error {
  readonly name = 'NotPdfError';
  constructor(message = 'This file is not a PDF.') {
    super(message);
  }
}

export interface BookOrigin {
  source: BookSource;
  sourceUrl?: string;
  sourceId?: string;
  /** Used when the PDF has no usable title metadata. */
  fallbackTitle: string;
  fallbackAuthor?: string;
}

export type AddResult = { status: 'added'; book: Book } | { status: 'duplicate'; book: Book };

export type PasswordProvider = (incorrect: boolean) => Promise<string | null>;

function newId(): string {
  return crypto.randomUUID();
}

/** Opens the PDF, asking for a password as long as the user keeps supplying one. */
async function openWithPassword(blob: Blob, askPassword?: PasswordProvider): Promise<OpenedPdf> {
  let password: string | undefined;
  for (;;) {
    try {
      return await openPdf(blob, password);
    } catch (error) {
      if (!(error instanceof PdfPasswordError) || !askPassword) throw error;
      const answer = await askPassword(error.incorrect);
      if (answer === null) throw error;
      password = answer;
    }
  }
}

async function buildBook(
  store: BlobStore,
  blob: Blob,
  blobKey: string,
  hash: string,
  origin: BookOrigin,
  askPassword: PasswordProvider | undefined,
): Promise<Book> {
  const { doc, task } = await openWithPassword(blob, askPassword);
  const id = newId();
  const coverKey = `cover-${id}`;
  try {
    const info = await readPdfInfo(doc);
    await store.put(coverKey, await renderCover(doc));
    return {
      id,
      hash,
      title: info.title ?? origin.fallbackTitle,
      author: info.author ?? origin.fallbackAuthor,
      pageCount: info.pageCount,
      sizeBytes: blob.size,
      source: origin.source,
      sourceUrl: origin.sourceUrl,
      sourceId: origin.sourceId,
      blobKey,
      coverKey,
      pageAspect: info.pageAspect,
      hasOutline: info.hasOutline,
      addedAt: Date.now(),
    };
  } catch (error) {
    await store.delete(coverKey);
    throw error;
  } finally {
    await task.destroy();
  }
}

/** Import a local file (picker, drag-drop, share target). */
export async function addBookFromFile(
  file: File,
  options: { askPassword?: PasswordProvider } = {},
): Promise<AddResult> {
  if (!(await looksLikePdf(file))) throw new NotPdfError();

  const hash = await fingerprint(file);
  const existing = await db.books.where('hash').equals(hash).first();
  if (existing) return { status: 'duplicate', book: existing };

  const store = await getBlobStore();
  await ensureSpaceFor(file.size, store);

  const blobKey = `book-${newId()}`;
  await store.put(blobKey, file);
  try {
    const stored = (await store.get(blobKey)) ?? file;
    const book = await buildBook(
      store,
      stored,
      blobKey,
      hash,
      { source: 'import', fallbackTitle: titleFromFileName(file.name) },
      options.askPassword,
    );
    await db.books.add(book);
    void requestPersistence();
    return { status: 'added', book };
  } catch (error) {
    await store.delete(blobKey);
    throw error;
  }
}

/**
 * Finish a book whose bytes are already in the BlobStore (download pipeline):
 * validate, dedupe, extract metadata, insert.
 */
export async function addBookFromStoredBlob(
  blobKey: string,
  origin: BookOrigin,
  options: { askPassword?: PasswordProvider } = {},
): Promise<AddResult> {
  const store = await getBlobStore();
  const blob = await store.get(blobKey);
  if (!blob) throw new Error('Downloaded file went missing.');
  try {
    if (!(await looksLikePdf(blob))) throw new NotPdfError();
    const hash = await fingerprint(blob);
    const existing = await db.books.where('hash').equals(hash).first();
    if (existing) {
      await store.delete(blobKey);
      return { status: 'duplicate', book: existing };
    }
    const book = await buildBook(store, blob, blobKey, hash, origin, options.askPassword);
    await db.books.add(book);
    void requestPersistence();
    return { status: 'added', book };
  } catch (error) {
    await store.delete(blobKey);
    throw error;
  }
}

export async function deleteBook(book: Book): Promise<void> {
  const store = await getBlobStore();
  await db.transaction('rw', db.books, db.progress, db.bookmarks, async () => {
    await db.books.delete(book.id);
    await db.progress.delete(book.id);
    await db.bookmarks.where('bookId').equals(book.id).delete();
  });
  await Promise.all([store.delete(book.blobKey), store.delete(book.coverKey)]);
}

export async function updateBookDetails(
  id: string,
  details: { title: string; author?: string },
): Promise<void> {
  const title = details.title.trim();
  if (!title) throw new Error('Title cannot be empty.');
  await db.books.update(id, { title, author: details.author?.trim() || undefined });
}

export async function getBookFile(book: Book): Promise<Blob | null> {
  const store = await getBlobStore();
  return store.get(book.blobKey);
}
