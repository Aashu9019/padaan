const CHUNK = 8 * 1024 * 1024;

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Content fingerprint used for duplicate detection.
 *
 * `crypto.subtle` can't hash incrementally, and loading a 300 MB file in one buffer is too
 * much on a phone. So we SHA-256 each 8 MB chunk and then SHA-256 the concatenated chunk
 * digests (plus the size). It isn't the file's plain SHA-256, but it's stable for the same
 * bytes, which is all deduplication needs.
 */
export async function fingerprint(blob: Blob): Promise<string> {
  const digests: Uint8Array[] = [];
  for (let offset = 0; offset < blob.size || offset === 0; offset += CHUNK) {
    const chunk = await blob.slice(offset, offset + CHUNK).arrayBuffer();
    digests.push(new Uint8Array(await crypto.subtle.digest('SHA-256', chunk)));
    if (blob.size === 0) break;
  }
  const sizeBytes = new TextEncoder().encode(String(blob.size));
  const all = new Uint8Array(digests.length * 32 + sizeBytes.length);
  digests.forEach((d, i) => all.set(d, i * 32));
  all.set(sizeBytes, digests.length * 32);
  return hex(await crypto.subtle.digest('SHA-256', all));
}
