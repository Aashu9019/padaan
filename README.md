# Padaan · पडान

A personal, installable PWA for reading PDF books with a real page-turn feel. Books live on the
device and open offline.

## Layout

- `app/` — the PWA (React 18, TypeScript, Vite, Tailwind, pdf.js, StPageFlip, Dexie)
- `worker/` — Cloudflare Worker that proxies a single pasted PDF URL with CORS
- `docs/` — PRD, tech spec, implementation plan

## Commands

```sh
pnpm install
pnpm dev                     # app dev server
pnpm build && pnpm preview   # production build (service worker only runs here)
pnpm test                    # unit tests (app + worker)
pnpm e2e                     # Playwright smoke tests
pnpm --filter worker dev     # proxy worker locally
pnpm --filter worker deploy  # deploy proxy worker
```

Regenerate icons after changing the artwork: `node app/scripts/make-icons.mjs` (run from `app/`).
