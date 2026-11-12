/// <reference lib="webworker" />
// Hand-written service worker (vite-plugin-pwa injectManifest). Kept dependency-free:
// precache the app shell, serve navigations from the cached index.html, cache search
// covers, and accept PDFs from the Android share sheet.

import { putSharedFiles } from './lib/share-inbox';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const VERSION = 'v1';
const SHELL_CACHE = `padaan-shell-${VERSION}`;
const COVER_CACHE = 'padaan-covers';
const COVER_MAX_ENTRIES = 200;
const COVER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const COVER_HOSTS = new Set(['covers.openlibrary.org', 'archive.org', 'www.gutenberg.org']);

const manifest = self.__WB_MANIFEST;
// The injected manifest can list the same URL twice (icons are also manifest icons);
// cache.addAll rejects duplicates, so dedupe first.
const shellUrls = [...new Set(manifest.map((entry) => new URL(entry.url, self.location.href).href))];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(shellUrls);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('padaan-shell-') && key !== SHELL_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

async function handleShareTarget(request: Request): Promise<Response> {
  try {
    const form = await request.formData();
    const files = form.getAll('files').filter((item): item is File => item instanceof File);
    await putSharedFiles(files);
  } catch {
    // Fall through: the add page will show that nothing was received.
  }
  return Response.redirect('/add?shared=1', 303);
}

// Covers are cached for about a week: the cache name rotates weekly and old ones are dropped.
function coverCacheName() {
  return `${COVER_CACHE}-${Math.floor(Date.now() / COVER_MAX_AGE_MS)}`;
}

async function coverCacheFirst(request: Request): Promise<Response> {
  const name = coverCacheName();
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    await cache.put(request, response.clone());
    void (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith(`${COVER_CACHE}-`) && k !== name).map((k) => caches.delete(k)),
      );
      const entries = await cache.keys();
      for (const key of entries.slice(0, Math.max(0, entries.length - COVER_MAX_ENTRIES))) {
        await cache.delete(key);
      }
    })();
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === 'POST' && url.origin === self.location.origin && url.pathname === '/share-target') {
    event.respondWith(handleShareTarget(request));
    return;
  }

  if (request.method !== 'GET') return;

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      event.respondWith(
        (async () => {
          const cache = await caches.open(SHELL_CACHE);
          const shell = await cache.match(new URL("/index.html", self.location.href).href, { ignoreVary: true });
          if (shell) return shell;
          return fetch(request);
        })(),
      );
      return;
    }
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const hit = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
        return hit ?? fetch(request);
      })(),
    );
    return;
  }

  if (request.destination === 'image' && COVER_HOSTS.has(url.hostname)) {
    event.respondWith(coverCacheFirst(request));
  }
});
