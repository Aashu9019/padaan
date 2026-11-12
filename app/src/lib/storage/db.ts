import Dexie, { type EntityTable } from 'dexie';

export type BookSource = 'import' | 'link' | 'gutenberg' | 'openlibrary' | 'internetarchive';

export interface Book {
  id: string;
  hash: string;
  title: string;
  author?: string;
  pageCount: number;
  sizeBytes: number;
  source: BookSource;
  sourceUrl?: string;
  sourceId?: string;
  blobKey: string;
  coverKey: string;
  /** width / height of page 1 */
  pageAspect: number;
  hasOutline: boolean;
  addedAt: number;
  lastOpenedAt?: number;
}

export interface Progress {
  bookId: string;
  /** 0-based */
  page: number;
  updatedAt: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  page: number;
  label?: string;
  createdAt: number;
}

export type Theme = 'light' | 'sepia' | 'dark';
export type ViewMode = 'auto' | 'single' | 'double';
export type ReducedMotionPref = 'system' | 'on' | 'off';

export interface Settings {
  key: 'app';
  theme: Theme;
  invertPagesInDark: boolean;
  sound: boolean;
  viewMode: ViewMode;
  flipMs: number;
  reducedMotion: ReducedMotionPref;
  maxDownloadMB: number;
  proxyUrl: string;
  proxyToken: string;
}

/**
 * Fallback file storage. Bytes are kept as an ArrayBuffer rather than a Blob because some
 * WebKit builds fail to persist Blobs in IndexedDB.
 */
export interface StoredBlob {
  key: string;
  data: ArrayBuffer;
  type: string;
}

export class PadaanDB extends Dexie {
  books!: EntityTable<Book, 'id'>;
  progress!: EntityTable<Progress, 'bookId'>;
  bookmarks!: EntityTable<Bookmark, 'id'>;
  settings!: EntityTable<Settings, 'key'>;
  blobs!: EntityTable<StoredBlob, 'key'>;

  constructor(name = 'padaan') {
    super(name);
    this.version(1).stores({
      books: 'id, &hash, title, author, addedAt, lastOpenedAt',
      progress: 'bookId',
      bookmarks: 'id, bookId, [bookId+page]',
      settings: 'key',
      blobs: 'key',
    });
  }
}

export const db = new PadaanDB();
