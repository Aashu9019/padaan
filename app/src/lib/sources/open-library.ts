import { resolveIaIdentifier } from './internet-archive';
import { getJson, NoPdfError, type SearchResult, type SourceClient } from './types';

const PAGE_SIZE = 20;
/** How many scanned editions to try before giving up on a work. */
const MAX_EDITIONS = 4;

interface OlSearchResponse {
  numFound: number;
  docs: Array<{
    key: string;
    title?: string;
    author_name?: string[];
    first_publish_year?: number;
    cover_i?: number;
    ia?: string[];
    ebook_access?: string;
  }>;
}

export function mapOlSearch(data: OlSearchResponse, page: number) {
  const results: SearchResult[] = data.docs
    .filter((d) => d.ebook_access === 'public' && d.ia?.length)
    .map((d) => ({
      source: 'openlibrary' as const,
      id: d.key,
      title: d.title ?? 'Untitled',
      authors: d.author_name ?? [],
      year: d.first_publish_year,
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined,
      pdfUrl: null,
      needsProxy: true,
      editions: d.ia!.slice(0, MAX_EDITIONS),
    }));
  return { results, hasMore: page * PAGE_SIZE < data.numFound };
}

export const openLibrary: SourceClient = {
  source: 'openlibrary',
  label: 'Open Library',
  async search(q, page, signal) {
    const params = new URLSearchParams({
      q,
      page: String(page),
      limit: String(PAGE_SIZE),
      has_fulltext: 'true',
      fields: 'key,title,author_name,first_publish_year,cover_i,ia,ebook_access',
    });
    const data = await getJson<OlSearchResponse>(
      `https://openlibrary.org/search.json?${params}`,
      signal,
    );
    return mapOlSearch(data, page);
  },
  async resolvePdf(result, signal) {
    // A public work can list borrow-only editions too, so check each until one is open.
    const editions = result.editions ?? [];
    for (const id of editions) {
      const url = await resolveIaIdentifier(id, signal).catch(() => null);
      if (url) return url;
    }
    throw new NoPdfError();
  },
};
