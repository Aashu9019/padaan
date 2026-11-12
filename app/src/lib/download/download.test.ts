// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { BlobStore } from '../storage/blob-store';
import {
  downloadToStore,
  InvalidLinkError,
  NotPdfError,
  ProxyAuthError,
  ProxyMissingError,
  TooLargeError,
  UpstreamError,
} from './download';

function memoryStore(quota = 1e12) {
  const files = new Map<string, Blob>();
  const store: BlobStore = {
    kind: 'idb',
    async put(key, data) {
      files.set(key, data instanceof Blob ? data : await new Response(data).blob());
    },
    async get(key) {
      return files.get(key) ?? null;
    },
    async delete(key) {
      files.delete(key);
    },
    async estimate() {
      return { usage: 0, quota };
    },
  };
  return { store, files };
}

function streamOf(chunks: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const chunk of chunks) c.enqueue(enc.encode(chunk));
      c.close();
    },
  });
}

const pdfResponse = (chunks = ['%PDF-1.7\n', 'body body body']) =>
  new Response(streamOf(chunks), { headers: { 'Content-Type': 'application/pdf' } });

describe('downloadToStore', () => {
  it('stores a direct PDF and reports progress', async () => {
    const { store, files } = memoryStore();
    const onProgress = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(pdfResponse());
    const key = await downloadToStore('https://example.com/a.pdf', {
      store,
      maxBytes: 1e6,
      fetchImpl,
      onProgress,
    });
    expect(await files.get(key)!.text()).toBe('%PDF-1.7\nbody body body');
    expect(onProgress).toHaveBeenLastCalledWith(23, null);
  });

  it('falls back to the proxy when the direct fetch fails (CORS)', async () => {
    const { store } = memoryStore();
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(pdfResponse());
    await downloadToStore('https://example.com/a.pdf', {
      store,
      maxBytes: 1e6,
      fetchImpl,
      proxy: { url: 'https://proxy.dev/', token: 't' },
    });
    expect(fetchImpl.mock.calls[1]![0]).toBe(
      'https://proxy.dev/fetch?url=https%3A%2F%2Fexample.com%2Fa.pdf',
    );
    expect(fetchImpl.mock.calls[1]![1].headers.Authorization).toBe('Bearer t');
  });

  it('asks for a proxy when none is configured and CORS blocks', async () => {
    const { store } = memoryStore();
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      downloadToStore('https://example.com/a.pdf', { store, maxBytes: 1e6, fetchImpl }),
    ).rejects.toBeInstanceOf(ProxyMissingError);
  });

  it('explains when a link is a web page', async () => {
    const { store } = memoryStore();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response('<!doctype html><p>hi', { headers: { 'Content-Type': 'text/html' } }),
      );
    const err = await downloadToStore('https://example.com/page', {
      store,
      maxBytes: 1e6,
      fetchImpl,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(NotPdfError);
    expect(err.isWebPage).toBe(true);
  });

  it('detects HTML served with a misleading content type and cleans up', async () => {
    const { store, files } = memoryStore();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(streamOf(['<!DOCTYPE html><html>', 'x'.repeat(2000)]), {
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    );
    await expect(
      downloadToStore('https://example.com/x', { store, maxBytes: 1e6, fetchImpl }),
    ).rejects.toBeInstanceOf(NotPdfError);
    expect(files.size).toBe(0);
  });

  it('enforces the size limit while streaming', async () => {
    const { store, files } = memoryStore();
    const fetchImpl = vi.fn().mockResolvedValue(pdfResponse(['%PDF-1.7\n', 'x'.repeat(100)]));
    await expect(
      downloadToStore('https://example.com/a.pdf', { store, maxBytes: 50, fetchImpl }),
    ).rejects.toBeInstanceOf(TooLargeError);
    expect(files.size).toBe(0);
  });

  it('maps proxy errors', async () => {
    const { store } = memoryStore();
    const proxy = { url: 'https://p.dev', token: 'bad' };
    const auth = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(
      downloadToStore('https://e.com/a.pdf', {
        store,
        maxBytes: 1e6,
        fetchImpl: auth,
        proxy,
        proxyOnly: true,
      }),
    ).rejects.toBeInstanceOf(ProxyAuthError);
    const upstream = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'Upstream responded with 404' }), { status: 502 }),
      );
    const err = await downloadToStore('https://e.com/a.pdf', {
      store,
      maxBytes: 1e6,
      fetchImpl: upstream,
      proxy,
      proxyOnly: true,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.status).toBe(404);
  });

  it('rejects non-http links', async () => {
    const { store } = memoryStore();
    await expect(
      downloadToStore('javascript:alert(1)', { store, maxBytes: 1, fetchImpl: vi.fn() }),
    ).rejects.toBeInstanceOf(InvalidLinkError);
  });

  it('cancels and removes the partial file', async () => {
    const { store, files } = memoryStore();
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('%PDF-1.7\n'));
        // never closes: simulates a slow download
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(body));
    const pending = downloadToStore('https://e.com/a.pdf', {
      store,
      maxBytes: 1e6,
      fetchImpl,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(files.size).toBe(0);
  });
});
