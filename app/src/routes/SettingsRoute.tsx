import { useEffect, useId, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import clsx from 'clsx';
import { Button } from '@/components/Button';
import { toast } from '@/components/toast';
import { useSettings } from '@/hooks/useSettings';
import { saveSettings } from '@/lib/storage/settings';
import { db, type Settings } from '@/lib/storage/db';
import { estimateStorage } from '@/lib/storage/blob-store';
import { persistedState, requestPersistence, type PersistState } from '@/lib/storage/persist';
import { formatBytes } from '@/lib/format';
import { exportBackup, parseBackup, restoreBackup } from '@/lib/backup';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 border-t border-line pt-6">
      <h2 id={`${id}-h`} className="text-xs font-semibold tracking-[0.14em] text-ink-3 uppercase">
        {title}
      </h2>
      <div className="mt-2 divide-y divide-line/70">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-[0.95rem] text-ink">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-paper-2/70 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'h-8 rounded-md px-3 text-sm transition-colors',
            value === o.value
              ? 'bg-paper font-medium text-ink shadow-sm'
              : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative h-7 w-12 rounded-full transition-colors',
        checked ? 'bg-accent' : 'bg-line',
      )}
    >
      <span
        className={clsx(
          'absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-5',
        )}
      />
    </button>
  );
}

const save = (patch: Partial<Omit<Settings, 'key'>>) => void saveSettings(patch);

function ReadingSection({ s }: { s: Settings }) {
  const ids = { sound: useId(), invert: useId(), speed: useId(), motion: useId() };
  return (
    <Section id="reading" title="Reading">
      <Row label="Theme">
        <Segmented
          label="Theme"
          value={s.theme}
          onChange={(theme) => save({ theme })}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'sepia', label: 'Sepia' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Row>
      {s.theme === 'dark' && (
        <Row
          label="Darken pages too"
          hint="Inverts page colours. Best for text; leave off for books with photos."
          htmlFor={ids.invert}
        >
          <Toggle
            id={ids.invert}
            checked={s.invertPagesInDark}
            onChange={(v) => save({ invertPagesInDark: v })}
          />
        </Row>
      )}
      <Row label="Pages" hint="Auto shows a two-page spread when the screen is wide.">
        <Segmented
          label="Pages"
          value={s.viewMode}
          onChange={(viewMode) => save({ viewMode })}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'single', label: 'Single' },
            { value: 'double', label: 'Spread' },
          ]}
        />
      </Row>
      <Row label="Page turn speed" htmlFor={ids.speed} hint={`${(s.flipMs / 1000).toFixed(1)} s`}>
        <input
          id={ids.speed}
          type="range"
          min={300}
          max={1200}
          step={100}
          value={s.flipMs}
          onChange={(e) => save({ flipMs: Number(e.target.value) })}
          className="page-slider w-48"
        />
      </Row>
      <Row
        label="Page curl animation"
        hint="System follows your device’s reduce-motion setting."
        htmlFor={ids.motion}
      >
        <select
          id={ids.motion}
          value={s.reducedMotion}
          onChange={(e) => save({ reducedMotion: e.target.value as Settings['reducedMotion'] })}
          className="h-9 rounded-lg border border-line bg-paper-2/50 px-2 text-sm"
        >
          <option value="system">System</option>
          <option value="off">Always curl</option>
          <option value="on">Simple slide</option>
        </select>
      </Row>
      <Row label="Page turn sound" htmlFor={ids.sound}>
        <Toggle id={ids.sound} checked={s.sound} onChange={(v) => save({ sound: v })} />
      </Row>
    </Section>
  );
}

