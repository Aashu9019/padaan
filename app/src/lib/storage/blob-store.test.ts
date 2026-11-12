// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PadaanDB } from './db';
import { ensureSpaceFor, IdbBlobStore, QuotaError, QUOTA_MARGIN_BYTES } from './blob-store';

describe('IdbBlobStore', () => {
  let database: PadaanDB;
  let store: IdbBlobStore;

  beforeEach(() => {
    database = new PadaanDB(`test-${crypto.randomUUID()}`);
    store = new IdbBlobStore(database);
  });

  afterEach(async () => {
    await database.delete();
  });

  it('round-trips a blob', async () => {
    await store.put('a', new Blob(['hello'], { type: 'application/pdf' }));
    const got = await store.get('a');
    expect(got).not.toBeNull();
    expect(await got!.text()).toBe('hello');
  });

  it('accepts a ReadableStream', async () => {
    const stream = new Blob(['%PDF-1.7 streamed']).stream();
    await store.put('s', stream);
    expect(await (await store.get('s'))!.text()).toBe('%PDF-1.7 streamed');
  });

  it('returns null for missing keys and deletes', async () => {
    expect(await store.get('missing')).toBeNull();
    await store.put('d', new Blob(['x']));
    await store.delete('d');
    expect(await store.get('d')).toBeNull();
  });
});

describe('ensureSpaceFor', () => {
  const fakeStore = (usage: number, quota: number) =>
    ({ estimate: vi.fn().mockResolvedValue({ usage, quota }) }) as unknown as IdbBlobStore;

  it('passes when there is room for the file plus margin', async () => {
    await expect(
      ensureSpaceFor(10, fakeStore(0, QUOTA_MARGIN_BYTES + 10)),
    ).resolves.toBeUndefined();
  });

  it('throws QuotaError when the margin would be eaten', async () => {
    await expect(ensureSpaceFor(10, fakeStore(0, QUOTA_MARGIN_BYTES + 9))).rejects.toBeInstanceOf(
      QuotaError,
    );
  });
});
