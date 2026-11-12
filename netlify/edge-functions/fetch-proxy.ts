// The link proxy, served from the app's own domain on Netlify. Same code as the Cloudflare
// worker (worker/src/index.ts). Same-origin requests from the app need no token; set
// PROXY_TOKEN in Netlify's environment variables to also allow token-authenticated use.
import proxy from '../../worker/src/index.ts';

declare const Netlify: { env: { get(name: string): string | undefined } };

export default (request: Request) =>
  proxy.fetch(request, {
    PROXY_TOKEN: Netlify.env.get('PROXY_TOKEN') ?? '',
    APP_ORIGIN: Netlify.env.get('APP_ORIGIN') ?? new URL(request.url).origin,
    MAX_BYTES: Netlify.env.get('MAX_BYTES'),
    SAME_ORIGIN_ONLY: 'true',
  });

export const config = { path: ['/api/fetch', '/api/health'] };
