#!/usr/bin/env python3
"""Prepend a DMVSOS branded page (with a clickable link back to dmvsos.com)
to every manual PDF in the Supabase `manuals` storage bucket.

Why: downloaded handbook PDFs travel (shared, printed, re-uploaded). The
insert page carries a per-state link to dmvsos.com/dmv-test/{state} with UTM
tags, so the file itself becomes an acquisition channel.

Safety:
- The ORIGINAL file is copied to `_originals/{path}` inside the same bucket
  before the first stamp (skipped if the backup already exists).
- Idempotent: stamped files carry /DMVSOSStamped metadata; re-runs skip them.
- --dry-run lists what would happen; --limit N caps processed files.

Usage:
  python3 scripts/stamp-manuals.py --dry-run
  python3 scripts/stamp-manuals.py --limit=1
  python3 scripts/stamp-manuals.py            # full run

Requires SUPABASE_SERVICE_ROLE_KEY (read from .env.local like the JS scripts).
New manuals uploaded later (download-manuals.js) need a re-run of this script.
"""

import argparse
import io
import json
import os
import re
import sys
import urllib.request

from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Helvetica has no Cyrillic/CJK glyphs; the language line needs a Unicode
# font. Arial Unicode ships with macOS. Falls back to English language names
# if the font is missing (e.g. a Linux CI box).
UNICODE_FONT = None
for _p in ('/Library/Fonts/Arial Unicode.ttf', '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'):
    if os.path.exists(_p):
        try:
            pdfmetrics.registerFont(TTFont('ArialUni', _p))
            UNICODE_FONT = 'ArialUni'
        except Exception:
            pass
        break

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load_env():
    try:
        with open(os.path.join(ROOT, '.env.local')) as f:
            for line in f:
                m = re.match(r'^([A-Z_][A-Z0-9_]*)=(.*)$', line.strip())
                if m and m.group(1) not in os.environ:
                    os.environ[m.group(1)] = m.group(2).strip('"\'')
    except FileNotFoundError:
        pass

load_env()
SUPA = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', 'https://yaogndpgnewqffbjrsgz.supabase.co')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
if not KEY:
    sys.exit('Missing SUPABASE_SERVICE_ROLE_KEY')

BUCKET = 'manuals'
INDEX_URL = f'{SUPA}/storage/v1/object/public/{BUCKET}/manuals-index.json'

STATE_DISPLAY = None  # filled from index keys; slug -> Title Case fallback

def http(url, method='GET', data=None, headers=None, timeout=180):
    req = urllib.request.Request(url, data=data, method=method)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    return urllib.request.urlopen(req, timeout=timeout)

def auth_headers(extra=None):
    h = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}
    h.update(extra or {})
    return h

def object_exists(path):
    # HEAD on the authenticated object endpoint; 200 = exists.
    try:
        r = http(f'{SUPA}/storage/v1/object/{BUCKET}/{path}', method='HEAD', headers=auth_headers())
        return r.status == 200
    except Exception:
        return False

def copy_object(src, dst):
    body = json.dumps({'bucketId': BUCKET, 'sourceKey': src, 'destinationKey': dst}).encode()
    r = http(f'{SUPA}/storage/v1/object/copy', method='POST', data=body,
             headers=auth_headers({'Content-Type': 'application/json'}))
    if r.status not in (200, 201):
        raise RuntimeError(f'copy {src} -> {dst}: HTTP {r.status}')

def upload_object(path, blob):
    r = http(f'{SUPA}/storage/v1/object/{BUCKET}/{path}', method='POST', data=blob,
             headers=auth_headers({'Content-Type': 'application/pdf', 'x-upsert': 'true'}))
    if r.status not in (200, 201):
        raise RuntimeError(f'upload {path}: HTTP {r.status}')

def title_case(slug):
    return ' '.join(w.capitalize() for w in slug.split('-'))

NAVY = (11/255, 28/255, 61/255)
BLUE = (37/255, 99/255, 235/255)
AMBER = (245/255, 158/255, 11/255)
GRAY = (100/255, 116/255, 139/255)

