import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Icon } from '@/components/Icon';
import { PageRenderCache } from '@/lib/pdf/render-cache';
import { buildSpreads, renderWindow, spreadIndexOf } from '@/lib/reader/spreads';
import type { Book } from '@/lib/storage/db';
import type { PDFDocumentProxy } from '@/lib/pdf/pdfjs';
import { useReducedMotion, useSettings } from '@/hooks/useSettings';
import { computeLayout } from './layout';
import { playPageTurn } from '@/lib/reader/page-sound';
import { PagerEngine } from './PagerEngine';
import { FlipEngine } from './FlipEngine';
import { useProgressSaver } from './useProgress';
import type { ReaderEngineHandle } from './engine';

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((s) =>
        Math.round(s.width) === Math.round(width) && Math.round(s.height) === Math.round(height)
          ? s
          : { width, height },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

const CHROME_HIDE_MS = 2500;

export function Reader({
  book,
  doc,
  initialPage,
}: {
  book: Book;
  doc: PDFDocumentProxy;
  initialPage: number;
}) {
  const settings = useSettings();
  const reducedMotion = useReducedMotion();
  const Engine = reducedMotion ? PagerEngine : FlipEngine;
  const [stageRef, stage] = useElementSize<HTMLDivElement>();
  const [page, setPage] = useState(initialPage);
  const [chrome, setChrome] = useState(true);
  const [scrub, setScrub] = useState<number | null>(null);
  const engine = useRef<ReaderEngineHandle>(null);
  const saveProgress = useProgressSaver(book.id);

  const cache = useMemo(() => new PageRenderCache(doc), [doc]);
  useEffect(() => () => cache.destroy(), [cache]);

  const pageCount = doc.numPages;
  const layout = computeLayout(stage.width, stage.height, book.pageAspect, settings.viewMode);
  const spreads = useMemo(() => buildSpreads(pageCount, layout.double), [pageCount, layout.double]);
  const spreadIndex = spreadIndexOf(page, layout.double);
  const shownPage = spreads[spreadIndex]?.[0] ?? 0;

  // Keep the render window centred on the current spread at device resolution.
  useEffect(() => {
    if (!layout.pageWidth) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cache.setWindow(renderWindow(spreads, spreadIndex, 2), layout.pageWidth * dpr);
  }, [cache, spreads, spreadIndex, layout.pageWidth]);

  const changePage = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(pageCount - 1, next));
      setPage(clamped);
      saveProgress(clamped);
    },
    [pageCount, saveProgress],
  );

  // Toolbar shows on open, then gets out of the way.
  useEffect(() => {
    const t = window.setTimeout(() => setChrome(false), CHROME_HIDE_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const handle = engine.current;
      if (!handle) return;
      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
          handle.next();
          break;
        case 'ArrowLeft':
        case 'PageUp':
          handle.prev();
          break;
        case ' ':
          if (e.shiftKey) handle.prev();
          else handle.next();
          break;
        case 'Home':
          handle.goTo(0);
          break;
        case 'End':
          handle.goTo(pageCount - 1);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pageCount]);

  const spread = spreads[spreadIndex] ?? [shownPage];
  const label = spread.length > 1 ? `${spread[0]! + 1}–${spread[1]! + 1}` : String(shownPage + 1);
  const sliderValue = scrub ?? shownPage;

  return (
    <div
      className="reader fixed inset-0 flex flex-col overflow-hidden bg-[var(--desk)] text-ink"
      data-chrome={chrome}
    >
      <header
        className={clsx(
          'safe-top absolute inset-x-0 top-0 z-20 bg-paper/95 backdrop-blur transition-[transform,opacity] duration-200',
          chrome ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-full opacity-0',
        )}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-2 sm:px-4">
          <Link
            to="/"
            aria-label="Back to library"
            className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-paper-2"
          >
            <Icon name="back" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-[0.95rem] leading-tight">{book.title}</p>
            {book.author && <p className="truncate text-xs text-ink-3">{book.author}</p>}
          </div>
        </div>
      </header>

      <div ref={stageRef} className="relative min-h-0 flex-1">
        {layout.pageWidth > 0 && (
          <Engine
            ref={engine}
            cache={cache}
            pageCount={pageCount}
            spreads={spreads}
            double={layout.double}
            page={shownPage}
            pageWidth={layout.pageWidth}
            pageHeight={layout.pageHeight}
            flipMs={settings.flipMs}
            onPageChange={changePage}
            onCenterTap={() => setChrome((c) => !c)}
            onFlipStart={settings.sound ? playPageTurn : undefined}
          />
        )}
      </div>

      <footer
        className={clsx(
          'safe-bottom absolute inset-x-0 bottom-0 z-20 bg-paper/95 backdrop-blur transition-[transform,opacity] duration-200',
          chrome ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0',
        )}
      >
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <button
            aria-label="Previous page"
            onClick={() => engine.current?.prev()}
            className="grid size-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-paper-2"
          >
            <Icon name="back" size={18} />
          </button>
          <input
            type="range"
            min={0}
            max={pageCount - 1}
            value={sliderValue}
            aria-label="Page"
            aria-valuetext={`Page ${sliderValue + 1} of ${pageCount}`}
            onChange={(e) => setScrub(Number(e.target.value))}
            onPointerUp={() => {
              if (scrub !== null) changePage(scrub);
              setScrub(null);
            }}
            onKeyUp={() => {
              if (scrub !== null) changePage(scrub);
              setScrub(null);
            }}
            className="page-slider min-w-0 flex-1"
          />
          <span className="w-20 shrink-0 text-right text-xs text-ink-2 tabular-nums">
            {scrub !== null ? scrub + 1 : label} / {pageCount}
          </span>
          <button
            aria-label="Next page"
            onClick={() => engine.current?.next()}
            className="grid size-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-paper-2"
          >
            <Icon name="forward" size={18} />
          </button>
        </div>
      </footer>

      <p className="sr-only" aria-live="polite">
        Page {label} of {pageCount}
      </p>
    </div>
  );
}
