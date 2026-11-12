# Technical Spec — Folio

## 1. Architecture

```
┌──────────────────────── PWA (Vite + React) ────────────────────────┐
│ Routes: /  (library)   /add   /read/:bookId   /settings             │
│                                                                     │
│ features/add-book ──► lib/download (stream + progress + validate)   │
│        │                     │                                      │
│        ▼                     ▼                                      │
│ lib/sources (search)   lib/storage                                  │
│                         ├─ Dexie (IndexedDB): books, progress,      │
│                         │   bookmarks, settings, covers             │
│                         └─ BlobStore: OPFS ▸ fallback IDB Blob      │
│                                                                     │
│ features/reader ──► lib/pdf (pdf.js worker, PageRenderCache)        │
│                └──► page-flip (StPageFlip) with image pages         │
│                                                                     │
│ Service worker (Workbox): precache app shell, runtime cache covers  │
└─────────────────────────────────────────────────────────────────────┘
                 │ fetch(proxy/fetch?url=…, Authorization: Bearer)
                 ▼
┌──────── Cloudflare Worker /worker ────────┐
│ /fetch  – streams a remote PDF with CORS   │
│ /health                                     │
└────────────────────────────────────────────┘
```

## 2. Dependencies (approved list)
App: `react`, `react-dom`, `react-router-dom`, `zustand`, `dexie`, `dexie-react-hooks`, `pdfjs-dist`, `page-flip`, `tailwindcss`, `vite-plugin-pwa`, `clsx`.
Dev: `typescript`, `vite`, `vitest`, `@testing-library/react`, `@playwright/test`, `fake-indexeddb`, `eslint`, `prettier`.
Worker: `wrangler`, `typescript`.
Anything else → ask first.

## 3. Data model (Dexie)

```ts
interface Book {
  id: string;            // uuid
  hash: string;          // sha-256 of file, unique index
  title: string;
  author?: string;
  pageCount: number;
  sizeBytes: number;
  source: 'import' | 'link' | 'gutenberg' | 'openlibrary' | 'internetarchive';
  sourceUrl?: string;
  sourceId?: string;     // catalog id for search sources
  blobKey: string;       // key in BlobStore
  coverKey: string;      // key for cover image blob (webp, ~300px wide)
  pageAspect: number;    // width/height of page 1, used for layout
  hasOutline: boolean;
  addedAt: number;
  lastOpenedAt?: number;
}

interface Progress { bookId: string; page: number; updatedAt: number; } // page is 0-based
interface Bookmark { id: string; bookId: string; page: number; label?: string; createdAt: number; }
interface Settings { key: 'app'; theme: 'light'|'sepia'|'dark'; invertPagesInDark: boolean;
  sound: boolean; viewMode: 'auto'|'single'|'double'; flipMs: number; reducedMotion: 'system'|'on'|'off';
  maxDownloadMB: number; proxyUrl: string; proxyToken: string; }
```

Dexie schema v1:
```
books: 'id, &hash, title, author, addedAt, lastOpenedAt'
progress: 'bookId'
bookmarks: 'id, bookId, [bookId+page]'
settings: 'key'
blobs: 'key'          // only used by IDB fallback
```

## 4. BlobStore
Interface:
```ts
interface BlobStore {
  put(key: string, data: Blob | ReadableStream<Uint8Array>): Promise<void>;
  get(key: string): Promise<File | Blob | null>;
  delete(key: string): Promise<void>;
  estimate(): Promise<{ usage: number; quota: number }>;
}
```
- Primary: OPFS (`navigator.storage.getDirectory()`), write via `createWritable()` streaming, so large downloads aren't buffered in memory twice.
- Fallback: IndexedDB `blobs` table (Safari versions without `createWritable` — feature-detect).
- On first launch and after first book added: call `navigator.storage.persist()`; show result in Settings.
- Before writing: check `estimate()`; refuse if free space < file size + 50 MB margin.

## 5. Reader rendering

### 5.1 Loading
- `pdfjs-dist` with `GlobalWorkerOptions.workerSrc` pointing to the bundled worker (import with `?url` in Vite).
- Open with `getDocument({ data })` from the blob's ArrayBuffer, or better, `range`-free full data since it's local. Set `disableAutoFetch: true`, `isEvalSupported: false`.
- Password-protected → catch `PasswordException`, prompt, retry.

