import { create } from 'zustand';
import { addBookFromFile, NotPdfError } from '@/lib/library';
import { QuotaError } from '@/lib/storage/blob-store';
import { PdfOpenError, PdfPasswordError } from '@/lib/pdf/pdfjs';
import { askPdfPassword } from '@/components/PasswordPrompt';

export type JobStatus = 'queued' | 'working' | 'added' | 'duplicate' | 'error';

export interface ImportJob {
  id: string;
  name: string;
  size: number;
  status: JobStatus;
  message?: string;
  bookId?: string;
}

interface ImportState {
  jobs: ImportJob[];
  enqueue: (files: File[]) => void;
  clearFinished: () => void;
}

const pending = new Map<string, File>();
let running = false;

export function importErrorMessage(error: unknown): string {
  if (error instanceof NotPdfError) return 'Not a PDF file.';
  if (error instanceof QuotaError) return 'Not enough storage space.';
  if (error instanceof PdfPasswordError) return 'Locked — password not given.';
  if (error instanceof PdfOpenError) return 'The PDF looks damaged and could not be opened.';
  return 'Something went wrong while adding this file.';
}

export const useImports = create<ImportState>((set, get) => {
  const patch = (id: string, change: Partial<ImportJob>) =>
    set({ jobs: get().jobs.map((j) => (j.id === id ? { ...j, ...change } : j)) });

  // One file at a time: parsing several large PDFs at once would spike memory on phones.
  async function drain() {
    if (running) return;
    running = true;
    try {
      for (;;) {
        const job = get().jobs.find((j) => j.status === 'queued');
        if (!job) break;
        const file = pending.get(job.id);
        pending.delete(job.id);
        if (!file) {
          patch(job.id, { status: 'error', message: 'File was lost.' });
          continue;
        }
        patch(job.id, { status: 'working' });
        try {
          const result = await addBookFromFile(file, {
            askPassword: (incorrect) => askPdfPassword(incorrect, file.name),
          });
          patch(job.id, { status: result.status, bookId: result.book.id });
        } catch (error) {
          console.warn(
            'Import failed',
            file.name,
            error instanceof Error ? `${error.name}: ${error.message}` : error,
            (error as Error)?.cause,
          );
          patch(job.id, { status: 'error', message: importErrorMessage(error) });
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    jobs: [],
    enqueue: (files) => {
      const jobs = files.map((file) => {
        const id = crypto.randomUUID();
        pending.set(id, file);
        return { id, name: file.name, size: file.size, status: 'queued' as const };
      });
      set({ jobs: [...get().jobs, ...jobs] });
      void drain();
    },
    clearFinished: () =>
      set({ jobs: get().jobs.filter((j) => j.status === 'queued' || j.status === 'working') }),
  };
});
