/**
 * Page layout for book-style reading. In double mode the cover (page 0) stands alone on the
 * right, then pages pair up [1,2], [3,4]… like an open book. A trailing odd page stands alone.
 */
export type Spread = number[];

export function buildSpreads(pageCount: number, double: boolean): Spread[] {
  if (pageCount <= 0) return [];
  if (!double) return Array.from({ length: pageCount }, (_, i) => [i]);
  const spreads: Spread[] = [[0]];
  for (let i = 1; i < pageCount; i += 2) {
    spreads.push(i + 1 < pageCount ? [i, i + 1] : [i]);
  }
  return spreads;
}

export function spreadIndexOf(page: number, double: boolean): number {
  if (!double) return page;
  return page === 0 ? 0 : Math.floor((page + 1) / 2);
}

/**
 * Pages to keep rendered around the current one, in priority order:
 * current spread, next, previous, then further out.
 */
export function renderWindow(spreads: Spread[], current: number, radius = 2): number[] {
  const order: number[] = [];
  const push = (i: number) => {
    const spread = spreads[i];
    if (spread) order.push(...spread);
  };
  push(current);
  for (let d = 1; d <= radius; d++) {
    push(current + d);
    push(current - d);
  }
  return order;
}
