/**
 * The page-curl engine loads a "volume" — a slice of the book around the current page — rather
 * than every page, so long books open as fast as short ones. Pages are global 0-based indices;
 * `end` is exclusive.
 */
export interface Volume {
  start: number;
  end: number;
}

export const VOLUME_SIZE = 60;
/** Rebuild when the reader gets this close to a volume edge that isn't the book's edge. */
export const VOLUME_MARGIN = 6;

/**
 * In spread mode pages pair as [0], [1,2], [3,4]…, so a volume that doesn't start at the cover
 * must start on an odd page to keep the same pairs.
 */
export function volumeAround(page: number, pageCount: number, double: boolean): Volume {
  if (pageCount <= VOLUME_SIZE) return { start: 0, end: pageCount };
  const fix = (s: number) => {
    if (s <= 0) return 0;
    return double && s % 2 === 0 ? s - 1 : s;
  };
  let start = fix(Math.max(0, page - Math.floor(VOLUME_SIZE / 2)));
  let end = Math.min(pageCount, start + VOLUME_SIZE);
  if (end === pageCount) {
    start = fix(Math.max(0, end - VOLUME_SIZE));
    end = pageCount;
  }
  return { start, end };
}

export function needsNewVolume(page: number, volume: Volume, pageCount: number): boolean {
  if (page < volume.start || page >= volume.end) return true;
  const nearStart = volume.start > 0 && page - volume.start < VOLUME_MARGIN;
  const nearEnd = volume.end < pageCount && volume.end - 1 - page < VOLUME_MARGIN;
  return nearStart || nearEnd;
}