### 5.2 PageRenderCache
- Renders a page to an `OffscreenCanvas` (fallback `<canvas>`) at `targetWidth = containerPageWidth * min(devicePixelRatio, 2)`.
- Converts to `ImageBitmap` or object URL (`canvas.convertToBlob({type:'image/webp', quality:0.9})`).
- LRU cache, max ~12 pages or ~150 MB estimated (w*h*4), whichever first. Revoke object URLs on eviction.
- Render window: current spread ±2 spreads, prioritized: current → next → previous → rest. Cancel in-flight renders (`renderTask.cancel()`) that leave the window.
- Re-render at higher resolution only for the zoom view.
- Placeholder while rendering: light paper texture with page number (never a blank white flash).

### 5.3 Page-flip integration (StPageFlip)
- Use `PageFlip` with `loadFromHTML` on a list of page `<div>`s; each div contains an `<img>` filled lazily from the cache. Do not create 1,000 DOM nodes for a 1,000-page book: create all page divs as lightweight empty shells (StPageFlip needs the count), but only attach `<img src>` for pages inside the render window. If performance on a 1,000+ page book is poor, implement chunked "volumes" (load ±50 pages, rebuild the flip instance when crossing a boundary, preserving current page) — document the choice in code.
- Config: `size: 'stretch'`, width/height from `pageAspect`, `showCover: true`, `usePortrait: true` (auto single page in portrait), `drawShadow: true`, `maxShadowOpacity: 0.5`, `flippingTime: settings.flipMs` (default 700), `mobileScrollSupport: false`, `swipeDistance: 30`.
- Force single/double from settings by toggling `usePortrait` and container width.
- Events: `flip` → update progress (debounced 500 ms write to Dexie) and shift render window; `changeOrientation` → recompute target widths, clear cache of wrong-size renders.
- Reduced motion: skip StPageFlip, use a simple horizontal translate/fade pager component with the same API (`ReaderEngine` interface: `goTo`, `next`, `prev`, `onPageChange`).
- Edge tap zones (left 20% / right 20%) → prev/next; center tap → toggle toolbar.
- Sound: small preloaded audio file (generated/royalty-free, bundled), played on `flip`, only when enabled.

### 5.4 Zoom view
- Separate overlay; renders the current page at 2–3× with pinch-zoom and pan (CSS transform + pointer events, no extra library). Flip gestures disabled while open.

### 5.5 Dark/sepia
- Sepia: CSS filter `sepia(0.35) brightness(0.97)` on page images.
- Dark: background dark; page images either untouched or `invert(0.9) hue-rotate(180deg)` if `invertPagesInDark`.

### 5.6 Outline & thumbnails
- `pdf.getOutline()` → resolve destinations to page indices with `getDestination` + `getPageIndex`.
- Thumbnails rendered at ~120px wide, lazily as the strip scrolls; cached separately (small LRU).

## 6. Download pipeline (`lib/download`)
```
downloadPdf(url, { signal, onProgress }) → { blobKey, hash, size }
```
1. Build `proxyUrl/fetch?url=encodeURIComponent(url)` with `Authorization: Bearer <token>`.
   - Exception: sources that serve CORS-enabled files directly may be fetched directly; fall back to proxy on CORS failure.
2. Stream body: tee into (a) BlobStore writer, (b) incremental SHA-256 (use a small streaming hash, or hash after write by reading back in chunks with `crypto.subtle` on 8 MB chunks + combine — simplest: hash after write).
3. Check first 5 bytes = `%PDF-`; abort and delete if not.
4. Enforce max size during streaming; abort with clear error.
5. After write: open with pdf.js to read metadata, page count, page-1 aspect, outline presence; render page 1 cover → webp → BlobStore.
6. Duplicate check by hash → if exists, delete new blob, return existing book.
7. Insert `Book`.
Errors are typed: `NotPdfError`, `TooLargeError`, `QuotaError`, `NetworkError`, `ProxyAuthError`, `UpstreamError(status)`.

