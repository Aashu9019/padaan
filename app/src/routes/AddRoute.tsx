import clsx from 'clsx';
import { useSearchParams } from 'react-router-dom';
import { Icon, type IconName } from '@/components/Icon';
import { ImportJobs } from '@/features/add-book/ImportJobs';
import { LinkPanel } from '@/features/add-book/LinkPanel';
import { SearchPanel } from '@/features/add-book/SearchPanel';
import { usePdfPicker, useWindowPdfDrop } from '@/features/add-book/useFileImport';

type Tab = 'search' | 'link' | 'import';

const TABS: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'link', label: 'Paste link', icon: 'link' },
  { id: 'import', label: 'From device', icon: 'upload' },
];

function ImportPanel() {
  const pick = usePdfPicker();
  const dragging = useWindowPdfDrop();
  return (
    <section aria-label="Import from this device" className="space-y-4">
      <button
        onClick={pick}
        className={clsx(
          'flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
          dragging
            ? 'border-accent bg-accent/5'
            : 'border-line hover:border-ink-3 hover:bg-paper-2/40',
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
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: Tab = params.get('shared')
    ? 'import'
    : TABS.some((t) => t.id === requested)
      ? (requested as Tab)
      : 'search';

  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="font-serif text-3xl tracking-tight">Add a book</h1>

      <div
        role="tablist"
        aria-label="How to add"
        className="mt-6 grid grid-cols-3 gap-1 rounded-xl bg-paper-2/70 p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={clsx(
              'flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors',
              tab === t.id ? 'bg-paper text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
            )}
          >
            <Icon name={t.icon} size={16} className="hidden min-[380px]:block" />
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-6">
        {tab === 'search' && <SearchPanel />}
        {tab === 'link' && <LinkPanel />}
        {tab === 'import' && <ImportPanel />}
      </div>
    </div>
  );
}
