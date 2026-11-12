import { useState } from 'react';
import { create } from 'zustand';
import { Dialog } from './Dialog';
import { Button } from './Button';

interface PromptState {
  request: { incorrect: boolean; name?: string; resolve: (value: string | null) => void } | null;
}

const usePrompt = create<PromptState>(() => ({ request: null }));

/** Ask the user for a PDF password. Resolves null if they cancel. */
export function askPdfPassword(incorrect: boolean, name?: string): Promise<string | null> {
  return new Promise((resolve) => {
    usePrompt.setState({ request: { incorrect, name, resolve } });
  });
}

export function PasswordPrompt() {
  const request = usePrompt((s) => s.request);
  const [value, setValue] = useState('');

  const finish = (answer: string | null) => {
    request?.resolve(answer);
    usePrompt.setState({ request: null });
    setValue('');
  };

  return (
    <Dialog
      open={request !== null}
      onClose={() => finish(null)}
      title="Password required"
      footer={
        <>
          <Button variant="ghost" onClick={() => finish(null)}>
            Cancel
          </Button>
          <Button variant="primary" form="pdf-password" type="submit" disabled={!value}>
            Unlock
          </Button>
        </>
      }
    >
      <form
        id="pdf-password"
        onSubmit={(e) => {
          e.preventDefault();
          if (value) finish(value);
        }}
      >
        <p>
          {request?.name ? <strong className="text-ink">{request.name}</strong> : 'This PDF'} is
          locked.
        </p>
        <input
          type="password"
          autoFocus
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="PDF password"
          aria-invalid={request?.incorrect || undefined}
          className="mt-3 h-11 w-full rounded-lg border border-line bg-paper-2/60 px-3 text-ink outline-none focus:border-accent"
        />
        {request?.incorrect && (
          <p className="mt-2 text-danger" role="alert">
            That password didn’t work. Try again.
          </p>
        )}
      </form>
    </Dialog>
  );
}
