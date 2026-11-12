import { Link, useParams } from 'react-router-dom';
import { useBookDocument } from '@/features/reader/useBookDocument';
import { Reader } from '@/features/reader/Reader';

const messages = {
  'missing-book': ['This book isn’t on your shelf', 'It may have been removed.'],
  'missing-file': [
    'The file for this book is gone',
    'The browser may have cleared its storage. Remove the book and add it again.',
  ],
  locked: ['This book is locked', 'It needs its password to open.'],
  broken: ['This PDF couldn’t be opened', 'The file may be damaged.'],
} as const;

export default function ReaderRoute() {
  const { bookId } = useParams();
  const state = useBookDocument(bookId);

  if (state.status === 'ready') {
    return (
      <Reader
        key={state.book.id}
        book={state.book}
        doc={state.doc}
        initialPage={state.initialPage}
      />
    );
  }

  if (state.status === 'error') {
    const [title, body] = messages[state.reason];
    return (
      <section className="mx-auto max-w-sm px-6 py-24 text-center">
        <h1 className="font-serif text-2xl">{title}</h1>
        <p className="mt-2 text-ink-2">{body}</p>
        <Link to="/" className="mt-6 inline-block text-accent underline underline-offset-4">
          Back to the library
        </Link>
      </section>
    );
  }

  return (
    <div className="fixed inset-0 grid place-items-center bg-[var(--desk)]" aria-busy="true">
      <span className="sr-only">Opening book…</span>
      <span className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
    </div>
  );
}
