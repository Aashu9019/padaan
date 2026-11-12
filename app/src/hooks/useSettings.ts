import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Settings } from '@/lib/storage/db';
import { DEFAULT_SETTINGS } from '@/lib/storage/settings';

export function useSettings(): Settings {
  const stored = useLiveQuery(() => db.settings.get('app'), []);
  return stored ? { ...DEFAULT_SETTINGS, ...stored } : DEFAULT_SETTINGS;
}

function systemReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function useReducedMotion(): boolean {
  const { reducedMotion } = useSettings();
  if (reducedMotion === 'on') return true;
  if (reducedMotion === 'off') return false;
  return systemReducedMotion();
}

/** Mirrors the chosen theme onto <html data-theme> and the browser chrome colour. */
export function ThemeSync() {
  const { theme } = useSettings();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const color = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.content = color;
      meta.removeAttribute('media');
    }
  }, [theme]);
  return null;
}
