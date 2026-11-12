import { describe, expect, it, vi } from 'vitest';
import { LruCache } from './lru';

describe('LruCache', () => {
  it('evicts least recently used past maxEntries', () => {
    const evicted = vi.fn();
    const lru = new LruCache<number, string>(2, Infinity, evicted);
    lru.set(1, 'a');
    lru.set(2, 'b');
    lru.get(1);
    lru.set(3, 'c');
    expect(lru.has(2)).toBe(false);
    expect(lru.has(1)).toBe(true);
    expect(evicted).toHaveBeenCalledWith(2, 'b');
  });

  it('evicts by cost', () => {
    const lru = new LruCache<number, string>(10, 100);
    lru.set(1, 'a', 60);
    lru.set(2, 'b', 60);
    expect(lru.has(1)).toBe(false);
    expect(lru.cost).toBe(60);
  });

  it('never evicts pinned keys', () => {
    const lru = new LruCache<number, string>(1, Infinity);
    lru.set(1, 'a');
    lru.set(2, 'b', 0, new Set([1, 2]));
    expect(lru.size).toBe(2);
    lru.trim(new Set([2]));
    expect(lru.has(1)).toBe(false);
  });

  it('calls onEvict when a value is replaced', () => {
    const evicted = vi.fn();
    const lru = new LruCache<number, string>(5, Infinity, evicted);
    lru.set(1, 'a');
    lru.set(1, 'b');
    expect(evicted).toHaveBeenCalledWith(1, 'a');
    expect(lru.get(1)).toBe('b');
  });
});
