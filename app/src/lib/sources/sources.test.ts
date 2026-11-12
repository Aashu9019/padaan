import { describe, expect, it } from 'vitest';
import { mapGutendex } from './gutendex';
import { mapIaSearch, pickIaPdf } from './internet-archive';
import { mapOlSearch } from './open-library';

// Fixtures trimmed from real responses (Nov 2026).

describe('Gutendex adapter', () => {
  it('keeps only books with a PDF and flips author names', () => {
    const { results, hasMore } = mapGutendex({
      count: 2,
      next: 'https://gutendex.com/books/?page=2&search=x',
      results: [
        {
          id: 1342,
          title: 'Pride and Prejudice',
          authors: [{ name: 'Austen, Jane' }],
          formats: {
            'application/epub+zip': 'https://www.gutenberg.org/ebooks/1342.epub3.images',
            'image/jpeg': 'https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg',
          },
        },
        {
          id: 999,
          title: 'A PDF Book',
          authors: [{ name: 'Doe, John' }],
          formats: { 'application/pdf': 'https://www.gutenberg.org/files/999/999-pdf.pdf' },
        },
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: '999',
      authors: ['John Doe'],
      pdfUrl: 'https://www.gutenberg.org/files/999/999-pdf.pdf',
      needsProxy: true,
    });
    expect(hasMore).toBe(true);
  });
});

describe('Open Library adapter', () => {
  it('keeps only public works that have scans', () => {
    const { results } = mapOlSearch(
      {
        numFound: 3,
        docs: [
          {
            key: '/works/OL1W',
            title: 'Pride and Prejudice',
            author_name: ['Jane Austen'],
            first_publish_year: 1813,
            cover_i: 42,
            ia: ['prideprejudice0000jane_u2q4', 'bwb_KU-428-190'],
            ebook_access: 'public',
          },
          { key: '/works/OL2W', title: 'Zombies', ebook_access: 'borrowable', ia: ['z'] },
          { key: '/works/OL3W', title: 'No scans', ebook_access: 'public' },
        ],
      },
      1,
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: '/works/OL1W',
      year: 1813,
      coverUrl: 'https://covers.openlibrary.org/b/id/42-M.jpg',
    });
  });
});

describe('Internet Archive adapter', () => {
  it('maps search docs with single or list fields', () => {
    const { results, hasMore } = mapIaSearch(
      {
        response: {
          numFound: 21,
          start: 0,
          docs: [
            {
              identifier: 'prideprejudice00aust',
              title: 'Pride and prejudice',
              creator: ['Austen, Jane'],
              year: '1907',
            },
          ],
        },
      },
      1,
    );
    expect(results[0]).toMatchObject({
      title: 'Pride and prejudice',
      authors: ['Austen, Jane'],
      year: 1907,
    });
    expect(hasMore).toBe(true);
  });

  it('prefers the Text PDF on the item file server', () => {
    const url = pickIaPdf('prideprejudice00aust', {
      server: 'ia800609.us.archive.org',
      dir: '/7/items/prideprejudice00aust',
      metadata: {},
      files: [
        { name: 'prideprejudice00aust_bw.pdf', format: 'Grayscale PDF' },
        { name: 'prideprejudice00aust.pdf', format: 'Text PDF' },
        { name: 'prideprejudice00aust.epub', format: 'EPUB' },
      ],
    });
    expect(url).toBe(
      'https://ia800609.us.archive.org/7/items/prideprejudice00aust/prideprejudice00aust.pdf',
    );
  });

  it('refuses restricted or encrypted items', () => {
    expect(
      pickIaPdf('x', {
        metadata: { 'access-restricted-item': 'true' },
        files: [{ name: 'x.pdf', format: 'Text PDF' }],
      }),
    ).toBeNull();
    expect(pickIaPdf('x', { metadata: {}, files: [{ name: 'x_encrypted.pdf' }] })).toBeNull();
    expect(pickIaPdf('x', { metadata: {}, files: [{ name: 'x.epub' }] })).toBeNull();
  });
});
