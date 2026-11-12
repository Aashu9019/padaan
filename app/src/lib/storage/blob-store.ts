import { db as defaultDb, type PadaanDB } from './db';

export interface StorageEstimateResult {
  usage: number;
  quota: number;
}

export interface BlobStore {
  readonly kind: 'opfs' | 'idb';
  put(key: string, data: Blob | ReadableStream<Uint8Array>): Promise<void>;
  get(key: string): Promise<File | Blob | null>;
  delete(key: string): Promise<void>;
  estimate(): Promise<StorageEstimateResult>;
}

export class QuotaError extends Error {
  readonly name = 'QuotaError';
  constructor(
    readonly needed: number,
    readonly available: number,
  ) {
    super('Not enough storage space on this device.');
  }
}

/** Space kept free beyond the file itself, so the browser never runs right up to its quota. */
export const QUOTA_MARGIN_BYTES = 50 * 1024 * 1024;

export async function estimateStorage(): Promise<StorageEstimateResult> {
  if (!navigator.storage?.estimate) return { usage: 0, quota: Number.POSITIVE_INFINITY };
  const { usage = 0, quota = Number.POSITIVE_INFINITY } = await navigator.storage.estimate();
  return { usage, quota };
}

/** Throws QuotaError when `bytes` plus the safety margin won't fit. */
export async function ensureSpaceFor(bytes: number, store: BlobStore): Promise<void> {
  const { usage, quota } = await store.estimate();
  const available = quota - usage;
  if (bytes + QUOTA_MARGIN_BYTES > available) throw new QuotaError(bytes, available);
}

/** Sanitise a key for use as an OPFS file name. */
function fileName(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export class OpfsBlobStore implements BlobStore {
  readonly kind = 'opfs' as const;
  private dir: Promise<FileSystemDirectoryHandle>;

  constructor(dirName = 'padaan-blobs') {
    this.dir = navigator.storage
      .getDirectory()
      .then((root) => root.getDirectoryHandle(dirName, { create: true }));
  }

  async put(key: string, data: Blob | ReadableStream<Uint8Array>): Promise<void> {
    const dir = await this.dir;
    const handle = await dir.getFileHandle(fileName(key), { create: true });
    const writable = await handle.createWritable();
    try {
      if (data instanceof Blob) {
        // Stream the blob so large files aren't copied into memory a second time.
        await data.stream().pipeTo(writable);
      } else {
        await data.pipeTo(writable);
      }
    } catch (error) {
      await writable.abort().catch(() => undefined);
      await dir.removeEntry(fileName(key)).catch(() => undefined);
      throw error;
    }
  }

  async get(key: string): Promise<File | null> {
    const dir = await this.dir;
    try {
      const handle = await dir.getFileHandle(fileName(key));
      return await handle.getFile();
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const dir = await this.dir;
    await dir.removeEntry(fileName(key)).catch(() => undefined);
  }

  estimate(): Promise<StorageEstimateResult> {
    return estimateStorage();
  }
}

export class IdbBlobStore implements BlobStore {
  readonly kind = 'idb' as const;

  constructor(private readonly database: PadaanDB = defaultDb) {}

  async put(key: string, data: Blob | ReadableStream<Uint8Array>): Promise<void> {
    const blob = data instanceof Blob ? data : await new Response(data).blob();
    await this.database.blobs.put({ key, data: await blob.arrayBuffer(), type: blob.type });
  }

  async get(key: string): Promise<Blob | null> {
    const row = await this.database.blobs.get(key);
    return row ? new Blob([row.data], { type: row.type }) : null;
  }

  async delete(key: string): Promise<void> {
    await this.database.blobs.delete(key);
  }

  estimate(): Promise<StorageEstimateResult> {
    return estimateStorage();
  }
}

/** OPFS needs `createWritable` for streaming writes; older Safari has OPFS without it. */
export async function supportsOpfsWritable(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return false;
    if (typeof FileSystemFileHandle === 'undefined') return false;
    if (!('createWritable' in FileSystemFileHandle.prototype)) return false;
    await navigator.storage.getDirectory();
    return true;
  } catch {
    return false;
  }
}

let storePromise: Promise<BlobStore> | null = null;

export function getBlobStore(): Promise<BlobStore> {
  storePromise ??= supportsOpfsWritable().then((ok) =>
    ok ? new OpfsBlobStore() : new IdbBlobStore(),
  );
  return storePromise;
}
