// Renders the app icons to PNG with headless Chromium. Run: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#7a2e22"/>
  <g transform="translate(256 270) scale(${1 - pad})">
    <path d="M-12 -120 C-70 -150 -140 -150 -196 -130 V120 C-140 100 -70 100 -12 130 Z" fill="#f3ede2"/>
    <path d="M12 -120 C70 -150 140 -150 196 -130 V120 C140 100 70 100 12 130 Z" fill="#e2d4bd"/>
    <path d="M-150 -80 C-110 -92 -70 -90 -40 -78 M-150 -40 C-110 -52 -70 -50 -40 -38 M-150 0 C-110 -12 -70 -10 -40 2" stroke="#7a2e22" stroke-opacity=".28" stroke-width="10" stroke-linecap="round" fill="none"/>
  </g>
</svg>`;

const targets = [
  ['public/icons/icon-192.png', 192, 0.12],
  ['public/icons/icon-512.png', 512, 0.12],
  ['public/icons/maskable-512.png', 512, 0.32],
  ['public/icons/apple-touch-icon.png', 180, 0.18],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, pad] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg(pad)}`,
  );
  await writeFile(file, await page.screenshot({ type: 'png' }));
}
await browser.close();
