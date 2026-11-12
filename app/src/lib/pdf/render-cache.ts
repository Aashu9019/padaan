import type { RenderTask } from 'pdfjs-dist';
import { LruCache } from './lru';
import type { PDFDocumentProxy } from './pdfjs';

export interface RenderedPage {
  url: string;
  /** Device-pixel width this image was rendered at. */
  width: number;
  height: number;
}

type Listener = (page: number) => void;

const MAX_PAGES = 12;
const MAX_BYTES = 150 * 1024 * 1024;
/** A cached render within this fraction of the target width is good enough. */
const WIDTH_TOLERANCE = 0.12;

/**
 * Renders PDF pages to images on demand and keeps a bounded LRU of them.
 *
 * Callers describe a "window" of pages they care about (in priority order). Pages are rendered
 * one at a time in that order; a render that falls out of the window is cancelled. Old images
 * stay visible while sharper ones render, so resizing never flashes a blank page.
 */
export class PageRenderCache {
  private cache: LruCache<number, RenderedPage>;
  private window: number[] = [];
  private targetWidth = 0;
  private active: { page: number; task: RenderTask } | null = null;
  private pumping = false;
  private listeners = new Set<Listener>();
  private destroyed = false;
  private failed = new Set<number>();

  constructor(
    private readonly doc: PDFDocumentProxy,
    options: { maxPages?: number; maxBytes?: number } = {},
  ) {
    this.cache = new LruCache(
      options.maxPages ?? MAX_PAGES,
      options.maxBytes ?? MAX_BYTES,
      (_page, value) => URL.revokeObjectURL(value.url),
    );
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get(page: number): RenderedPage | undefined {
    return this.cache.peek(page);
  }

  /** Set the pages to keep rendered (highest priority first) at a device-pixel width. */
  setWindow(pages: number[], targetWidth: number): void {
    if (this.destroyed) return;
    this.window = [...new Set(pages)].filter((p) => p >= 0 && p < this.doc.numPages);
    if (Math.abs(targetWidth - this.targetWidth) / Math.max(targetWidth, 1) > WIDTH_TOLERANCE) {
      this.failed.clear();
    }
    this.targetWidth = Math.round(targetWidth);
    if (this.active && !this.window.includes(this.active.page)) {
      this.active.task.cancel();
    }
    void this.pump();
  }

  private needsRender(page: number): boolean {
    if (this.failed.has(page)) return false;
    const hit = this.cache.peek(page);
    if (!hit) return true;
    return Math.abs(hit.width - this.targetWidth) / this.targetWidth > WIDTH_TOLERANCE;
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (!this.destroyed) {
        const page = this.window.find((p) => this.needsRender(p));
        if (page === undefined || this.targetWidth <= 0) break;
        try {
          const rendered = await this.render(page, this.targetWidth);
          if (this.destroyed) {
            URL.revokeObjectURL(rendered.url);
            break;
          }
          const pinned = new Set(this.window);
          this.cache.set(page, rendered, rendered.width * rendered.height * 4, pinned);
          for (const listener of this.listeners) listener(page);
        } catch (error) {
          if ((error as { name?: string })?.name !== 'RenderingCancelledException') {
            console.warn(`Page ${page + 1} failed to render`, error);
            this.failed.add(page);
            for (const listener of this.listeners) listener(page);
          }
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  hasFailed(page: number): boolean {
    return this.failed.has(page) && !this.cache.has(page);
  }

  private async render(pageIndex: number, width: number): Promise<RenderedPage> {
    const page = await this.doc.getPage(pageIndex + 1);
    try {
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Canvas 2D unavailable');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const task = page.render({ canvas, canvasContext: ctx, viewport });
      this.active = { page: pageIndex, task };
      try {
        await task.promise;
      } finally {
        this.active = null;
      }
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
          'image/webp',
          0.9,
        ),
      );
      const result = { url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
      canvas.width = canvas.height = 0;
      return result;
    } finally {
      page.cleanup();
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.active?.task.cancel();
    this.cache.clear();
    this.listeners.clear();
  }
}
