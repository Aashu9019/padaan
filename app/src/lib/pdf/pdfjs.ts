import {
  getDocument,
  GlobalWorkerOptions,
  PasswordResponses,
  PDFDataRangeTransport,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

/** First chunk handed to pdf.js up front; the rest is read lazily from the Blob. */
const INITIAL_CHUNK = 256 * 1024;
/** Below this size, passing the whole file is simpler and just as fast. */
const RANGE_THRESHOLD = 8 * 1024 * 1024;

/**
 * Feeds pdf.js byte ranges straight from a local Blob/File (OPFS files are disk-backed),
 * so opening a 300 MB scan doesn't copy the whole thing into memory first.
 */
class BlobRangeTransport extends PDFDataRangeTransport {
  constructor(
    private readonly blob: Blob,
    initial: Uint8Array,
  ) {
    super(blob.size, initial);
  }

  override requestDataRange(begin: number, end: number): void {
    this.blob
      .slice(begin, end)
      .arrayBuffer()
      .then((buffer) => this.onDataRange(begin, new Uint8Array(buffer)))
      .catch(() => this.abort());
  }
}

export class PdfPasswordError extends Error {
  readonly name = 'PdfPasswordError';
  constructor(readonly incorrect: boolean) {
    super(incorrect ? 'That password is not correct.' : 'This PDF is password protected.');
  }
}

export class PdfOpenError extends Error {
  readonly name = 'PdfOpenError';
  constructor(cause: unknown) {
    super('This file could not be opened as a PDF.', { cause });
  }
}

export interface OpenedPdf {
  doc: PDFDocumentProxy;
  task: PDFDocumentLoadingTask;
}

export async function openPdf(blob: Blob, password?: string): Promise<OpenedPdf> {
  const common = {
    password,
    isEvalSupported: false,
    disableAutoFetch: true,
    disableStream: true,
    enableXfa: false,
  };
  let task: PDFDocumentLoadingTask;
  if (blob.size <= RANGE_THRESHOLD) {
    task = getDocument({ ...common, data: new Uint8Array(await blob.arrayBuffer()) });
  } else {
    const initial = new Uint8Array(await blob.slice(0, INITIAL_CHUNK).arrayBuffer());
    task = getDocument({
      ...common,
      range: new BlobRangeTransport(blob, initial),
      rangeChunkSize: 512 * 1024,
    });
  }

  // pdf.js asks for a password through this callback; we surface it as an error the UI
  // can catch, then the caller retries with the password.
  let passwordReason: number | null = null;
  task.onPassword = (_update: unknown, reason: number) => {
    passwordReason = reason;
    void task.destroy();
  };

  try {
    const doc = await task.promise;
    return { doc, task };
  } catch (error) {
    if (passwordReason !== null || (error as { name?: string })?.name === 'PasswordException') {
      throw new PdfPasswordError(passwordReason === PasswordResponses.INCORRECT_PASSWORD);
    }
    throw new PdfOpenError(error);
  }
}

/** True when the first KB of the file contains the `%PDF-` header. */
export async function looksLikePdf(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 1024).arrayBuffer());
  return hasPdfHeader(head);
}

export function hasPdfHeader(head: Uint8Array): boolean {
  // %PDF-  — the spec allows a little junk before the header, so scan the first KB.
  const limit = Math.min(head.length - 5, 1024);
  for (let i = 0; i <= limit; i++) {
    if (
      head[i] === 0x25 &&
      head[i + 1] === 0x50 &&
      head[i + 2] === 0x44 &&
      head[i + 3] === 0x46 &&
      head[i + 4] === 0x2d
    ) {
      return true;
    }
  }
  return false;
}
