import clsx from 'clsx';
import { useBlobUrl } from '@/hooks/useBlobUrl';
import type { Book } from '@/lib/storage/db';

/** A cover with a faint spine and edge so it reads as an object, not a thumbnail. */
export function BookCover({ book, className }: { book: Book; className?: string }) {
  const url = useBlobUrl(book.coverKey);
  const aspect = Math.min(Math.max(book.pageAspect || 0.7, 0.5), 1.1);
  return (
    <div
      className={clsx(
        'relative w-full overflow-hidden rounded-[3px_6px_6px_3px] bg-paper-2 shadow-[0_1px_2px_rgb(0_0_0/0.12),0_8px_20px_-8px_rgb(0_0_0/0.35)]',
        className,
      )}
      style={{ aspectRatio: aspect }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="paper-placeholder absolute inset-0 flex items-end p-3">
          <span className="line-clamp-4 font-serif text-sm text-ink-2">{book.title}</span>
        </div>
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[7%] bg-gradient-to-r from-black/25 via-white/10 to-transparent"
      />
    </div>
  );
}
