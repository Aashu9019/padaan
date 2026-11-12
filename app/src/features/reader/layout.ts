import type { ViewMode } from '@/lib/storage/db';

export interface ReaderLayout {
  double: boolean;
  pageWidth: number;
  pageHeight: number;
}

/** Room left around the book on each side, in CSS pixels. */
const PAD_X = 12;
const PAD_Y = 16;

/**
 * Picks single or double pages and the largest page size that fits the stage.
 * Auto mode uses a spread when the screen is landscape and wide enough for two
 * readable pages.
 */
export function computeLayout(
  stageWidth: number,
  stageHeight: number,
  aspect: number,
  mode: ViewMode,
): ReaderLayout {
  const safeAspect = aspect > 0 && Number.isFinite(aspect) ? aspect : 0.7;
  const availW = Math.max(stageWidth - PAD_X * 2, 100);
  const availH = Math.max(stageHeight - PAD_Y * 2, 100);

  const fit = (pages: number) => {
    let h = availH;
    let w = h * safeAspect;
    if (w * pages > availW) {
      w = availW / pages;
      h = w / safeAspect;
    }
    return { pageWidth: Math.floor(w), pageHeight: Math.floor(h) };
  };

  let double: boolean;
  if (mode === 'single') double = false;
  else if (mode === 'double') double = stageWidth >= 480;
  else double = stageWidth > stageHeight && stageWidth >= 700;

  return { double, ...fit(double ? 2 : 1) };
}
