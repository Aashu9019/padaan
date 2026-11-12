import { ensureSpaceFor, type BlobStore } from '../storage/blob-store';
import { hasPdfHeader } from '../pdf/pdfjs';

export class NotPdfError extends Error {
  readonly name = 'NotPdfError';
  constructor(readonly isWebPage: boolean) {
    super(
      isWebPage
        ? 'This link is a web page, not a PDF file. Open it and copy the direct download link.'
        : 'This link did not return a PDF file.',
    );
  }
}
export class TooLargeError extends Error {
  readonly name = 'TooLargeError';
  constructor(readonly limitBytes: number) {
    super(`The file is larger than the ${Math.round(limitBytes / 1024 / 1024)} MB limit.`);
  }
}
export class NetworkError extends Error {
  readonly name = 'NetworkError';
  constructor() {
    super('Could not download the file. Check your connection and try again.');
  }
}
export class ProxyAuthError extends Error {
  readonly name = 'ProxyAuthError';
  constructor() {
    super('The download proxy rejected the token. Check it in Settings.');
  }
}
export class ProxyMissingError extends Error {
  readonly name = 'ProxyMissingError';
  constructor() {
    super('This site doesn’t allow direct downloads. Set up the download proxy in Settings.');
  }
}
export class UpstreamError extends Error {
  readonly name = 'UpstreamError';
  constructor(readonly status: number) {
    super(
      status === 404
        ? 'Nothing found at that link (404).'
        : status === 401 || status === 403
          ? 'That site refused the download. It may need a login — try downloading it yourself and importing the file.'
          : `The site responded with an error (${status}).`,
    );
  }
}
export class InvalidLinkError extends Error {
  readonly name = 'InvalidLinkError';
  constructor() {
    super('Enter a full link starting with http:// or https://');
  }
}

export interface ProxyConfig {
  url: string;
  token: string;
}

export interface DownloadOptions {
  store: BlobStore;
  maxBytes: number;
  proxy?: ProxyConfig;
  /** Skip the direct attempt (for hosts known not to send CORS headers). */
  proxyOnly?: boolean;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number | null) => void;
  fetchImpl?: typeof fetch;
}

export function parseLink(input: string): URL {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    return url;
  } catch {
    throw new InvalidLinkError();
  }
}

export function proxiedUrl(proxy: ProxyConfig, target: string): string {
  return `${proxy.url.replace(/\/+$/, '')}/fetch?url=${encodeURIComponent(target)}`;
}

async function request(url: URL, options: DownloadOptions): Promise<Response> {
  const doFetch = options.fetchImpl ?? fetch;
  const viaProxy = async () => {
    if (!options.proxy?.url) throw new ProxyMissingError();
    let res: Response;
    try {
      res = await doFetch(proxiedUrl(options.proxy, url.href), {
        headers: { Authorization: `Bearer ${options.proxy.token}` },
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new NetworkError();
    }
    if (res.status === 401) throw new ProxyAuthError();
    if (res.status === 413) throw new TooLargeError(options.maxBytes);
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { error?: string } | null;
      const upstream = detail?.error?.match(/responded with (\d{3})/);
      throw new UpstreamError(upstream?.[1] ? Number(upstream[1]) : res.status);
    }
    return res;
  };

  if (options.proxyOnly) return viaProxy();
  try {
    const res = await doFetch(url.href, { signal: options.signal, mode: 'cors' });
    if (!res.ok) throw new UpstreamError(res.status);
    return res;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof UpstreamError) throw error;
    // A TypeError here is almost always CORS: the site doesn't allow browsers to fetch it.
    return viaProxy();
  }
}

/**
 * Downloads a PDF straight into the BlobStore, streaming so large files never sit in memory
 * twice. Validates the `%PDF-` header from the first bytes and enforces the size limit while
 * streaming. On any failure or cancel the partial file is removed. Returns the blob key.
 */
export async function downloadToStore(link: string, options: DownloadOptions): Promise<string> {
  const url = parseLink(link);
  const res = await request(url, options);
  const type = res.headers.get('Content-Type') ?? '';
  const totalHeader = Number(res.headers.get('Content-Length'));
  const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : null;

  if (/text\/html|application\/xhtml/i.test(type)) {
    await res.body?.cancel().catch(() => undefined);
    throw new NotPdfError(true);
  }
  if (total !== null && total > options.maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new TooLargeError(options.maxBytes);
  }
  if (!res.body) throw new NetworkError();
  await ensureSpaceFor(total ?? 0, options.store);

  let loaded = 0;
  let head = new Uint8Array(0);
  let checked = false;
  const guard = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      loaded += chunk.byteLength;
      if (loaded > options.maxBytes) {
        controller.error(new TooLargeError(options.maxBytes));
        return;
      }
      if (!checked) {
        const merged = new Uint8Array(head.length + chunk.length);
        merged.set(head);
        merged.set(chunk, head.length);
        head = merged.slice(0, 1024);
        if (head.length >= 1024 || hasPdfHeader(head)) {
          checked = true;
          if (!hasPdfHeader(head)) {
            const text = new TextDecoder().decode(head).toLowerCase();
            controller.error(new NotPdfError(text.includes('<html') || text.includes('<!doctype')));
            return;
          }
        }
      }
      controller.enqueue(chunk);
      options.onProgress?.(loaded, total);
    },
    flush(controller) {
      if (!checked && !hasPdfHeader(head)) {
        const text = new TextDecoder().decode(head).toLowerCase();
        controller.error(new NotPdfError(text.includes('<html') || text.includes('<!doctype')));
      }
    },
  });

  const key = `book-${crypto.randomUUID()}`;
  let streamError: unknown = null;
  const body = res.body.pipeThrough(guard, { signal: options.signal });
  try {
    await options.store.put(key, body);
  } catch (error) {
    streamError = error;
  }
  if (streamError) {
    await options.store.delete(key);
    if (options.signal?.aborted) throw new DOMException('Download cancelled', 'AbortError');
    if (
      streamError instanceof NotPdfError ||
      streamError instanceof TooLargeError ||
      (streamError as Error)?.name === 'QuotaError'
    ) {
      throw streamError;
    }
    // Errors from inside the pipe sometimes arrive wrapped; dig out ours.
    const cause = (streamError as { cause?: unknown }).cause;
    if (cause instanceof NotPdfError || cause instanceof TooLargeError) throw cause;
    throw new NetworkError();
  }
  return key;
}
