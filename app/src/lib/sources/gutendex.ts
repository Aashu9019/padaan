import { getJson, NoPdfError, type SearchResult, type SourceClient } from './types';

interface GutendexResponse {
  count: number;
  next: string | null;
  results: Array<{
    id: number;
    title: string;
    authors: Array<{ name: string; birth_year?: number | null }>;
    formats: Record<string, string>;
  }>;
}

/** "Austen, Jane" -> "Jane Austen" */
function displayName(name: string): string {
  const [last, rest] = name.split(/,\s*/, 2);
  return rest ? `${rest} ${last}` : name;
}

export function mapGutendex(data: GutendexResponse) {
  const results: SearchResult[] = [];
  for (const book of data.results) {
    // Most Gutenberg books are EPUB/HTML only; v1 lists PDF editions only.
    const pdfKey = Object.keys(book.formats).find((k) => k.startsWith('application/pdf'));
    if (!pdfKey) continue;
    results.push({
      source: 'gutenberg',
      id: String(book.id),
      title: book.title,
      authors: book.authors.map((a) => displayName(a.name)),
      coverUrl: book.formats['image/jpeg'],
      pdfUrl: book.formats[pdfKey]!,
      // gutenberg.org doesn't send CORS headers.
      needsProxy: true,
    });
  }
  return { results, hasMore: Boolean(data.next) };
}

export const gutendex: SourceClient = {
  source: 'gutenberg',
  label: 'Project Gutenberg',
  async search(q, page, signal) {
    const params = new URLSearchParams({ search: q, page: String(page) });
    const data = await getJson<GutendexResponse>(
      `https://gutendex.com/books/?${params}`,
      signal,
      20_000,
    );
    return mapGutendex(data);
  },
  async resolvePdf(result) {
    if (!result.pdfUrl) throw new NoPdfError();
    return result.pdfUrl;
  },
};
