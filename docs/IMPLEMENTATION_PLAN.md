# Implementation Plan — Padaan

Work one phase at a time. At the end of each phase: run tests, run `pnpm build && pnpm preview`, check acceptance criteria, commit with message `phase N: <summary>`.

---

## Phase 0 — Scaffold
- pnpm workspace with `/app` (Vite React TS) and `/worker` (Wrangler TS).
- Tailwind, ESLint, Prettier, Vitest, Playwright set up.
- Routes stubbed: `/`, `/add`, `/read/:bookId`, `/settings`.
- `vite-plugin-pwa` with manifest + placeholder icons.
**Accept:** app builds, installs as PWA in Chrome, loads offline (empty shell).

## Phase 1 — Storage layer
- Dexie schema (TECH_SPEC §3), BlobStore with OPFS + IDB fallback (§4), `persist()` request, storage estimate util.
- Unit tests with fake-indexeddb.
**Accept:** tests pass; can put/get/delete a 50 MB blob in browser without memory spike.

## Phase 2 — Import from device
- File picker + drag-drop; magic-byte check; hash; pdf.js metadata + page count + aspect + outline flag; cover render to webp.
- Library grid showing covers, title, author; delete; edit details; duplicate detection.
**Accept:** import 3 PDFs incl. one 300+ page scanned PDF; covers show; duplicates detected; survives reload and offline.

## Phase 3 — Basic reader (no flip yet)
- `lib/pdf` loader + PageRenderCache (LRU, windowed, cancellable).
- Simple pager engine (this becomes the reduced-motion engine) behind the `ReaderEngine` interface.
- Progress saving/resume; toolbar; page slider; keyboard nav.
**Accept:** 1,000-page PDF opens in < 2 s to first page, navigating doesn't freeze, memory stays bounded (check DevTools).

## Phase 4 — Page-flip engine
- Integrate StPageFlip per TECH_SPEC §5.3; cover as hard page; single/double auto switch on orientation; tap zones; drag corners/swipe.
- Placeholders with paper texture while rendering.
- Settings: view mode, flip speed, reduced motion.
**Accept:** smooth flips on a mid-range Android phone; rotation switches layout without losing page; no blank-page flashes at normal reading speed.

## Phase 5 — Reader extras
- Bookmarks, outline/TOC panel, thumbnail strip, zoom overlay, themes (light/sepia/dark+invert), fullscreen, optional flip sound, password-protected PDF prompt.
**Accept:** all features work offline; zoom pinch works on iOS and Android.

## Phase 6 — Proxy worker
- Implement `/fetch` and `/health` with auth, SSRF rules, redirect handling, streaming, size cap, CORS (TECH_SPEC §7). Unit tests for validators.
- README section: deploy steps, setting `PROXY_TOKEN`, `APP_ORIGIN`.
**Accept:** fetching a public PDF URL streams correctly; private IPs, localhost, bad token, oversize all rejected with clear status codes.

## Phase 7 — Paste link
- `lib/download` pipeline (TECH_SPEC §6) with progress, cancel, typed errors and friendly messages (esp. "this is a web page, not a PDF").
- Settings: proxy URL + token, max download size.
**Accept:** paste a direct PDF link → progress → book in library; HTML link gives helpful error; cancel cleans up partial file.

## Phase 8 — Search free sources
- Source adapters: Gutendex, Open Library (public only), Internet Archive (open items only), with fixtures + tests.
- Search UI: debounce, per-source sections, load more, "PDF editions only" note, tap to download via Phase 7 pipeline.
**Accept:** searching a classic title returns downloadable results from at least one source; one source failing doesn't break others.

## Phase 9 — PWA polish
- Update prompt toast; Android share target for PDFs; iOS install hint; storage panel (per-book sizes, total, persist status); backup export/import JSON (metadata only).
- Icons, splash colors, empty states, error boundaries.
**Accept:** Lighthouse PWA installable; share a PDF from Android Files into the app imports it; backup round-trips.

## Phase 10 — Hardening
- Playwright e2e on Chromium + WebKit (TECH_SPEC §10).
- Manual device checklist (below).
- Performance pass on largest test PDF.

### Manual device checklist
- [ ] Android Chrome, installed: import, paste link, search, read, rotate, offline, share-target
- [ ] iPhone Safari, installed to home screen: import, read, rotate, offline, reopen after a day
- [ ] Desktop Chrome: keyboard nav, two-page spread, drag-drop import
- [ ] Reduced motion on: pager used instead of curl
- [ ] Storage near-full: clear error, no corrupted book

## Test fixtures
Use only public-domain PDFs (e.g. from Project Gutenberg or Internet Archive public-domain collections) committed under `/app/tests/fixtures` — a small text PDF (~20 pages), a large scanned PDF (300+ pages, can be downloaded by a setup script rather than committed), and a password-protected PDF generated locally.
