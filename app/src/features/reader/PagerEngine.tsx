import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { spreadIndexOf } from '@/lib/reader/spreads';
import { useReducedMotion } from '@/hooks/useSettings';
import { PageImage } from './PageImage';
import type { ReaderEngineHandle, ReaderEngineProps } from './engine';

const SWIPE_PX = 40;
const EDGE = 0.2;

/**
 * Plain pager: one spread at a time with a short slide (or fade under reduced motion).
 * Used when page-curl is off and as the reduced-motion engine.
 */
export const PagerEngine = forwardRef<ReaderEngineHandle, ReaderEngineProps>(function PagerEngine(
  { cache, spreads, double, page, pageWidth, pageHeight, onPageChange, onCenterTap, onFlipStart },
  ref,
) {
  const reduced = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const index = spreadIndexOf(page, double);
  const spread = spreads[index] ?? [];
  const last = useRef(index);
  const pointer = useRef<{ x: number; y: number; id: number } | null>(null);

  const goSpread = (target: number) => {
    const s = spreads[Math.max(0, Math.min(spreads.length - 1, target))];
    if (s && s[0] !== undefined && s[0] !== spread[0]) {
      onFlipStart?.();
      onPageChange(s[0]);
    }
  };

  useImperativeHandle(ref, () => ({
    goTo: (p) => onPageChange(p),
    next: () => goSpread(index + 1),
    prev: () => goSpread(index - 1),
  }));

  useLayoutEffect(() => {
    const el = stage.current;
    const dir = Math.sign(index - last.current);
    last.current = index;
    if (!el || dir === 0) return;
    el.animate(
      reduced
        ? [{ opacity: 0.4 }, { opacity: 1 }]
        : [
            { opacity: 0.35, transform: `translateX(${dir * 6}%)` },
            { opacity: 1, transform: 'translateX(0)' },
          ],
      { duration: reduced ? 140 : 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  }, [index, reduced]);

  // Lone cover in double mode sits on the right half, like a closed book's front.
  const loneCover = double && spread.length === 1 && spread[0] === 0;
  const loneBack = double && spread.length === 1 && spread[0] !== 0;

  return (
    <div
      className="relative flex size-full items-center justify-center touch-none select-none"
      onPointerDown={(e) => {
        pointer.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      }}
      onPointerUp={(e) => {
        const start = pointer.current;
        pointer.current = null;
        if (!start || start.id !== e.pointerId) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
          goSpread(dx < 0 ? index + 1 : index - 1);
          return;
        }
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const rel = (e.clientX - rect.left) / rect.width;
        if (rel < EDGE) goSpread(index - 1);
        else if (rel > 1 - EDGE) goSpread(index + 1);
        else onCenterTap();
      }}
      onPointerCancel={() => (pointer.current = null)}
    >
      <div ref={stage} className="flex" style={{ height: pageHeight }}>
        {loneCover && <div style={{ width: pageWidth }} />}
        {spread.map((p, i) => {
          const gutter =
            double && spread.length === 2
              ? i === 0
                ? 'after:absolute after:inset-y-0 after:right-0 after:w-10 after:bg-gradient-to-l after:from-black/20 after:to-transparent'
                : 'after:absolute after:inset-y-0 after:left-0 after:w-10 after:bg-gradient-to-r after:from-black/20 after:to-transparent'
              : '';
          return (
            <div
              key={p}
              className={`relative shadow-[0_2px_8px_rgb(0_0_0/0.25),0_20px_40px_-20px_rgb(0_0_0/0.5)] ${gutter}`}
              style={{ width: pageWidth, height: pageHeight }}
            >
              <PageImage cache={cache} page={p} className="absolute inset-0" />
            </div>
          );
        })}
        {loneBack && <div style={{ width: pageWidth }} />}
      </div>
    </div>
  );
});
