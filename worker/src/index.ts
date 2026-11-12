import { BadUrlError, validateTargetUrl } from './validate.ts';

export interface Env {
  PROXY_TOKEN: string;
  /** Comma-separated list of origins allowed to call the proxy. */
  APP_ORIGIN: string;
  MAX_BYTES?: string;
  /**
   * "true" lets same-origin browser requests through without a token. Used when the proxy is
   * served from the app's own domain (Netlify edge function). Browsers set Sec-Fetch-Site and
   * pages can't forge it, so other websites can't use the proxy.
   */
  SAME_ORIGIN_ONLY?: string;
}

const MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 300 * 1024 * 1024;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = env.APP_ORIGIN.split(',').map((o) => o.trim());
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Headers', 'Authorization');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Type, Content-Disposition, X-Final-Url',
    );
    headers.set('Access-Control-Max-Age', '86400');
  }
  return headers;
}

function error(status: number, message: string, origin: string | null): Response {
  const headers = corsHeaders(origin);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify({ error: message }), { status, headers });
}

/** Constant-time string comparison so the token can't be guessed byte by byte. */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Follows redirects by hand so every hop is re-validated against the SSRF rules. */
async function fetchFollowingSafely(start: URL): Promise<{ response: Response; finalUrl: URL }> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(url.toString(), {
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/pdf,*/*;q=0.8' },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location');
      if (!location) return { response, finalUrl: url };
      url = validateTargetUrl(new URL(location, url).toString());
      continue;
    }
    return { response, finalUrl: url };
  }
  throw new BadUrlError('Too many redirects');
}

/** Passes bytes through, cutting the stream off once it exceeds the limit. */
function limitStream(body: ReadableStream<Uint8Array>, maxBytes: number) {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > maxBytes) {
          controller.error(new Error('File exceeds the size limit'));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

async function handleFetch(request: Request, env: Env, origin: string | null): Promise<Response> {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const sameOrigin =
    env.SAME_ORIGIN_ONLY === 'true' && request.headers.get('Sec-Fetch-Site') === 'same-origin';
  const tokenOk = Boolean(env.PROXY_TOKEN) && safeEqual(token, env.PROXY_TOKEN);
  if (!sameOrigin && !tokenOk) {
    return error(401, 'Invalid or missing token', origin);
  }

  const target = new URL(request.url).searchParams.get('url');
  if (!target) return error(400, 'Missing url parameter', origin);

  let url: URL;
  try {
    url = validateTargetUrl(target);
  } catch (e) {
    return error(400, (e as Error).message, origin);
  }

  const maxBytes = Number(env.MAX_BYTES) || DEFAULT_MAX_BYTES;
  let upstream: Response;
  let finalUrl: URL;
  try {
    ({ response: upstream, finalUrl } = await fetchFollowingSafely(url));
  } catch (e) {
    if (e instanceof BadUrlError) return error(400, e.message, origin);
    return error(502, 'Could not reach that server', origin);
  }

  if (!upstream.ok || !upstream.body) {
    return error(502, `Upstream responded with ${upstream.status}`, origin);
  }

  const length = Number(upstream.headers.get('Content-Length'));
  if (length && length > maxBytes) return error(413, 'File exceeds the size limit', origin);

  const headers = corsHeaders(origin);
  for (const name of ['Content-Length', 'Content-Type', 'Content-Disposition']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('X-Final-Url', finalUrl.toString());
  headers.set('Cache-Control', 'no-store');
  return new Response(limitStream(upstream.body, maxBytes), { status: 200, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request, env);
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: origin ? 204 : 403, headers: corsHeaders(origin) });
    }
    if (request.method !== 'GET') return error(405, 'Method not allowed', origin);
    // Served at the root on Cloudflare and under /api on Netlify.
    const route = pathname.replace(/^\/api(?=\/)/, '');
    if (route === '/health') {
      const headers = corsHeaders(origin);
      headers.set('Content-Type', 'application/json');
      return new Response(JSON.stringify({ ok: true }), { headers });
    }
    if (route === '/fetch') {
      const sameSite = request.headers.get('Sec-Fetch-Site') === 'same-origin';
      if (!origin && !sameSite && request.headers.get('Origin')) {
        return error(403, 'Origin not allowed', null);
      }
      return handleFetch(request, env, origin);
    }
    return error(404, 'Not found', origin);
  },
} satisfies ExportedHandler<Env>;
