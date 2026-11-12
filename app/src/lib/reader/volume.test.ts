import { describe, expect, it } from 'vitest';
import { needsNewVolume, volumeAround, VOLUME_MARGIN, VOLUME_SIZE } from './volume';

describe('volumeAround', () => {
  it('uses the whole book when it is short', () => {
    expect(volumeAround(10, 40, true)).toEqual({ start: 0, end: 40 });
  });

  it('centres on the page and stays within the book', () => {
    for (const page of [0, 1, 29, 30, 31, 500, 998, 999]) {
      for (const double of [false, true]) {
        const v = volumeAround(page, 1000, double);
        expect(v.start).toBeGreaterThanOrEqual(0);
        expect(v.end).toBeLessThanOrEqual(1000);
        expect(page).toBeGreaterThanOrEqual(v.start);
        expect(page).toBeLessThan(v.end);
        // +1: shifting the start back to an odd page can add one page.
        expect(v.end - v.start).toBeLessThanOrEqual(VOLUME_SIZE + 1);
        if (double && v.start > 0) expect(v.start % 2).toBe(1);
      }
    }
  });

  it('a fresh volume never immediately needs another', () => {
    for (let page = 0; page < 1000; page += 7) {
      const v = volumeAround(page, 1000, true);
      expect(needsNewVolume(page, v, 1000)).toBe(false);
    }
  });
});

describe('needsNewVolume', () => {
  const v = { start: 101, end: 161 };
  it('triggers near inner edges and outside', () => {
    expect(needsNewVolume(130, v, 1000)).toBe(false);
    expect(needsNewVolume(101 + VOLUME_MARGIN - 1, v, 1000)).toBe(true);
    expect(needsNewVolume(160 - VOLUME_MARGIN + 1, v, 1000)).toBe(true);
    expect(needsNewVolume(5, v, 1000)).toBe(true);
  });

  it('ignores the real start and end of the book', () => {
    expect(needsNewVolume(0, { start: 0, end: 60 }, 1000)).toBe(false);
    expect(needsNewVolume(999, { start: 940, end: 1000 }, 1000)).toBe(false);
  });
});
