import type { PDFDocumentProxy, PDFPageProxy } from './pdfjs';

export interface PdfInfo {
  title?: string;
  author?: string;
  pageCount: number;
  pageAspect: number;
  hasOutline: boolean;
}

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  // Producers often leave junk like "untitled" or "Microsoft Word - foo.docx".
  if (/^(untitled|unknown|title|document\d*)$/i.test(text)) return undefined;
  return text.replace(/^Microsoft Word - /i, '').replace(/\.(docx?|pdf|indd)$/i, '');
}

/** "the_great-gatsby (1925).pdf" -> "The Great Gatsby (1925)" */
export function titleFromFileName(name: string): string {
  const base = name
    .replace(/\.pdf$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/(?<=\w)-(?=\w)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return 'Untitled';
  if (base !== base.toLowerCase() && base !== base.toUpperCase()) return base;
  return base
    .toLowerCase()
    .replace(/(^|\s|\()([a-z])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
}

export async function readPdfInfo(doc: PDFDocumentProxy): Promise<PdfInfo> {
  const [meta, outline, page] = await Promise.all([
    doc.getMetadata().catch(() => null),
    doc.getOutline().catch(() => null),
    doc.getPage(1),
  ]);
  const info = (meta?.info ?? {}) as Record<string, unknown>;
  const viewport = page.getViewport({ scale: 1 });
  return {
    title: clean(info.Title) ?? clean(meta?.metadata?.get('dc:title')),
    author: clean(info.Author) ?? clean(meta?.metadata?.get('dc:creator')),
    pageCount: doc.numPages,
    pageAspect: viewport.width / viewport.height,
    hasOutline: Array.isArray(outline) && outline.length > 0,
  };
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      type,
      quality,
    );
  });
}

/** Render a page to an image blob at a target CSS-pixel width. */
export async function renderPageToBlob(
  page: PDFPageProxy,
  width: number,
  type = 'image/webp',
  quality = 0.85,
): Promise<Blob> {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = makeCanvas(Math.round(viewport.width), Math.round(viewport.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  const blob = await toBlob(canvas, type, quality);
  canvas.width = canvas.height = 0;
  // Safari can't encode webp and silently returns png; either is fine for a cover.
  return blob;
}

export const COVER_WIDTH = 320;

export async function renderCover(doc: PDFDocumentProxy): Promise<Blob> {
  const page = await doc.getPage(1);
  try {
    return await renderPageToBlob(page, COVER_WIDTH);
  } finally {
    page.cleanup();
  }
}