## 7. Proxy worker (`/worker`)
Endpoints:
- `GET /fetch?url=` — requires `Authorization: Bearer ${env.PROXY_TOKEN}`.
- `GET /health`.

Rules:
- Only `http:`/`https:` URLs; reject credentials in URL.
- SSRF: reject hostnames that are IPs in private/loopback/link-local ranges, `localhost`, `*.local`, `*.internal`; reject non-standard ports other than 80/443.
- Follow up to 5 redirects manually, re-validating each hop.
- Upstream request with a normal browser-like `User-Agent` and `Accept: application/pdf,*/*`.
- Stream the response through (no buffering). Pass `Content-Length`, `Content-Type`, `Content-Disposition`.
- Enforce max bytes (env `MAX_BYTES`, default 300 MB) by counting while streaming; terminate if exceeded.
- CORS: `Access-Control-Allow-Origin` = the app origin from env (`APP_ORIGIN`), allow `Authorization` header, handle `OPTIONS`.
- Only fetches the single given URL. No HTML parsing, no link discovery, no crawling.
- Note: Cloudflare Workers free plan has request/CPU limits; streaming pass-through keeps CPU low. Document in README.

## 8. Search sources (`lib/sources`)
Common interface:
```ts
interface SearchResult { source: Book['source']; id: string; title: string; authors: string[];
  year?: number; coverUrl?: string; pdfUrl: string; }
interface SourceClient { search(q: string, page: number, signal: AbortSignal): Promise<{results: SearchResult[]; hasMore: boolean}> }
```
- **Gutendex** (`https://gutendex.com/books?search=`): use `formats['application/pdf']` if present; skip results without a PDF. (Most Gutenberg books are EPUB/HTML only — expect few PDF hits; that's acceptable in v1, note it in UI as "PDF editions only".)
- **Open Library** (`https://openlibrary.org/search.json?q=&fields=key,title,author_name,first_publish_year,cover_i,ia,ebook_access&has_fulltext=true`): keep only `ebook_access === 'public'`; map `ia[0]` to Internet Archive identifier and resolve the PDF via the IA metadata API.
- **Internet Archive** (`https://archive.org/advancedsearch.php?q=…&fl[]=identifier,title,creator,year&rows=20&output=json` with `mediatype:texts` and a filter for public-domain/openly downloadable collections): resolve PDF file via `https://archive.org/metadata/{id}` → file with `format` containing "Text PDF" or name ending `.pdf`; skip items that are access-restricted (lending/borrow-only — check for `access-restricted-item` in metadata) .
- Run sources in parallel, show each as it resolves; per-source errors don't break others.
- Verify each endpoint's current response shape at implementation time; write a thin adapter + unit tests with recorded fixtures.

## 9. PWA config
- `vite-plugin-pwa` with `registerType: 'prompt'` (show "Update available" toast).
- Manifest: name "Folio", standalone display, portrait-any orientation, theme color, maskable icons 192/512.
- `share_target` (Android): POST multipart with `files` accepting `application/pdf` → handled in SW, stashed in IDB, app opens `/add?shared=1` to finish import.
- Precache app shell + pdf.js worker. Runtime cache: covers from search APIs (CacheFirst, 7 days, max 200). Never cache proxy responses in SW (they go to BlobStore).
- iOS: add `apple-touch-icon`, `apple-mobile-web-app-capable` meta; show an "Install to home screen" hint on iOS Safari when not standalone.

## 10. Testing
- Unit: BlobStore (fake-indexeddb), download pipeline (mock fetch streams, not-PDF, too large, duplicate), source adapters (fixtures), outline resolution, LRU cache.
- Worker: unit tests for URL validation/SSRF rules.
- E2E (Playwright, Chromium + WebKit): import a sample public-domain PDF fixture → appears in library → open → flip 3 pages → reload → resumes on same page → go offline → still opens.
- Manual checklist on a real Android phone and iPhone (installed PWA).

## 11. Environment
App `.env`: `VITE_DEFAULT_PROXY_URL`.
Worker `wrangler.toml` vars/secrets: `PROXY_TOKEN` (secret), `APP_ORIGIN`, `MAX_BYTES`.
Hosting: app on Cloudflare Pages (or Vercel/Netlify); worker on Cloudflare Workers.
