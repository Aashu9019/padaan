import { describe, expect, it } from 'vitest';
import { buildSpreads, renderWindow, spreadIndexOf } from './spreads';

describe('buildSpreads', () => {
  it('single mode is one page per spread', () => {
    expect(buildSpreads(3, false)).toEqual([[0], [1], [2]]);
  });

  it('double mode keeps the cover alone and pairs the rest', () => {
    expect(buildSpreads(6, true)).toEqual([[0], [1, 2], [3, 4], [5]]);
    expect(buildSpreads(5, true)).toEqual([[0], [1, 2], [3, 4]]);
  });

  it('handles empty documents', () => {
    expect(buildSpreads(0, true)).toEqual([]);
  });
});

describe('spreadIndexOf', () => {
  it('maps pages to their spread', () => {
    const spreads = buildSpreads(9, true);
    for (let page = 0; page < 9; page++) {
      expect(spreads[spreadIndexOf(page, true)]).toContain(page);
    }
  });
});

describe('renderWindow', () => {
  it('orders current, next, previous', () => {
    const spreads = buildSpreads(10, false);
    expect(renderWindow(spreads, 4, 2)).toEqual([4, 5, 3, 6, 2]);
  });

  it('clips at the ends', () => {
    const spreads = buildSpreads(3, false);
    expect(renderWindow(spreads, 0, 2)).toEqual([0, 1, 2]);
  });
});
