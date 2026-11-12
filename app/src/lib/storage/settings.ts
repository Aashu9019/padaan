import { db, type Settings } from './db';

export const DEFAULT_SETTINGS: Settings = {
  key: 'app',
  theme: 'light',
  invertPagesInDark: false,
  sound: false,
  viewMode: 'auto',
  flipMs: 700,
  reducedMotion: 'system',
  maxDownloadMB: 300,
  proxyUrl: import.meta.env.VITE_DEFAULT_PROXY_URL ?? '',
  proxyToken: '',
};

export async function loadSettings(): Promise<Settings> {
  const stored = await db.settings.get('app');
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(patch: Partial<Omit<Settings, 'key'>>): Promise<void> {
  const current = await loadSettings();
  await db.settings.put({ ...current, ...patch, key: 'app' });
}
