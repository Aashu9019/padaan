import { useEffect, useState } from 'react';
import { db, type Book } from '@/lib/storage/db';
import { getBlobStore } from '@/lib/storage/blob-store';
import { openPdf, PdfPasswordError, type PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import { askPdfPassword } from '@/components/PasswordPrompt';

export type BookDocState =
  | { status: 'loading' }
  | { status: 'ready'; book: Book; doc: PDFDocumentProxy; initialPage: number }
  | { status: 'error'; reason: 'missing-book' | 'missing-file' | 'locked' | 'broken' };

/** Loads a book's row, its file and saved position, and opens it with pdf.js. */
export function useBookDocument(bookId: string | undefined): BookDocState {
  const [state, setState] = useState<BookDocState>({ status: 'loading' });

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;
    let destroy: (() => void) | undefined;
    setState({ status: 'loading' });

    void (async () => {
      const book = await db.books.get(bookId);
      if (!book) return !cancelled && setState({ status: 'error', reason: 'missing-book' });
      const store = await getBlobStore();
      const [blob, progress] = await Promise.all([
        store.get(book.blobKey),
        db.progress.get(bookId),
      ]);
      if (!blob) return !cancelled && setState({ status: 'error', reason: 'missing-file' });

      let password: string | undefined;
      for (;;) {
        if (cancelled) return;
        try {
          const { doc, task } = await openPdf(blob, password);
          if (cancelled) {
            void task.destroy();
            return;
          }
          destroy = () => void task.destroy();
          void db.books.update(bookId, { lastOpenedAt: Date.now() });
          const initialPage = Math.min(Math.max(progress?.page ?? 0, 0), doc.numPages - 1);
          setState({ status: 'ready', book, doc, initialPage });
          return;
        } catch (error) {
          if (error instanceof PdfPasswordError) {
            const answer = await askPdfPassword(error.incorrect, book.title);
            if (answer === null)
              return !cancelled && setState({ status: 'error', reason: 'locked' });
            password = answer;
            continue;
          }
          console.warn('Could not open book', error);
          return !cancelled && setState({ status: 'error', reason: 'broken' });
        }
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [bookId]);

  return state;
}
