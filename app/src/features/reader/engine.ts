import type { PageRenderCache } from '@/lib/pdf/render-cache';
import type { Spread } from '@/lib/reader/spreads';

/** Imperative controls every reading engine (page-curl or plain pager) exposes. */
export interface ReaderEngineHandle {
  goTo(page: number): void;
  next(): void;
  prev(): void;
}

export interface ReaderEngineProps {
  cache: PageRenderCache;
  pageCount: number;
  spreads: Spread[];
  double: boolean;
  /** 0-based page currently shown (first page of its spread). */
  page: number;
  /** CSS pixel size of one page. */
  pageWidth: number;
  pageHeight: number;
  flipMs: number;
  onPageChange(page: number): void;
  onCenterTap(): void;
}
