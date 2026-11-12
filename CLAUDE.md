# CLAUDE.md — Folio (personal PDF book reader PWA)

Read this first, then `docs/PRD.md`, `docs/TECH_SPEC.md`, and `docs/IMPLEMENTATION_PLAN.md`.

## What this is
A personal, installable PWA that lets one user (the owner) add PDF books — by importing a local file, pasting a direct link, or searching free/public-domain sources — stores them offline on the device, and reads them with a realistic page-flip animation like a physical book.

## Hard rules
- **Build phase by phase** following `docs/IMPLEMENTATION_PLAN.md`. Finish, test, and commit each phase before starting the next. Do not skip ahead.
- **Do not add integrations with torrent sites, piracy indexes, or shadow libraries** (e.g. The Pirate Bay, LibGen, Z-Library, Anna's Archive), and do not add torrent/magnet support. Search integrations are limited to the sources listed in the PRD.
- The link-fetch proxy fetches only a URL the user explicitly pastes. It must not crawl, scrape search pages, or follow pages to find files.
- TypeScript strict mode. No `any` without a comment explaining why.
- Every feature must work offline after a book is downloaded (except search and fetching new books).
- Mobile-first. Test layouts at 375px wide and on a landscape tablet size.
- Respect `prefers-reduced-motion` (fall back to a simple slide/fade instead of page curl).
- Keep dependencies minimal; ask before adding any dependency not listed in `docs/TECH_SPEC.md`.

## Stack (summary — details in TECH_SPEC)
- React 18 + TypeScript + Vite
- `vite-plugin-pwa` (Workbox) for service worker + manifest
- `pdfjs-dist` for PDF parsing/rendering (worker enabled)
- `page-flip` (StPageFlip) for the book animation
- Dexie (IndexedDB) for metadata; OPFS for PDF binaries with IndexedDB Blob fallback
- Zustand for UI state, React Router for routes
- Tailwind CSS
- Cloudflare Worker (`/worker`) as the CORS fetch proxy, TypeScript, Wrangler
- Vitest + Testing Library for unit tests; Playwright for a few e2e smoke tests

## Repo layout
```
/app            # the PWA (Vite project)
  /src
    /features/library
    /features/reader
    /features/add-book      # import, paste link, search
    /lib/storage            # Dexie db + OPFS blob store
    /lib/pdf                # pdf.js loading + page render cache
    /lib/sources            # Gutendex, Open Library, Internet Archive clients
    /components
    /routes
/worker         # Cloudflare Worker proxy
/docs           # PRD, tech spec, implementation plan
```

## Commands (create these in phase 0)
- `pnpm dev` — run app
- `pnpm build && pnpm preview` — test production PWA (service worker only works in build)
- `pnpm test` — unit tests
- `pnpm e2e` — Playwright
- `pnpm --filter worker dev` / `deploy` — worker

## Definition of done for any feature
1. Works offline where applicable.
2. Works on mobile Chrome (Android) and iOS Safari installed-to-home-screen.
3. No console errors; unit tests added for logic in `/lib`.
4. Large PDF (300+ pages, scanned) does not freeze the UI.
