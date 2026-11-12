import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { PageFlip } from 'page-flip';
import { spreadIndexOf } from '@/lib/reader/spreads';
import { needsNewVolume, volumeAround, type Volume } from '@/lib/reader/volume';
import type { ReaderEngineHandle, ReaderEngineProps } from './engine';

const EDGE = 0.2;

interface FlipInternals {
  calc: { getPosition(): { x: number; y: number }; getCorner(): string } | null;
  getBoundsRect(): { pageWidth: number; height: number };
  animateFlippingTo(
    from: { x: number; y: number },
    to: { x: number; y: number },
    isTurned: boolean,
  ): void;
  stopMove(): void;
}

interface Point {
  x: number;
  y: number;
}

interface AppInternals {
  mousePosition: Point;
  isUserTouch: boolean;
  isUserMove: boolean;
  userMove(pos: Point, isTouch: boolean): void;
  userStop(pos: Point, isSwipe?: boolean): void;
  getCurrentPageIndex(): number;
  getRender(): { getRect(): { left: number; width: number; pageWidth: number } };
}

/** StPageFlip's FlipDirection enum (const enum, so plain numbers at runtime). */
const FORWARD = 0;
const BACK = 1;

/**
 * Single-page mode fixes for StPageFlip 2.0.7 (relies on internals; the bundle keeps these
 * names unminified, and each patch bails out if they're missing).
 *
 * 1. Direction: StPageFlip picks the turn direction from where the finger lands — only the
 *    leftmost 20% of the page turns back — so a natural swipe right from the middle folded the
 *    *next* page and sprang back. Pick it from which way the finger first moves instead, and
 *    make a backward drag pull the previous page in from the left, its edge following the
 *    finger.
 * 2. Release: StPageFlip completes a dragged turn only once the corner crosses the spine (the
 *    screen's left edge here), so a drag to the middle sprang back. Past the middle of the
 *    page, or on a quick swipe, complete the turn.
 */
function patchPortraitGestures(instance: PageFlip) {
  const app = instance as unknown as AppInternals;
  const flip = (instance as unknown as { getFlipController(): FlipInternals }).getFlipController();
  const ctl = flip as unknown as FlipInternals & {
    getDirectionByPoint?: (p: Point) => number;
  };
  if (
    typeof flip?.animateFlippingTo !== 'function' ||
    typeof ctl.getDirectionByPoint !== 'function' ||
    typeof app.userMove !== 'function' ||
    typeof app.userStop !== 'function'
  ) {
    return;
  }

  /** Direction of the drag in progress, decided by its first movement. */
  let direction: number | null = null;
  let startX = 0;
  let swiped = false;

  const byPoint = ctl.getDirectionByPoint.bind(ctl);
  ctl.getDirectionByPoint = (p) => direction ?? byPoint(p);

  const move = app.userMove.bind(app);
  app.userMove = (pos, isTouch) => {
    if (!app.isUserTouch) return move(pos, isTouch);
    if (direction === null) {
      const dx = pos.x - app.mousePosition.x;
      if (Math.abs(dx) <= 5) return;
      direction = dx > 0 && app.getCurrentPageIndex() > 0 ? BACK : FORWARD;
      startX = app.mousePosition.x;
    }
    if (direction === BACK) {
      // Back-turn coordinates are measured leftwards from the spine. Map "finger moved d px
      // right" to "page edge d px into the screen" so the page tracks the finger.
      const rect = app.getRender().getRect();
      const local = rect.pageWidth - 2 * Math.max(0, pos.x - startX);
      pos = { x: rect.left + rect.width / 2 - local, y: pos.y };
    }
    move(pos, isTouch);
  };

  const stop = app.userStop.bind(app);
  app.userStop = (pos, isSwipe = false) => {
    // StPageFlip answers a swipe with flipNext/flipPrev, which a click-disabled book ignores
    // mid-drag. Let the release rule below finish the turn instead.
    swiped = isSwipe && app.isUserMove;
    stop(pos, isSwipe && !app.isUserMove);
    direction = null;
    swiped = false;
  };

  flip.stopMove = function stopMove(this: FlipInternals) {
    if (this.calc === null) return;
    const pos = this.calc.getPosition();
    const rect = this.getBoundsRect();
    const y = this.calc.getCorner() === 'bottom' ? rect.height : 0;
    if (swiped || pos.x <= rect.pageWidth * 0.5) {
      this.animateFlippingTo(pos, { x: -rect.pageWidth, y }, true);
    } else {
      this.animateFlippingTo(pos, { x: rect.pageWidth, y }, false);
    }
  };
}
const TAP_SLOP = 10;