# ── PIL page composition ──────────────────────────────────────────────────
# The page is designed as a high-res image (same craft as the App Store IAP
# cards in dmvsos-mobile/store-screenshots/build_iap_cards.py) and embedded
# full-bleed into the PDF; the dmvsos.com button gets a link annotation on
# top. Design tokens follow the product: navy #0B1C3D card, amber accents,
# blue CTA, SF wordmark.

from PIL import Image, ImageDraw, ImageFont, ImageFilter

MOBILE = os.path.join(os.path.dirname(ROOT), 'dmvsos-mobile')
HERO_IMG = os.path.join(MOBILE, 'assets/images/vehicles/mustang-hero.png')
ICON_IMG = os.path.join(MOBILE, 'assets/images/icon.png')
SF_FONT = '/System/Library/Fonts/SFNS.ttf'
ARIAL_UNI = next((p for p in ('/Library/Fonts/Arial Unicode.ttf',
                              '/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
                  if os.path.exists(p)), None)

def _sf(size, weight='Regular'):
    f = ImageFont.truetype(SF_FONT, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f

PAGE_W, PAGE_H = 1700, 2200  # US letter @ 200dpi

def _compose_page_png():
    """Returns (png_bytes, button_rect_px). Minimal brand card: neat logo,
    one claim, the address, a QR to the site. Cached per run (identical for
    every PDF; only the link annotation's UTM differs per file)."""
    import qrcode

    img = Image.new('RGB', (PAGE_W, PAGE_H), (255, 255, 255))
    d = ImageDraw.Draw(img)
    NAVYC = (11, 28, 61)
    AMBERC = (245, 158, 11)
    GRAYC = (120, 134, 156)
    BLUEC = (37, 99, 235)
    cx = PAGE_W // 2

    # Neat logo: icon + wordmark, centered as one unit
    word_font = _sf(86, 'Heavy')
    word = 'DMVSOS'
    icon_size, gap = 112, 30
    total_w = icon_size + gap + d.textlength(word, font=word_font)
    lx = int(cx - total_w / 2)
    ly = 300
    if os.path.exists(ICON_IMG):
        icon = Image.open(ICON_IMG).convert('RGBA').resize((icon_size, icon_size), Image.LANCZOS)
        mask = Image.new('L', (icon_size, icon_size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, icon_size, icon_size], 26, fill=255)
        img.paste(icon, (lx, ly), mask)
    d.text((lx + icon_size + gap, ly + icon_size // 2), word, font=word_font, fill=NAVYC, anchor='lm')

    # Claim
    d.text((cx, 780), 'The largest DMV question bank.', font=_sf(88, 'Heavy'), fill=NAVYC, anchor='mm')
    d.text((cx, 900), 'In 5 languages.', font=_sf(88, 'Heavy'), fill=AMBERC, anchor='mm')
    lang_font = ImageFont.truetype(ARIAL_UNI, 40) if ARIAL_UNI else _sf(40)
    d.text((cx, 1010), 'English · Español · Русский · 中文 · Українська', font=lang_font, fill=GRAYC, anchor='mm')

    # Address (clickable)
    url_font = _sf(78, 'Heavy')
    url_text = 'www.dmvsos.com'
    d.text((cx, 1200), url_text, font=url_font, fill=BLUEC, anchor='mm')
    tw = d.textlength(url_text, font=url_font)
    bx0, by0 = int(cx - tw / 2) - 30, 1200 - 70
    bx1, by1 = int(cx + tw / 2) + 30, 1200 + 70

    # QR to the site
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=2)
    qr.add_data('https://www.dmvsos.com/?utm_source=manual_pdf&utm_medium=qr')
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color='#0B1C3D', back_color='white').convert('RGB')
    qr_size = 470
    qr_img = qr_img.resize((qr_size, qr_size), Image.NEAREST)
    img.paste(qr_img, (cx - qr_size // 2, 1360))
    d.text((cx, 1360 + qr_size + 54), 'Scan to open', font=_sf(34), fill=GRAYC, anchor='mm')

    # Footer honesty line
    d.text((cx, PAGE_H - 90),
           'This page was added by DMVSOS.com. The official handbook begins on the next page.',
           font=_sf(30), fill=GRAYC, anchor='mm')

    out = io.BytesIO()
    img.save(out, format='PNG', optimize=True)
    out.seek(0)
    return out, (bx0, by0, bx1, by1)

_PAGE_CACHE = None

def build_insert_page(state_slug, cat, lang):
    """One US-letter page: the PIL-composed brand card + clickable button.
    Per-file UTM keeps analytics granular even though the visible link is
    just dmvsos.com."""
    global _PAGE_CACHE
    if _PAGE_CACHE is None:
        _PAGE_CACHE = _compose_page_png()
    png_buf, (bx0, by0, bx1, by1) = _PAGE_CACHE

    url = f'https://dmvsos.com/?utm_source=manual_pdf&utm_medium=pdf&utm_campaign={state_slug}-{cat}-{lang}'

    from reportlab.lib.utils import ImageReader
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    W, H = letter
    png_buf.seek(0)
    c.drawImage(ImageReader(png_buf), 0, 0, W, H)
    # px → pt (PIL y grows down, PDF y grows up)
    sx, sy = W / PAGE_W, H / PAGE_H
    c.linkURL(url, (bx0 * sx, H - by1 * sy, bx1 * sx, H - by0 * sy), relative=0)
    c.showPage()
    c.save()
    buf.seek(0)
    return buf

def stamp_pdf(original_blob, state_slug, cat, lang):
    reader = PdfReader(io.BytesIO(original_blob))
    meta = reader.metadata or {}
    if meta.get('/DMVSOSStamped'):
        return None  # already stamped

    insert_reader = PdfReader(build_insert_page(state_slug, cat, lang))
    writer = PdfWriter()
    writer.add_page(insert_reader.pages[0])
    for page in reader.pages:
        writer.add_page(page)
    # Carry original metadata forward, add our marker
    try:
        writer.add_metadata({**{k: str(v) for k, v in meta.items()}, '/DMVSOSStamped': '1'})
    except Exception:
        writer.add_metadata({'/DMVSOSStamped': '1'})

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()

def storage_path_from_url(url):
    marker = f'/storage/v1/object/public/{BUCKET}/'
    i = url.find(marker)
    return url[i + len(marker):] if i >= 0 else None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--state', default=None)
    args = ap.parse_args()

    with http(INDEX_URL) as r:
        index = json.load(r)

    jobs = []
    for state, cats in index.items():
        if args.state and state != args.state:
            continue
        if not isinstance(cats, dict):
            continue
        for cat, langs in cats.items():
            if not isinstance(langs, dict):
                continue
            for lang, url in langs.items():
                path = storage_path_from_url(url)
                if path:
                    jobs.append((state, cat, lang, path))

    print(f'{len(jobs)} PDFs in index')
    done = skipped = failed = 0
    for state, cat, lang, path in jobs:
        if args.limit and done >= args.limit:
            break
        tag = f'{state}/{cat}/{lang}'
        try:
            if args.dry_run:
                print(f'DRY {tag} <- {path}')
                done += 1
                continue
            with http(f'{SUPA}/storage/v1/object/public/{path}?nocache=1') as r:
                blob = r.read()
            stamped = stamp_pdf(blob, state, cat, lang)
            if stamped is None:
                print(f'SKIP (already stamped) {tag}')
                skipped += 1
                continue
            backup = f'_originals/{path}'
            if not object_exists(backup):
                copy_object(path, backup)
            upload_object(path, stamped)
            done += 1
            print(f'OK {tag}  {len(blob)//1024}KB -> {len(stamped)//1024}KB')
        except Exception as e:
            failed += 1
            print(f'FAIL {tag}: {e}')

    print(f'\nstamped: {done}  skipped: {skipped}  failed: {failed}')

if __name__ == '__main__':
    main()
