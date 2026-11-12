import { useCallback, useEffect, useRef } from 'react';
import { db } from '@/lib/storage/db';

const DEBOUNCE_MS = 500;

/**
 * Debounced reading-position writer. Flushes on unmount, tab hide and page unload so the
 * position is never lost, even if the app is killed right after a page turn.
 */
export function useProgressSaver(bookId: string) {
  const pending = useRef<number | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (pending.current === null) return;
    const page = pending.current;
    pending.current = null;
    void db.progress.put({ bookId, page, updatedAt: Date.now() });
  }, [bookId]);

  const save = useCallback(
    (page: number) => {
      pending.current = page;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  return save;
}
