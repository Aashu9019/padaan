# PRD — Folio: Personal Book Reader PWA

**Owner:** Avyanta (single user, personal use)
**Platform:** Progressive Web App — installable on Android, iOS, desktop
**Version:** v1.0

---

## 1. Problem & goal
Reading PDFs in a normal viewer feels like scrolling a document, not reading a book. Books are also scattered across downloads folders and links.

**Goal:** one installable app that collects my PDF books in a library, keeps them available offline, and reads them with a convincing physical-book page-turn experience.

## 2. Users
One user (me). No accounts, no multi-user sync in v1. Data lives on the device.

## 3. Scope

### In scope (v1)
1. **Add books** three ways:
   - **Import from device** — pick one or more PDF files (file picker + drag-and-drop on desktop + Web Share Target on Android).
   - **Paste a link** — paste a direct URL to a PDF; the app downloads it via the proxy and stores it.
   - **Search free sources** — search public-domain/free catalogs and download in one tap:
     - Project Gutenberg (via Gutendex API)
     - Open Library (only items whose ebook access is public/free)
     - Internet Archive (public-domain / openly downloadable texts with a PDF file)
2. **Library** — grid of book covers with title, author, progress %, last opened; sort (recent, title, author, added) and search within the library; delete; edit title/author.
3. **Reader**
   - Realistic page-flip animation (page curl, shadow, drag to turn by corner or swipe, tap edges to turn).
   - Single-page mode in portrait/phones, two-page spread in landscape/tablet/desktop; auto-switch on rotation.
   - Cover shown as a hard cover (closed book state) before opening.
   - Remembers last page per book; resumes automatically.
   - Bookmarks (add/remove/list, jump to).
   - Table of contents from the PDF outline when present.
   - Thumbnail strip / page slider for jumping.
   - Zoom: pinch or double-tap opens a zoom/pan view of the current page (outside flip mode); closing returns to the book.
   - Themes: light, sepia, dark (dark = inverted page rendering option, off by default for image-heavy books).
   - Fullscreen / immersive mode with auto-hiding toolbar.
   - Optional page-turn sound (off by default).
   - Keyboard: ←/→, Space, Home/End on desktop.
4. **Offline** — app shell and all downloaded books work with no connection.
5. **Storage management** — show used/available storage, size per book, request persistent storage, warn when close to quota.
6. **Backup** — export library metadata (progress, bookmarks) as JSON; import it back.

### Out of scope (v1)
- Torrents, magnet links, piracy indexes or shadow libraries — **explicitly excluded, never to be added.**
- Crawling or scraping websites to discover files. Link-paste fetches only the exact URL given.
- DRM-protected books (Kindle, Google Play, Adobe DRM).
- Accounts, cloud sync, multiple devices.
- Annotation/highlighting (v2 candidate).
- EPUB (v2 candidate — see §8).
- Text-to-speech (v2 candidate).

## 4. User stories
- As a reader, I paste a PDF link and within seconds see it in my library with a cover.
- As a reader, I search "Pride and Prejudice", tap a result, and it downloads into my library.
- As a reader, I open a book on my phone in portrait and flip pages with a swipe that curls like paper.
- As a reader, I rotate my tablet and the book opens into a two-page spread.
- As a reader, I close the app mid-chapter and reopen it on the same page, even offline.
- As a reader, I can see which books take the most space and delete them.

## 5. Functional requirements

### 5.1 Add book — import
- Accept `application/pdf` only; validate magic bytes (`%PDF-`), not just extension.
- Multiple files at once; show per-file progress.
- Extract metadata: PDF Info title/author → fallback to filename (cleaned).
- Generate cover thumbnail from page 1.
- Detect duplicates by SHA-256 hash; offer "open existing" instead of re-adding.

### 5.2 Add book — paste link
- Input accepts `http(s)` URLs only.
- Request goes through the proxy (`/fetch?url=`) because of browser CORS restrictions.
- Show download progress (bytes / total when `Content-Length` known), allow cancel.
- Validate response is a PDF (content-type and magic bytes). If it's an HTML page, show: "This link is a web page, not a PDF file. Open it and copy the direct download link."
- Max size: 300 MB (configurable).
- Store the source URL in metadata.

### 5.3 Add book — search
- Single search box; results grouped or tabbed by source.
- Each result: cover (if available), title, author, year, source badge, "PDF available" indicator.
- Only show results that have a downloadable PDF. Gutenberg items without PDF are hidden (EPUB-only items hidden in v1).
- Debounce input (400 ms); paginate ("load more").
- Tap result → confirm → download via the same pipeline as paste-link.

### 5.4 Library
- Responsive cover grid (2 cols at 375px, up to 6 on desktop).
- Progress bar on each cover.
- "Continue reading" row at top with the last 3 opened books.
- Long-press / context menu: edit details, delete, export file (share/save PDF back out).

### 5.5 Reader — see TECH_SPEC §5 for rendering details
- Turn latency: page turn animation starts within 100 ms of gesture.
- Opening a book: first page visible within 1.5 s for a typical text PDF on a mid-range phone.
- No full-book render up front; render on demand with a small window around the current page.

### 5.6 Settings
- Theme, page-turn sound, default view (auto / single / double), flip animation speed, reduced motion override, max download size, proxy URL + token, storage panel, backup export/import.

## 6. Non-functional requirements
- **Performance:** handle 1,000-page and scanned PDFs without freezing; memory-bounded render cache.
- **Offline-first:** app shell precached; books in OPFS/IndexedDB.
- **Privacy:** no analytics, no third-party tracking. Proxy logs no URLs beyond Cloudflare defaults.
- **Accessibility:** buttons labelled, focus visible, reduced-motion respected, toolbar usable by keyboard.
- **Security:** proxy protected by a shared secret token; SSRF protections (TECH_SPEC §7).

## 7. Known platform limitations (accepted)
- **iOS Safari:** storage may be evicted if the PWA isn't installed to the home screen; quotas are tighter; no background downloads — a download stops if the app is closed. App must call `navigator.storage.persist()` and tell the user to install to the home screen.
- **Background downloads:** not supported in v1 on any platform (Background Fetch is Chromium-only); downloads require the app to stay open.
- **CORS:** direct browser download from arbitrary sites is impossible; the proxy is required for paste-link and some search sources.
- **Some links won't work:** pages that require login, cookies, captchas, or JS-generated download buttons won't download via paste-link. User must use "Import" instead.
- **DRM:** encrypted PDFs that need a password will prompt for the password; DRM-protected files cannot be opened.

## 8. Future (v2+)
- EPUB support via epub.js with pagination into fixed pages for the flip view.
- Highlights & notes.
- Optional sync via user's own storage (e.g. a Cloudflare R2 bucket or Google Drive).
- Reading stats (time read, pages/day).
- Text-to-speech.

## 9. Success criteria
- I use it as my default way to read PDF books for a month.
- Page turns feel smooth (no visible blank pages during normal-speed reading).
- Zero lost reading positions.
