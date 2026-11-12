/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { createReadStream, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Plugin } from 'vite';

// pdf.js needs its CMaps (CJK text), standard fonts and image decoders (JPEG 2000 / JBIG2 in
// scanned books) as separate files. Serve them in dev and emit them into the build at /pdfjs/.
// The JS-eval sandbox (quickjs) is left out: scripts in PDFs never run.
const pdfjsRoot = path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const PDFJS_DIRS = ['cmaps', 'standard_fonts', 'wasm'];
const pdfjsAssets = (): Plugin => ({
  name: 'padaan-pdfjs-assets',
  configureServer(server) {
    server.middlewares.use('/pdfjs', (req, res, next) => {
      const rel = decodeURIComponent((req.url ?? '').split('?')[0] ?? '').replace(/^\/+/, '');
      const file = path.join(pdfjsRoot, rel);
      if (!file.startsWith(pdfjsRoot) || !PDFJS_DIRS.includes(rel.split('/')[0] ?? ''))
        return next();
      try {
        if (!statSync(file).isFile()) return next();
      } catch {
        return next();
      }
      if (file.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
      createReadStream(file).pipe(res);
    });
  },
  generateBundle() {
    for (const dir of PDFJS_DIRS) {
      for (const name of readdirSync(path.join(pdfjsRoot, dir))) {
        if (name.startsWith('LICENSE') || name.startsWith('quickjs')) continue;
        this.emitFile({
          type: 'asset',
          fileName: `pdfjs/${dir}/${name}`,
          source: readFileSync(path.join(pdfjsRoot, dir, name)),
        });
      }
    }
  },
});

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    pdfjsAssets(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webp,ico,mp3,woff2,wasm,bcmap,pfb,ttf}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      devOptions: { enabled: false, type: 'module' },
      manifest: {
        name: 'Padaan — पडान',
        short_name: 'Padaan',
        description: 'Your personal shelf of PDF books, read like paper.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#1c1813',
        background_color: '#f3ede2',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'files', accept: ['application/pdf', '.pdf'] }] },
        },
      },
    }),
  ],
  worker: { format: 'es' },
  // Locally, /api goes to `pnpm --filter worker dev` (same proxy code as production).
  server: { proxy: { '/api': 'http://127.0.0.1:8790' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8790' } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
});