/**
 * Page-curl engine on StPageFlip.
 *
 * StPageFlip owns its DOM, so pages are built imperatively rather than by React: one light
 * shell per page with an <img> whose src is attached only while the page is in the render
 * window.
 *
 * Long books are loaded as a "volume" of ~60 pages around the reader (lib/reader/volume).
 * Building every page up front made a 1,000-page book take 2.6 s to show its first page on
 * WebKit; a volume keeps that flat. Approaching a volume edge rebuilds the instance around the
 * current page once the turn has finished, which is invisible because the pages are cached.
 *
 * Layout changes (rotation, single/spread switch, resize) also rebuild at the current page —
 * StPageFlip can't change page size or orientation mode in place.
 */
export const FlipEngine = forwardRef<ReaderEngineHandle, ReaderEngineProps>(function FlipEngine(
  {
    cache,
    pageCount,
    double,
    page,
    pageWidth,
    pageHeight,
    flipMs,
    onPageChange,
    onCenterTap,
    onFlipStart,
  },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const flip = useRef<PageFlip | null>(null);
  /** Global page index -> its <img>, for pages in the current volume. */
  const images = useRef(new Map<number, HTMLImageElement>());
  const current = useRef(page);
  const [volume, setVolumeState] = useState<Volume>(() => volumeAround(page, pageCount, double));
  const setVolume = (next: Volume) =>
    setVolumeState((v) => (v.start === next.start && v.end === next.end ? v : next));
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const callbacks = useRef({ onPageChange, onCenterTap, onFlipStart });
  callbacks.current = { onPageChange, onCenterTap, onFlipStart };

  // Re-centre the volume when the layout changes (spread pairing depends on `double`).
  useEffect(() => {
    setVolume(volumeAround(current.current, pageCount, double));
  }, [pageCount, double]);

  // Build (and rebuild on layout or volume change) the StPageFlip instance.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const { start, end } = volume;
    const book = document.createElement('div');
    el.appendChild(book);

    const shells: HTMLElement[] = [];
    const imgs = new Map<number, HTMLImageElement>();
    for (let i = start; i < end; i++) {
      const shell = document.createElement('div');
      // Covers turn stiffly in a spread; on a single page a stiff turn looks squashed, so curl.
      const isCover = double && (i === 0 || (i === pageCount - 1 && pageCount > 2));
      shell.className = `flip-page paper-placeholder${isCover ? ' flip-cover' : ''}`;
      if (isCover) shell.dataset.density = 'hard';
      const label = document.createElement('span');
      label.className = 'flip-page-number';
      label.textContent = String(i + 1);
      const img = document.createElement('img');
      img.alt = `Page ${i + 1}`;
      img.draggable = false;
      img.decoding = 'async';
      img.className = 'page-img';
      img.hidden = true;
      const url = cache.get(i)?.url;
      if (url) {
        img.src = url;
        img.hidden = false;
      }
      shell.append(label, img);
      shells.push(shell);
      imgs.set(i, img);
    }
    images.current = imgs;

    const local = Math.min(Math.max(current.current - start, 0), end - start - 1);
    const instance = new PageFlip(book, {
      width: pageWidth,
      height: pageHeight,
      size: 'fixed',
      startPage: local,
      usePortrait: !double,
      // showCover pairs the first page alone and makes covers stiff: only for a spread that
      // really starts at the cover. Mid-book volumes start on an odd page and pair naturally.
      showCover: double && start === 0,
      drawShadow: true,
      maxShadowOpacity: 0.5,
      flippingTime: flipMs,
      mobileScrollSupport: false,
      swipeDistance: 30,
      showPageCorners: true,
      disableFlipByClick: true,
      autoSize: false,
    });
    instance.loadFromHTML(shells);
    if (!double) patchPortraitGestures(instance);
    instance.on('flip', (e) => {
      const global = start + e.data;
      current.current = global;
      callbacks.current.onPageChange(global);
    });
    instance.on('changeState', (e) => {
      if (e.data === 'flipping') callbacks.current.onFlipStart?.();
      // Swap volumes only between turns, never mid-animation.
      if (e.data === 'read' && needsNewVolume(current.current, volumeRef.current, pageCount)) {
        setVolume(volumeAround(current.current, pageCount, double));
      }
    });
    flip.current = instance;

    return () => {
      flip.current = null;
      instance.destroy();
      book.remove();
      images.current = new Map();
    };
  }, [cache, volume, pageCount, pageWidth, pageHeight, double, flipMs]);

  // Attach images for pages inside the render window, detach the rest.
  useEffect(() => {
    const sync = (p: number) => {
      const img = images.current.get(p);
      if (!img) return;
      const url = cache.get(p)?.url;
      if (url) {
        if (img.src !== url) img.src = url;
        img.hidden = false;
      } else if (img.getAttribute('src')) {
        img.removeAttribute('src');
        img.hidden = true;
      }
    };
    for (const p of images.current.keys()) sync(p);
    return cache.subscribe(sync);
  }, [cache, volume, pageCount, pageWidth, pageHeight, double]);

  /** Show `target` without animation, loading a new volume if it's outside this one. */
  const jump = (target: number) => {
    current.current = target;
    const v = volumeRef.current;
    if (needsNewVolume(target, v, pageCount)) {
      setVolume(volumeAround(target, pageCount, double));
    } else {
      flip.current?.turnToPage(target - v.start);
    }
  };

  // Follow page changes that didn't come from a flip (slider, TOC, resume).
  useEffect(() => {
    if (spreadIndexOf(current.current, double) !== spreadIndexOf(page, double)) jump(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jump reads refs only
  }, [page, double]);

  useImperativeHandle(ref, () => ({
    goTo: (p) => {
      const target = Math.max(0, Math.min(pageCount - 1, p));
      const v = volumeRef.current;
      // Nearby targets get a real flip; long jumps snap.
      const distance = Math.abs(
        spreadIndexOf(target, double) - spreadIndexOf(current.current, double),
      );
      if (distance === 1 && target >= v.start && target < v.end) {
        flip.current?.flip(target - v.start);
      } else {
        jump(target);
        callbacks.current.onPageChange(target);
      }
    },
    next: () => flip.current?.flipNext(),
    prev: () => flip.current?.flipPrev(),
  }));

  // Taps: edges turn the page, the middle toggles the toolbar. Drags are StPageFlip's.
  const down = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className="flip-stage relative flex size-full items-center justify-center select-none"
      onPointerDownCapture={(e) => (down.current = { x: e.clientX, y: e.clientY })}
      onPointerUpCapture={(e) => {
        const start = down.current;
        down.current = null;
        if (!start) return;
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP) return;
        const state = flip.current?.getState();
        if (state && state !== 'read' && state !== 'fold_corner') return;
        const rect = e.currentTarget.getBoundingClientRect();
        const rel = (e.clientX - rect.left) / rect.width;
        if (rel < EDGE) flip.current?.flipPrev();
        else if (rel > 1 - EDGE) flip.current?.flipNext();
        else callbacks.current.onCenterTap();
      }}
    >
      <div ref={host} style={{ width: double ? pageWidth * 2 : pageWidth, height: pageHeight }} />
    </div>
  );
});
