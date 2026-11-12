import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/Button';
import { useSettings } from '@/hooks/useSettings';
import { parseLink } from '@/lib/download/download';
import { titleFromFileName } from '@/lib/pdf/metadata';
import { useDownloads } from './download-store';
import { DownloadJobs } from './DownloadJobs';

function titleFromUrl(url: URL): string {
  const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
  return last ? titleFromFileName(last) : url.hostname;
}

export function LinkPanel() {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const start = useDownloads((s) => s.start);
  const { proxyUrl } = useSettings();

  const submit = () => {
    try {
      const url = parseLink(value);
      setError(null);
      start(url.href, { source: 'link', sourceUrl: url.href, fallbackTitle: titleFromUrl(url) });
      setValue('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section aria-labelledby="link-heading" className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="rounded-2xl border border-line p-4 sm:p-5"
      >
        <label id="link-heading" htmlFor="pdf-link" className="font-serif text-lg">
          Paste a link to a PDF
        </label>
        <p className="mt-1 text-sm text-ink-3">
          The direct link to the file — it usually ends in <code>.pdf</code>.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            id="pdf-link"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://…/book.pdf"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (text && !value) {
                e.preventDefault();
                setValue(text.trim());
              }
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'link-error' : undefined}
            className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-paper-2/50 px-3 text-sm outline-none placeholder:text-ink-3 focus:border-accent"
          />
          <Button variant="primary" type="submit" disabled={!value.trim()} className="h-11">
            Download
          </Button>
        </div>
        {error && (
          <p id="link-error" role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
        {!proxyUrl && (
          <p className="mt-3 text-xs text-ink-3">
            Many sites block direct downloads from apps. Set up the{' '}
            <Link to="/settings#proxy" className="text-accent underline underline-offset-2">
              download proxy
            </Link>{' '}
            so any link works.
          </p>
        )}
      </form>
      <DownloadJobs />
    </section>
  );
}
