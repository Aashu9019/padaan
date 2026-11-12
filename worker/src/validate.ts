export class BadUrlError extends Error {
  readonly name = 'BadUrlError';
}

function parseIPv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return nums.every((n) => n >= 0 && n <= 255) ? nums : null;
}

function isPrivateIPv4([a, b]: number[]): boolean {
  if (a === undefined || b === undefined) return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast + reserved
  );
}

function isBlockedIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === '::' || h === '::1') return true;
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // unique local
  if (/^fe[89ab]/.test(h)) return true; // link-local
  if (h.startsWith('ff')) return true; // multicast
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) {
    const v4 = parseIPv4(mapped[1]);
    return !v4 || isPrivateIPv4(v4);
  }
  // Any other literal IPv6 address: allowed only if clearly global unicast (2000::/3).
  return !/^[23]/.test(h);
}

/**
 * Validates a user-supplied URL before the proxy fetches it. Rejects anything that could
 * reach private infrastructure (SSRF): non-http(s), credentials, odd ports, localhost,
 * internal names and private/loopback/link-local IP literals.
 */
export function validateTargetUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadUrlError('Not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadUrlError('Only http and https URLs are allowed');
  }
  if (url.username || url.password) throw new BadUrlError('Credentials in URLs are not allowed');
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new BadUrlError('Only standard ports are allowed');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) throw new BadUrlError('Missing host');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host.endsWith('.home.arpa')
  ) {
    throw new BadUrlError('Local hostnames are not allowed');
  }
  if (host.includes(':') || host.startsWith('[')) {
    if (isBlockedIPv6(host)) throw new BadUrlError('Private addresses are not allowed');
  } else {
    const v4 = parseIPv4(host);
    if (v4 && isPrivateIPv4(v4)) throw new BadUrlError('Private addresses are not allowed');
    // Bare numbers like http://2130706433/ are decimal IPs; refuse them outright.
    if (/^\d+$/.test(host) || /^0x/i.test(host))
      throw new BadUrlError('Numeric hosts are not allowed');
    if (!host.includes('.')) throw new BadUrlError('Hostname must be fully qualified');
  }
  return url;
}
