import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { formatBytes } from '@/lib/format';
import { useDownloads, type DownloadJob } from './download-store';

function Progress({ job }: { job: DownloadJob }) {
  const pct = job.total ? Math.min(100, (job.loaded / job.total) * 100) : null;
  return (
    <div className="mt-2">
      <div className="h-1 w-full overflow-hidden rounded-full bg-line">
        {pct === null ? (
          <div className="indeterminate h-full w-1/3 rounded-full bg-accent" />
        ) : (
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <p className="mt-1 text-xs text-ink-3 tabular-nums">
        {formatBytes(job.loaded)}
        {job.total ? ` of ${formatBytes(job.total)}` : ''}
      </p>
    </div>
  );
}

function JobRow({ job }: { job: DownloadJob }) {
  const { cancel, dismiss } = useDownloads();
  const busy = job.status === 'downloading' || job.status === 'processing';
  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{job.title}</p>
          <p className="truncate text-xs text-ink-3">{new URL(job.url).hostname}</p>
        </div>
        {busy ? (
          <button
            onClick={() => cancel(job.id)}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-ink-2 hover:bg-paper-2"
          >
            Cancel
          </button>
        ) : (
          <button
            aria-label="Dismiss"
            onClick={() => dismiss(job.id)}
            className="grid size-7 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-paper-2"
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
      {job.status === 'downloading' && <Progress job={job} />}
      {job.status === 'processing' && (
        <p className="mt-1 text-xs text-ink-2">Adding to your shelf…</p>
      )}
      {job.status === 'added' && (
        <Link
          to={`/read/${job.bookId}`}
          className="mt-1 inline-block text-xs text-accent hover:underline"
        >
          Added — open
        </Link>
      )}
      {job.status === 'duplicate' && (
        <Link
          to={`/read/${job.bookId}`}
          className="mt-1 inline-block text-xs text-ink-2 hover:underline"
        >
          Already in your library — open it
        </Link>
      )}
      {job.status === 'cancelled' && <p className="mt-1 text-xs text-ink-3">Cancelled</p>}
      {job.status === 'error' && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {job.message}
        </p>
      )}
    </li>
  );
}

export function DownloadJobs() {
  const jobs = useDownloads((s) => s.jobs);
  if (!jobs.length) return null;
  return (
    <section aria-label="Downloads" className="rounded-xl border border-line">
      <ul className="divide-y divide-line">
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} />
        ))}
      </ul>
    </section>
  );
}
