import { useEffect, useState } from 'react';
import { getBlobStore } from '@/lib/storage/blob-store';

// Covers are small and shown repeatedly, so keep their object URLs for the session.
const cache = new Map<string, Promise<string | null>>();

function load(key: string): Promise<string | null> {
  let entry = cache.get(key);
  if (!entry) {
    entry = getBlobStore()
      .then((store) => store.get(key))
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null);
    cache.set(key, entry);
  }
  return entry;
}

export function forgetBlobUrl(key: string) {
  const entry = cache.get(key);
  cache.delete(key);
  void entry?.then((url) => url && URL.revokeObjectURL(url));
}

export function useBlobUrl(key: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    void load(key).then((value) => live && setUrl(value));
    return () => {
      live = false;
    };
  }, [key]);
  return key ? url : null;
}
