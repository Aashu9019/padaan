/**
 * Size-bounded LRU. Evicts least-recently-used entries once either the entry count or the
 * summed `cost` exceeds its limit. `onEvict` lets callers release resources (object URLs).
 */
export class LruCache<K, V> {
  private map = new Map<K, { value: V; cost: number }>();
  private total = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxCost: number,
    private readonly onEvict?: (key: K, value: V) => void,
  ) {}

  get size() {
    return this.map.size;
  }

  get cost() {
    return this.total;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  peek(key: K): V | undefined {
    return this.map.get(key)?.value;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  set(key: K, value: V, cost = 0, pinned: ReadonlySet<K> = new Set()): void {
    const old = this.map.get(key);
    if (old) {
      this.map.delete(key);
      this.total -= old.cost;
      if (old.value !== value) this.onEvict?.(key, old.value);
    }
    this.map.set(key, { value, cost });
    this.total += cost;
    this.trim(pinned);
  }

  delete(key: K): void {
    const entry = this.map.get(key);
    if (!entry) return;
    this.map.delete(key);
    this.total -= entry.cost;
    this.onEvict?.(key, entry.value);
  }

  /** Evict oldest entries until within limits, skipping keys in `pinned`. */
  trim(pinned: ReadonlySet<K> = new Set()): void {
    for (const key of [...this.map.keys()]) {
      if (this.map.size <= this.maxEntries && this.total <= this.maxCost) return;
      if (pinned.has(key)) continue;
      this.delete(key);
    }
  }

  clear(): void {
    for (const key of [...this.map.keys()]) this.delete(key);
  }
}
