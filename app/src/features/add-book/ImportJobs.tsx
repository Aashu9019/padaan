import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Icon } from '@/components/Icon';
import { formatBytes } from '@/lib/format';
import { useImports, type ImportJob } from './import-store';

function StatusLine({ job }: { job: ImportJob }) {
  switch (job.status) {
    case 'queued':
      return <span className="text-ink-3">Waiting…</span>;
    case 'working':
      return <span className="text-ink-2">Adding to your shelf…</span>;
    case 'added':
      return (
        <Link to={`/read/${job.bookId}`} className="text-accent underline-offset-4 hover:underline">
          Added — open
        </Link>
      );
    case 'duplicate':
      return (
        <Link to={`/read/${job.bookId}`} className="text-ink-2 underline-offset-4 hover:underline">
          Already in your library — open it
        </Link>
      );
    case 'error':
      return <span className="text-danger">{job.message}</span>;
  }
}

export function ImportJobs() {
  const { jobs, clearFinished } = useImports();
  if (!jobs.length) return null;
  const finished = jobs.some((j) => j.status !== 'queued' && j.status !== 'working');

  return (
    <section aria-label="Imports" className="rounded-xl border border-line">
      <ul className="divide-y divide-line">
        {jobs.map((job) => (
          <li key={job.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span
              className={clsx(
                'grid size-8 shrink-0 place-items-center rounded-full',
                job.status === 'error' ? 'bg-danger/10 text-danger' : 'bg-paper-2 text-ink-2',
              )}
            >
              {job.status === 'working' || job.status === 'queued' ? (
                <span
                  className={clsx(
                    'size-4 rounded-full border-2 border-ink-3/40 border-t-ink-2',
                    job.status === 'working' && 'animate-spin',
                  )}
                />
              ) : (
                <Icon name={job.status === 'error' ? 'alert' : 'check'} size={16} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{job.name}</p>
              <p className="mt-0.5 text-xs">
                <span className="text-ink-3">{formatBytes(job.size)} · </span>
                <StatusLine job={job} />
              </p>
            </div>
          </li>
        ))}
      </ul>
      {finished && (
        <div className="border-t border-line px-4 py-2 text-right">
          <button onClick={clearFinished} className="text-xs text-ink-3 hover:text-ink">
            Clear finished
          </button>
        </div>
      )}
    </section>
  );
}
