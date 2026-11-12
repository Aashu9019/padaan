import clsx from 'clsx';
import { Icon } from '@/components/Icon';
import { ImportJobs } from '@/features/add-book/ImportJobs';
import { usePdfPicker, useWindowPdfDrop } from '@/features/add-book/useFileImport';

function ImportPanel() {
  const pick = usePdfPicker();
  const dragging = useWindowPdfDrop();
  return (
    <section aria-labelledby="import-heading" className="space-y-4">
      <h2 id="import-heading" className="sr-only">
        Import from this device
      </h2>
      <button
        onClick={pick}
        className={clsx(
          'flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
          dragging ? 'border-accent bg-accent/5' : 'border-line hover:border-ink-3 hover:bg-paper-2/40',
        )}
      >
        <span className="grid size-12 place-items-center rounded-full bg-paper-2 text-ink-2">
          <Icon name="upload" size={22} />
        </span>
        <span className="font-serif text-lg text-ink">Choose PDF files</span>
        <span className="text-sm text-ink-3">
          <span className="hidden sm:inline">or drop them here · </span>several at once is fine
        </span>
      </button>
      <ImportJobs />
    </section>
  );
}

export default function AddRoute() {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="font-serif text-3xl tracking-tight">Add a book</h1>
      <div className="mt-6">
        <ImportPanel />
      </div>
    </div>
  );
}
