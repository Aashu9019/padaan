import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Book } from '@/lib/storage/db';
import { formatRelative, progressPercent } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/Button';
import { BookCover } from '@/features/library/BookCover';
import { BookActions } from '@/features/library/BookActions';
import { ImportJobs } from '@/features/add-book/ImportJobs';
import { usePdfPicker, useWindowPdfDrop } from '@/features/add-book/useFileImport';

type SortKey = 'recent' | 'added' | 'title' | 'author';

const sorters: Record<SortKey, (a: Book, b: Book) => number> = {
  recent: (a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt),
  added: (a, b) => b.addedAt - a.addedAt,
  title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
  author: (a, b) =>
    (a.author ?? '￿').localeCompare(b.author ?? '￿', undefined, { sensitivity: 'base' }) ||
    a.title.localeCompare(b.title),
};

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
      <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** Long-press (touch) or right-click opens the actions sheet. */
function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const clear = () => window.clearTimeout(timer.current);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      fired.current = false;
      timer.current = window.setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(10);
        onLongPress();
      }, 500);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      clear();
      if (!fired.current) onLongPress();
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) {
        e.preventDefault();
        e.stopPropagation();
        fired.current = false;
      }
    },
  };
}

function BookTile({ book, page, onMenu }: { book: Book; page?: number; onMenu: () => void }) {
  const press = useLongPress(onMenu);
  const percent = page !== undefined ? progressPercent(page, book.pageCount) : 0;
  return (
    <li className="group relative">
      <Link
        to={`/read/${book.id}`}
        className="block rounded-md"
        aria-label={`${book.title}${book.author ? `, ${book.author}` : ''}${page !== undefined ? `, ${percent}% read` : ''}`}
        {...press}
      >
        <BookCover
          book={book}
          className="transition-transform duration-200 ease-out group-hover:-translate-y-1"
        />
      </Link>
      <div className="mt-2.5 flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-serif text-[0.95rem] leading-snug text-ink">
            {book.title}
          </p>
          {book.author && <p className="mt-0.5 truncate text-xs text-ink-3">{book.author}</p>}
        </div>
        <button
          onClick={onMenu}
          aria-label={`More for ${book.title}`}
          className="-mr-2 grid size-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-paper-2 hover:text-ink"
        >
          <Icon name="more" size={18} />
        </button>
      </div>
      {page !== undefined && (
        <div className="mt-1.5 flex items-center gap-2">
          <ProgressBar percent={percent} />
          <span className="text-[0.7rem] tabular-nums text-ink-3">{percent}%</span>
        </div>
      )}
    </li>
  );
}

function ContinueCard({ book, page }: { book: Book; page: number }) {
  const percent = progressPercent(page, book.pageCount);
  return (
    <Link
      to={`/read/${book.id}`}
      className="flex w-[17rem] shrink-0 snap-start items-center gap-4 rounded-xl border border-line bg-paper-2/50 p-3 transition-colors hover:bg-paper-2"
    >
      <div className="w-16 shrink-0">
        <BookCover book={book} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-serif leading-snug text-ink">{book.title}</p>
        <p className="mt-1 text-xs text-ink-3">
          Page {page + 1} of {book.pageCount}
          {book.lastOpenedAt ? ` · ${formatRelative(book.lastOpenedAt)}` : ''}
        </p>
        <div className="mt-2">
          <ProgressBar percent={percent} />
        </div>
      </div>
    </Link>
  );
}

function EmptyShelf({ onImport }: { onImport: () => void }) {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <div className="mb-6 flex items-end gap-1.5" aria-hidden="true">
        {[44, 56, 50, 62, 40].map((h, i) => (
          <span
            key={i}
            className="w-3 rounded-[2px] border border-line bg-paper-2"
            style={{ height: h, transform: i === 4 ? 'rotate(14deg) translateX(4px)' : undefined }}
          />
        ))}
      </div>
      <h1 className="font-serif text-3xl tracking-tight">An empty shelf</h1>
      <p className="mt-3 text-ink-2">
        Bring in a PDF from this device, paste a link to one, or find a public-domain classic.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={onImport}>
          <Icon name="upload" size={18} />
          Import a PDF
        </Button>
        <Link
          to="/add"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium hover:bg-paper-2"
        >
          <Icon name="search" size={18} />
          Find a book
        </Link>
      </div>
      <p className="mt-6 hidden text-xs text-ink-3 sm:block">Or drop PDF files anywhere here.</p>
    </section>
  );
}

export default function LibraryRoute() {
  const books = useLiveQuery(() => db.books.toArray(), []);
  const progress = useLiveQuery(() => db.progress.toArray(), []);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [menuFor, setMenuFor] = useState<Book | null>(null);
  const pick = usePdfPicker();
  const dragging = useWindowPdfDrop();

  const pages = useMemo(() => new Map(progress?.map((p) => [p.bookId, p.page])), [progress]);

  const continueReading = useMemo(
    () =>
      (books ?? [])
        .filter((b) => b.lastOpenedAt)
        .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
        .slice(0, 3),
    [books],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (books ?? []).filter(
      (b) => !q || b.title.toLowerCase().includes(q) || b.author?.toLowerCase().includes(q),
    );
    return list.sort(sorters[sort]);
  }, [books, query, sort]);

  if (!books) return null;

  return (
    <>
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-paper/80 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-accent px-10 py-8 font-serif text-xl text-accent">
            Drop to add to your shelf
          </div>
        </div>
      )}

      <div className="pt-4">
        <ImportJobs />
      </div>

      {books.length === 0 ? (
        <EmptyShelf onImport={pick} />
      ) : (
        <>
          {continueReading.length > 0 && !query && (
            <section className="pt-6" aria-labelledby="continue-heading">
              <h2
                id="continue-heading"
                className="text-xs font-semibold tracking-[0.14em] text-ink-3 uppercase"
              >
                Continue reading
              </h2>
              <div className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 [scrollbar-width:none]">
                {continueReading.map((book) => (
                  <ContinueCard key={book.id} book={book} page={pages.get(book.id) ?? 0} />
                ))}
              </div>
            </section>
          )}

          <section className="pt-8" aria-labelledby="library-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h1 id="library-heading" className="font-serif text-3xl tracking-tight">
                Library <span className="text-lg text-ink-3 tabular-nums">{books.length}</span>
              </h1>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <label className="relative flex-1 sm:w-56 sm:flex-none">
                  <span className="sr-only">Search your library</span>
                  <Icon
                    name="search"
                    size={16}
                    className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Title or author"
                    className="h-10 w-full rounded-lg border border-line bg-paper-2/50 pr-3 pl-9 text-sm outline-none placeholder:text-ink-3 focus:border-accent"
                  />
                </label>
                <label className="sr-only" htmlFor="sort">
                  Sort by
                </label>
                <select
                  id="sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="h-10 rounded-lg border border-line bg-paper-2/50 px-2 text-sm outline-none focus:border-accent"
                >
                  <option value="recent">Recent</option>
                  <option value="added">Date added</option>
                  <option value="title">Title</option>
                  <option value="author">Author</option>
                </select>
              </div>
            </div>

            {visible.length === 0 ? (
              <p className="py-16 text-center text-ink-2">Nothing matches “{query}”.</p>
            ) : (
              <ul className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {visible.map((book) => (
                  <BookTile
                    key={book.id}
                    book={book}
                    page={pages.get(book.id)}
                    onMenu={() => setMenuFor(book)}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <BookActions book={menuFor} onClose={() => setMenuFor(null)} />
    </>
  );
}
