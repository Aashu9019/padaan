import { useEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Native <dialog>: focus trapping, Esc and the top layer come for free. */
export function Dialog({ open, onClose, title, children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
      className="dialog m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-line bg-paper p-0 text-ink shadow-2xl backdrop:bg-black/40"
    >
      {open && (
        <div className="p-5">
          <h2 id="dialog-title" className="font-serif text-xl">
            {title}
          </h2>
          <div className="mt-3 text-sm text-ink-2">{children}</div>
          {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
