import { create } from 'zustand';
import { downloadToStore } from '@/lib/download/download';
import { addBookFromStoredBlob, NotPdfError as StoredNotPdf, type BookOrigin } from '@/lib/library';
import { getBlobStore } from '@/lib/storage/blob-store';
import { loadSettings } from '@/lib/storage/settings';
import { askPdfPassword } from '@/components/PasswordPrompt';
import { importErrorMessage } from './import-store';

export interface DownloadJob {
  id: string;
  url: string;
  title: string;
  status: 'downloading' | 'processing' | 'added' | 'duplicate' | 'error' | 'cancelled';
  loaded: number;
  total: number | null;
  message?: string;
  bookId?: string;
}

interface DownloadState {
  jobs: DownloadJob[];
  start: (url: string, origin: BookOrigin, options?: { proxyOnly?: boolean }) => string;
  cancel: (id: string) => void;
  dismiss: (id: string) => void;
}

const controllers = new Map<string, AbortController>();

function messageFor(error: unknown): string {
  if (error instanceof StoredNotPdf) return 'The downloaded file is not a PDF.';
  if (error instanceof Error && error.name !== 'Error' && !/^Pdf|Quota/.test(error.name)) {
    return error.message;
  }
  return importErrorMessage(error);
}

export const useDownloads = create<DownloadState>((set, get) => {
  const patch = (id: string, change: Partial<DownloadJob>) =>
    set({ jobs: get().jobs.map((j) => (j.id === id ? { ...j, ...change } : j)) });

  return {
    jobs: [],
    start: (url, origin, options = {}) => {
      const existing = get().jobs.find(
        (j) => j.url === url && (j.status === 'downloading' || j.status === 'processing'),
      );
      if (existing) return existing.id;

      const id = crypto.randomUUID();
      const controller = new AbortController();
      controllers.set(id, controller);
      set({
        jobs: [
          { id, url, title: origin.fallbackTitle, status: 'downloading', loaded: 0, total: null },
          ...get().jobs,
        ],
      });

      void (async () => {
        let lastPaint = 0;
        try {
          const [settings, store] = await Promise.all([loadSettings(), getBlobStore()]);
          const key = await downloadToStore(url, {
            store,
            maxBytes: settings.maxDownloadMB * 1024 * 1024,
            proxy: settings.proxyUrl
              ? { url: settings.proxyUrl, token: settings.proxyToken }
              : undefined,
            proxyOnly: options.proxyOnly && Boolean(settings.proxyUrl),
            signal: controller.signal,
            onProgress: (loaded, total) => {
              // ~10 updates a second is plenty for a progress bar.
              const now = performance.now();
              if (now - lastPaint > 100 || loaded === total) {
                lastPaint = now;
                patch(id, { loaded, total });
              }
            },
          });
          patch(id, { status: 'processing' });
          const result = await addBookFromStoredBlob(key, origin, {
            askPassword: (incorrect) => askPdfPassword(incorrect, origin.fallbackTitle),
          });
          patch(id, { status: result.status, bookId: result.book.id, title: result.book.title });
        } catch (error) {
          if (controller.signal.aborted) {
            patch(id, { status: 'cancelled' });
          } else {
            console.warn('Download failed', url, error);
            patch(id, { status: 'error', message: messageFor(error) });
          }
        } finally {
          controllers.delete(id);
        }
      })();
      return id;
    },
    cancel: (id) => controllers.get(id)?.abort(),
    dismiss: (id) => set({ jobs: get().jobs.filter((j) => j.id !== id) }),
  };
});
