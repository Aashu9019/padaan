import { useSyncExternalStore } from 'react';
import clsx from 'clsx';
import type { PageRenderCache } from '@/lib/pdf/render-cache';

export function useRenderedPage(cache: PageRenderCache, page: number) {
  return useSyncExternalStore(
    (notify) => cache.subscribe((p) => p === page && notify()),
    () => cache.get(page)?.url ?? (cache.hasFailed(page) ? 'failed' : null),
  );
}

/** One page: the rendered image, or a paper-textured placeholder while it renders. */
export function PageImage({
  cache,
  page,
  className,
  imgClassName,
}: {
  cache: PageRenderCache;
  page: number;
  className?: string;
  imgClassName?: string;
}) {
  const url = useRenderedPage(cache, page);
  return (
    <div className={clsx('paper-placeholder overflow-hidden', className ?? 'relative')}>
      {url && url !== 'failed' ? (
        <img
          src={url}
          alt={`Page ${page + 1}`}
          draggable={false}
          decoding="async"
          className={clsx('page-img absolute inset-0 size-full select-none', imgClassName)}
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center font-serif text-sm text-ink-3/70">
          {url === 'failed' ? `Page ${page + 1} could not be drawn` : page + 1}
        </span>
      )}
    </div>
  );
}
