import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { toast } from '@/components/toast';
import { SOURCES, type SearchResult, type SourceClient } from '@/lib/sources';
import { useDownloads } from './download-store';
import { DownloadJobs } from './DownloadJobs';

const DEBOUNCE_MS = 400;

interface SourceState {
  status: 'idle' | 'loading' | 'done' | 'error';
  results: SearchResult[];
  page: number;
  hasMore: boolean;
  loadingMore: boolean;
}

const empty: SourceState = {
  status: 'idle',
  results: [],
  page: 1,
  hasMore: false,
  loadingMore: false,
};

function useSourceSearch(client: SourceClient, query: string) {
  const [state, setState] = useState<SourceState>(empty);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    controller.current?.abort();
    if (!query) {
      setState(empty);
      return;
    }
    const ac = new AbortController();
    controller.current = ac;
    setState({ ...empty, status: 'loading' });
    client
      .search(query, 1, ac.signal)
      .then((page) => {
        if (!ac.signal.aborted)
          setState({ ...empty, status: 'done', results: page.results, hasMore: page.hasMore });
      })
      .catch(() => {
        if (!ac.signal.aborted) setState({ ...empty, status: 'error' });
      });
    return () => ac.abort();
  }, [client, query]);

  const loadMore = async () => {
    const ac = controller.current;
    if (!ac || state.loadingMore) return;
    setState((s) => ({ ...s, loadingMore: true }));
    try {
      const next = await client.search(query, state.page + 1, ac.signal);
      setState((s) => {
        const seen = new Set(s.results.map((r) => r.id));
        return {
          ...s,
          page: s.page + 1,
          results: [...s.results, ...next.results.filter((r) => !seen.has(r.id))],
          hasMore: next.hasMore,
          loadingMore: false,
        };
      });
    } catch {
      setState((s) => ({ ...s, loadingMore: false }));
      if (!ac.signal.aborted) toast.error(`Couldn’t load more from ${client.label}.`);
    }
  };

  return { state, loadMore };
}

function Cover({ url }: { url?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="h-[4.5rem] w-12 shrink-0 overflow-hidden rounded-[2px_4px_4px_2px] bg-paper-2 shadow-sm">
      {url && !failed ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <div className="paper-placeholder grid size-full place-items-center text-ink-3">
          <Icon name="book" size={16} />
        </div>
      )}
    </div>
  );
}

function SourceSection({
  client,
  query,
  onPick,
}: {
  client: SourceClient;
  query: string;
  onPick: (client: SourceClient, result: SearchResult) => void;
}) {
  const { state, loadMore } = useSourceSearch(client, query);
  if (state.status === 'idle') return null;

  return (
    <section aria-labelledby={`src-${client.source}`} className="pt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3
          id={`src-${client.source}`}
          className="text-xs font-semibold tracking-[0.14em] text-ink-3 uppercase"
        >
          {client.label}
        </h3>
        {client.source === 'gutenberg' && (
          <span className="text-xs text-ink-3">PDF editions only</span>
        )}
      </div>

      {state.status === 'loading' && (
        <ul className="mt-3 space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex animate-pulse gap-3 rounded-xl p-2">
              <div className="h-[4.5rem] w-12 rounded bg-paper-2" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-3.5 w-2/3 rounded bg-paper-2" />
                <div className="h-3 w-1/3 rounded bg-paper-2" />
              </div>
            </li>
          ))}
        </ul>
      )}
      {state.status === 'error' && (
        <p className="mt-3 text-sm text-ink-3">{client.label} isn’t responding right now.</p>
      )}
      {state.status === 'done' && state.results.length === 0 && (
        <p className="mt-3 text-sm text-ink-3">No free PDFs found here.</p>
      )}
      {state.results.length > 0 && (
        <ul className="mt-2">
          {state.results.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => onPick(client, r)}
                className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-paper-2/70"
              >
                <Cover url={r.coverUrl} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-serif leading-snug text-ink">{r.title}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-3">
                    {[r.authors.slice(0, 2).join(', '), r.year].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="grid size-9 shrink-0 place-items-center rounded-full text-ink-2">
                  <Icon name="download" size={18} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {state.hasMore && (
        <Button
          variant="ghost"
          className="mt-1 w-full"
          onClick={loadMore}
          disabled={state.loadingMore}
        >
          {state.loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </section>
  );
}

export function SearchPanel() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<{ client: SourceClient; result: SearchResult } | null>(null);
  const [resolving, setResolving] = useState(false);
  const start = useDownloads((s) => s.start);

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(input.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [input]);

  const confirm = async () => {
    if (!picked) return;
    const { client, result } = picked;
    setResolving(true);
    const ac = new AbortController();
    try {
      const url = await client.resolvePdf(result, ac.signal);
      start(
        url,
        {
          source: result.source,
          sourceId: result.id,
          sourceUrl: url,
          fallbackTitle: result.title,
          fallbackAuthor: result.authors[0],
        },
        { proxyOnly: result.needsProxy },
      );
      setPicked(null);
    } catch (error) {
      toast.error((error as Error).message || 'Couldn’t find a downloadable file.');
    } finally {
      setResolving(false);
    }
  };

  return (
    <section aria-labelledby="search-heading" className="space-y-2">
      <h2 id="search-heading" className="sr-only">
        Search free books
      </h2>
      <label className="relative block">
        <span className="sr-only">Search free and public-domain books</span>
        <Icon
          name="search"
          size={18}
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3"
        />
        <input
          type="search"
          value={input}
          autoFocus
          enterKeyHint="search"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setQuery(input.trim())}
          placeholder="Title or author, e.g. Pride and Prejudice"
          className="h-12 w-full rounded-xl border border-line bg-paper-2/50 pr-3 pl-11 outline-none placeholder:text-ink-3 focus:border-accent"
        />
      </label>
      <p className="px-1 text-xs text-ink-3">
        Public-domain and openly licensed books from Open Library, Internet Archive and Project
        Gutenberg.
      </p>

      <div className="pt-2">
        <DownloadJobs />
      </div>

      <div className={clsx(!query && 'hidden')}>
        {SOURCES.map((client) => (
          <SourceSection
            key={client.source}
            client={client}
            query={query}
            onPick={(c, r) => setPicked({ client: c, result: r })}
          />
        ))}
      </div>

      <Dialog
        open={picked !== null}
        onClose={() => !resolving && setPicked(null)}
        title="Add to your shelf?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPicked(null)} disabled={resolving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={confirm} disabled={resolving}>
              {resolving ? 'Finding the file…' : 'Download'}
            </Button>
          </>
        }
      >
        {picked && (
          <p>
            <strong className="text-ink">{picked.result.title}</strong>
            {picked.result.authors[0] ? ` by ${picked.result.authors[0]}` : ''} will be downloaded
            from {picked.client.label} and kept on this device for offline reading.
          </p>
        )}
      </Dialog>
    </section>
  );
}