function ProxySection({ s }: { s: Settings }) {
  const [url, setUrl] = useState(s.proxyUrl);
  const [token, setToken] = useState(s.proxyToken);
  const [testing, setTesting] = useState(false);
  const urlId = useId();
  const tokenId = useId();
  const maxId = useId();

  useEffect(() => setUrl(s.proxyUrl), [s.proxyUrl]);
  useEffect(() => setToken(s.proxyToken), [s.proxyToken]);

  const commit = () => save({ proxyUrl: url.trim().replace(/\/+$/, ''), proxyToken: token.trim() });

  const test = async () => {
    commit();
    setTesting(true);
    try {
      const base = url.trim().replace(/\/+$/, '');
      const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(10_000) });
      if (!health.ok) throw new Error();
      const auth = await fetch(`${base}/fetch?url=${encodeURIComponent('https://example.com/')}`, {
        headers: { Authorization: `Bearer ${token.trim()}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (auth.status === 401) toast.error('Proxy reached, but the token is wrong.');
      else toast.info('Proxy is working.');
    } catch {
      toast.error('Couldn’t reach the proxy. Check the URL and that this site is in APP_ORIGIN.');
    } finally {
      setTesting(false);
    }
  };

  const input =
    'h-10 w-full rounded-lg border border-line bg-paper-2/50 px-3 text-sm outline-none placeholder:text-ink-3 focus:border-accent sm:w-72';

  return (
    <Section id="proxy" title="Downloads">
      <Row
        label="Download proxy"
        hint="Fetches pasted links and search downloads. Built in on Netlify (/api); change it only if you run the Cloudflare worker."
        htmlFor={urlId}
      >
        <input
          id={urlId}
          type="url"
          inputMode="url"
          placeholder="https://padaan-proxy.you.workers.dev"
          value={url}
          spellCheck={false}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={commit}
          className={input}
        />
      </Row>
      <Row label="Proxy token" htmlFor={tokenId}>
        <div className="flex gap-2">
          <input
            id={tokenId}
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onBlur={commit}
            className={clsx(input, 'sm:w-48')}
          />
          <Button onClick={test} disabled={!url.trim() || testing}>
            {testing ? 'Testing…' : 'Test'}
          </Button>
        </div>
      </Row>
      <Row label="Largest download" htmlFor={maxId} hint={`${s.maxDownloadMB} MB`}>
        <input
          id={maxId}
          type="range"
          min={50}
          max={1000}
          step={50}
          value={s.maxDownloadMB}
          onChange={(e) => save({ maxDownloadMB: Number(e.target.value) })}
          className="page-slider w-48"
        />
      </Row>
    </Section>
  );
}

function StorageSection() {
  const books = useLiveQuery(() => db.books.toArray(), []);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [persist, setPersist] = useState<PersistState | null>(null);

  useEffect(() => {
    void estimateStorage().then(setUsage);
    void persistedState().then(setPersist);
  }, [books?.length]);

  const sorted = [...(books ?? [])].sort((a, b) => b.sizeBytes - a.sizeBytes);
  const pct =
    usage && Number.isFinite(usage.quota) ? Math.min(100, (usage.usage / usage.quota) * 100) : 0;
  const nearlyFull = pct > 85;

  return (
    <Section id="storage" title="Storage">
      <div className="py-4">
        <div className="flex items-baseline justify-between text-sm">
          <span>
            {usage ? formatBytes(usage.usage) : '—'} used
            {usage && Number.isFinite(usage.quota) && (
              <span className="text-ink-3"> of {formatBytes(usage.quota)} available to Padaan</span>
            )}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div
            className={clsx('h-full rounded-full', nearlyFull ? 'bg-danger' : 'bg-accent')}
            style={{ width: `${pct}%` }}
          />
        </div>
        {nearlyFull && (
          <p role="alert" className="mt-2 text-xs text-danger">
            Storage is nearly full. Remove books you’ve finished to make room.
          </p>
        )}
      </div>
      <Row
        label="Keep books safe from clean-up"
        hint={
          persist === 'persisted'
            ? 'On — the browser won’t clear your books to save space.'
            : persist === 'unsupported'
              ? 'Not supported by this browser.'
              : 'Off — the browser may clear books when space is low. On iPhone, add Padaan to your Home Screen.'
        }
      >
        {persist !== 'persisted' && persist !== 'unsupported' && (
          <Button
            onClick={async () => {
              const result = await requestPersistence();
              setPersist(result);
              if (result !== 'persisted')
                toast.info('The browser declined for now. Installing the app usually helps.');
            }}
          >
            Turn on
          </Button>
        )}
      </Row>
      {sorted.length > 0 && (
        <div className="py-4">
          <p className="text-[0.95rem]">Books by size</p>
          <ul className="mt-2 space-y-1.5">
            {sorted.map((b) => (
              <li key={b.id} className="flex items-baseline justify-between gap-4 text-sm">
                <span className="truncate text-ink-2">{b.title}</span>
                <span className="shrink-0 text-ink-3 tabular-nums">{formatBytes(b.sizeBytes)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-3">Remove a book from its ⋮ menu in the library.</p>
        </div>
      )}
    </Section>
  );
}

function BackupSection() {
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `padaan-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const doImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      try {
        const { matched, missing } = await restoreBackup(parseBackup(await file.text()));
        toast.info(
          `Restored ${matched} book${matched === 1 ? '' : 's'}` +
            (missing ? ` · ${missing} not on this device — add them, then restore again` : ''),
        );
      } catch (error) {
        toast.error((error as Error).message || 'Couldn’t read that backup.');
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  return (
    <Section id="backup" title="Backup">
      <Row
        label="Reading positions, bookmarks and settings"
        hint="A small file without the PDFs themselves. Restore matches books by their contents."
      >
        <div className="flex gap-2">
          <Button onClick={doExport}>Export</Button>
          <Button onClick={doImport} disabled={busy}>
            Restore
          </Button>
        </div>
      </Row>
    </Section>
  );
}

export default function SettingsRoute() {
  const settings = useSettings();
  return (
    <div className="mx-auto max-w-2xl space-y-8 py-8">
      <h1 className="font-serif text-3xl tracking-tight">Settings</h1>
      <ReadingSection s={settings} />
      <ProxySection s={settings} />
      <StorageSection />
      <BackupSection />
      <p className="pt-4 text-center text-xs text-ink-3">
        Padaan ·{' '}
        <span lang="ne" className="font-deva">
          पडान
        </span>{' '}
        · everything stays on this device
      </p>
    </div>
  );
}
