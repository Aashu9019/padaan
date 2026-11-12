import type { BookSource } from '../storage/db';

export type SearchSource = Exclude<BookSource, 'import' | 'link'>;

export interface SearchResult {
  source: SearchSource;
  id: string;
  title: string;
  authors: string[];
  year?: number;
  coverUrl?: string;
  /** Direct PDF URL, or null when it must be resolved on tap (Open Library / IA). */
  pdfUrl: string | null;
  /** Host doesn't send CORS headers: download through the proxy. */
  needsProxy?: boolean;
  /** Open Library: scanned Internet Archive editions to try when resolving. */
  editions?: string[];
}

export interface SearchPage {
  results: SearchResult[];
  hasMore: boolean;
}

export interface SourceClient {
  source: SearchSource;
  label: string;
  search(q: string, page: number, signal: AbortSignal): Promise<SearchPage>;
  /** Turns a result into a downloadable PDF URL (may hit the network). */
  resolvePdf(result: SearchResult, signal: AbortSignal): Promise<string>;
}

export class NoPdfError extends Error {
  readonly name = 'NoPdfError';
  constructor() {
    super('No openly downloadable PDF is available for this book.');
  }
}

export async function getJson<T>(url: string, signal: AbortSignal, timeoutMs = 15_000): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetch(url, { signal: AbortSignal.any([signal, timeout]) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}
