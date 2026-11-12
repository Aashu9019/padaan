import { getJson, NoPdfError, type SearchResult, type SourceClient } from './types';

const PAGE_SIZE = 20;

// Lending-library collections are borrow-only (not openly downloadable); exclude them.
const OPEN_FILTER =
  'mediatype:texts AND NOT collection:inlibrary AND NOT collection:printdisabled AND NOT collection:lendinglibrary AND NOT access-restricted-item:true';

interface AdvancedSearchResponse {
  response: {
    numFound: number;
    start: number;
    docs: Array<{
      identifier: string;
      title?: string | string[];
      creator?: string | string[];
      year?: string | number;
    }>;
  };
}

export interface IaMetadata {
  server?: string;
  dir?: string;
  is_dark?: boolean;
  metadata?: { 'access-restricted-item'?: string | boolean; title?: string };
  files?: Array<{ name: string; format?: string; size?: string; private?: string | boolean }>;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const list = (v: string | string[] | undefined) =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/**
 * Picks the best openly downloadable PDF from an item's metadata, as a direct file-server URL
 * (archive.org/download redirects without CORS headers; the file servers send them).
 * Returns null for restricted, dark or PDF-less items.
 */
export function pickIaPdf(id: string, meta: IaMetadata): string | null {
  if (!meta.files || meta.is_dark) return null;
  const restricted = meta.metadata?.['access-restricted-item'];
  if (restricted === true || restricted === 'true') return null;
  const pdfs = meta.files.filter(
    (f) =>
      f.name.toLowerCase().endsWith('.pdf') &&
      f.private !== true &&
      f.private !== 'true' &&
      !/_encrypted/i.test(f.name),
  );
  if (!pdfs.length) return null;
  const rank = (f: { format?: string; name: string }) =>
    f.format === 'Text PDF' ? 0 : /pdf/i.test(f.format ?? '') && !/_bw\.pdf$/i.test(f.name) ? 1 : 2;
  const best = [...pdfs].sort((a, b) => rank(a) - rank(b))[0]!;
  const path = best.name.split('/').map(encodeURIComponent).join('/');
  if (meta.server && meta.dir) return `https://${meta.server}${meta.dir}/${path}`;
  return `https://archive.org/download/${encodeURIComponent(id)}/${path}`;
}

export async function resolveIaIdentifier(id: string, signal: AbortSignal): Promise<string | null> {
  const meta = await getJson<IaMetadata>(
    `https://archive.org/metadata/${encodeURIComponent(id)}`,
    signal,
  );
  return pickIaPdf(id, meta);
}

export function mapIaSearch(
  data: AdvancedSearchResponse,
  page: number,
): {
  results: SearchResult[];
  hasMore: boolean;
} {
  const { docs, numFound } = data.response;
  return {
    results: docs.map((d) => {
      const year = Number(d.year);
      return {
        source: 'internetarchive' as const,
        id: d.identifier,
        title: first(d.title) ?? d.identifier,
        authors: list(d.creator),
        year: Number.isFinite(year) && year > 0 ? year : undefined,
        coverUrl: `https://archive.org/services/img/${encodeURIComponent(d.identifier)}`,
        pdfUrl: null,
        // IA file servers don't send CORS headers.
        needsProxy: true,
      };
    }),
    hasMore: page * PAGE_SIZE < numFound,
  };
}

export const internetArchive: SourceClient = {
  source: 'internetarchive',
  label: 'Internet Archive',
  async search(q, page, signal) {
    const terms = q.replace(/[():"]/g, ' ').trim();
    const query = `(${terms}) AND ${OPEN_FILTER} AND format:(PDF OR "Text PDF")`;
    const params = new URLSearchParams({
      q: query,
      rows: String(PAGE_SIZE),
      page: String(page),
      output: 'json',
    });
    for (const f of ['identifier', 'title', 'creator', 'year']) params.append('fl[]', f);
    const data = await getJson<AdvancedSearchResponse>(
      `https://archive.org/advancedsearch.php?${params}`,
      signal,
    );
    return mapIaSearch(data, page);
  },
  async resolvePdf(result, signal) {
    const url = await resolveIaIdentifier(result.id, signal);
    if (!url) throw new NoPdfError();
    return url;
  },
};
