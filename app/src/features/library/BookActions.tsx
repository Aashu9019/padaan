import { useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { toast } from '@/components/toast';
import { forgetBlobUrl } from '@/hooks/useBlobUrl';
import { deleteBook, getBookFile, updateBookDetails } from '@/lib/library';
import { formatBytes, safeFileName } from '@/lib/format';
import type { Book } from '@/lib/storage/db';

type Mode = 'menu' | 'edit' | 'delete';

async function exportBook(book: Book) {
  const blob = await getBookFile(book);
  if (!blob) {
    toast.error('The file for this book is missing.');
    return;
  }
  const file = new File([blob], safeFileName(book.title), { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: book.title });
      return;
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[0.95rem] hover:bg-paper-2 ${danger ? 'text-danger' : 'text-ink'}`}
    >
      <Icon name={icon} />
      {label}
    </button>
  );
}

export function BookActions({ book, onClose }: { book: Book | null; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('menu');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setMode('menu');
    onClose();
  };

  if (!book) return null;

  if (mode === 'edit') {
    return (
      <Dialog
        open
        onClose={close}
        title="Edit details"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="edit-book"
              disabled={!title.trim() || busy}
            >
              Save
            </Button>
          </>
        }
      >
        <form
          id="edit-book"
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await updateBookDetails(book.id, { title, author });
              close();
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block">
            <span className="text-xs font-medium tracking-wide text-ink-3 uppercase">Title</span>
            <input
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-line bg-paper-2/60 px-3 text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium tracking-wide text-ink-3 uppercase">Author</span>
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-line bg-paper-2/60 px-3 text-ink outline-none focus:border-accent"
            />
          </label>
        </form>
      </Dialog>
    );
  }

  if (mode === 'delete') {
    return (
      <Dialog
        open
        onClose={close}
        title="Remove this book?"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Keep it
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await deleteBook(book);
                  forgetBlobUrl(book.coverKey);
                  close();
                  toast.info(`Removed “${book.title}”`);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        <p>
          <strong className="text-ink">{book.title}</strong> and its bookmarks will be deleted from
          this device, freeing {formatBytes(book.sizeBytes)}.
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={close} title={book.title}>
      <div className="-mx-2 -mb-2">
        <MenuItem
          icon="edit"
          label="Edit details"
          onClick={() => {
            setTitle(book.title);
            setAuthor(book.author ?? '');
            setMode('edit');
          }}
        />
        <MenuItem
          icon="share"
          label="Save or share the PDF"
          onClick={() => {
            close();
            void exportBook(book);
          }}
        />
        <MenuItem
          icon="trash"
          label="Remove from library"
          danger
          onClick={() => setMode('delete')}
        />
      </div>
    </Dialog>
  );
}
