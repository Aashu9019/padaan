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

## Hosting the app (Netlify)

`netlify.toml` at the repo root does everything: connect the GitHub repo in Netlify and deploy.
Optionally set `VITE_DEFAULT_PROXY_URL` (your worker URL) in Netlify → Site settings →
Environment variables, so a fresh install already knows the proxy.

## Link proxy (Cloudflare Worker)

Browsers can't download most PDF links directly (CORS), so pasted links go through a tiny
worker in `worker/`. It fetches only the exact URL you paste — no crawling — and blocks
private/internal addresses.

```sh
cd worker
pnpm exec wrangler login
pnpm exec wrangler secret put PROXY_TOKEN   # make up a long random string
# set APP_ORIGIN in wrangler.toml to your Netlify URL, e.g. https://padaan.netlify.app
pnpm deploy
```

Then in the app open **Settings → Download proxy**, paste the worker URL
(`https://padaan-proxy.<you>.workers.dev`) and the same token.

Local dev: put `PROXY_TOKEN=devtoken` in `worker/.dev.vars` and run `pnpm --filter worker dev`.
The free Workers plan is enough: the worker streams bytes through without buffering, so CPU
time stays tiny, but very large files on slow upstreams can hit the plan's request limits.
