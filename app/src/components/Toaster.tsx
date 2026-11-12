import clsx from 'clsx';
import { useToasts } from './toast';
import { Icon } from './Icon';

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div
      aria-live="polite"
      className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={clsx(
            'toast-in pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg',
            t.tone === 'error' ? 'bg-danger text-white' : 'bg-ink text-paper',
          )}
        >
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              className="rounded-md px-2 py-1 font-semibold underline-offset-4 hover:underline"
              onClick={() => {
                t.action?.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button
            aria-label="Dismiss"
            className="-mr-1 grid size-7 place-items-center rounded-full opacity-70 hover:opacity-100"
            onClick={() => dismiss(t.id)}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
