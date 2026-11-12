"""Generate PDF fixtures for tests.

    python make_fixtures.py          # small committed fixtures
    python make_fixtures.py --large  # also the big ones (git-ignored)

Needs PyMuPDF (`pip install pymupdf`). All content is generated here, so there are no
copyright questions about the fixtures.
"""
import random
import sys

import fitz  # PyMuPDF

WORDS = (
    "the river morning lamp quiet harbour letter garden window silver evening road "
    "voice winter paper candle field distant house bell shadow orchard rain stone "
    "slowly gently under across beyond toward until while because although"
).split()


def sentence(rng):
    n = rng.randint(8, 18)
    words = [rng.choice(WORDS) for _ in range(n)]
    return " ".join(words).capitalize() + "."


def text_pdf(path, pages, title, author, seed=1, password=None, outline=True):
    rng = random.Random(seed)
    doc = fitz.open()
    toc = []
    for i in range(pages):
        page = doc.new_page(width=432, height=648)  # 6x9in trade paperback
        if i == 0:
            page.insert_textbox(fitz.Rect(48, 200, 384, 300), title, fontsize=26, fontname="tiro", align=1)
            page.insert_textbox(fitz.Rect(48, 320, 384, 360), author, fontsize=14, fontname="tiro", align=1)
            continue
        if i % 10 == 1:
            chapter = f"Chapter {i // 10 + 1}"
            toc.append([1, chapter, i + 1])
            page.insert_text((48, 96), chapter, fontsize=18, fontname="tiro")
            top = 130
        else:
            top = 64
        body = " ".join(sentence(rng) for _ in range(28))
        page.insert_textbox(fitz.Rect(48, top, 384, 600), body, fontsize=11, fontname="tiro", align=3)
        page.insert_text((210, 625), str(i + 1), fontsize=9, fontname="tiro")
    if outline and toc:
        doc.set_toc(toc)
    doc.set_metadata({"title": title, "author": author})
    kwargs = {}
    if password:
        kwargs = dict(encryption=fitz.PDF_ENCRYPT_AES_256, user_pw=password, owner_pw=password + "-owner")
    doc.save(path, garbage=3, deflate=True, **kwargs)


def scanned_pdf(path, pages, seed=7):
    """Image-only pages, like a scan: one greyscale raster per page."""
    rng = random.Random(seed)
    doc = fitz.open()
    w, h = 1100, 1650
    for i in range(pages):
        pix = fitz.Pixmap(fitz.csGRAY, fitz.IRect(0, 0, w, h), False)
        pix.set_rect(pix.irect, (236,))
        y = 140
        while y < h - 140:
            x = 120
            while x < w - 120:
                word = rng.randint(30, 120)
                pix.set_rect(fitz.IRect(x, y, min(x + word, w - 120), y + 18), (rng.randint(30, 70),))
                x += word + 18
            y += 44
        page = doc.new_page(width=432, height=648)
        page.insert_image(page.rect, stream=pix.tobytes("jpeg", jpg_quality=55))
    doc.set_metadata({"title": "Scanned Sample", "author": ""})
    doc.save(path, garbage=3, deflate=True)


if __name__ == "__main__":
    text_pdf("small-text.pdf", 20, "The Lamp by the River", "A. Fixture", seed=1)
    text_pdf("second-book.pdf", 12, "Letters from the Orchard", "B. Fixture", seed=2)
    text_pdf("locked.pdf", 6, "A Locked Book", "C. Fixture", seed=3, password="padaan")
    with open("not-a-pdf.pdf", "w") as f:
        f.write("<!doctype html><title>Not a PDF</title><p>This is a web page.</p>")
    if "--large" in sys.argv:
        scanned_pdf("large-scanned.pdf", 320)
        text_pdf("large-1000.pdf", 1000, "A Very Long Book", "D. Fixture", seed=4)
