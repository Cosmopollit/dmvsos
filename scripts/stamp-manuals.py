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
    """Returns (png_bytes, button_rect_px). Cached per run: the page is
    identical for every PDF (only the UTM in the link annotation differs)."""
    img = Image.new('RGB', (PAGE_W, PAGE_H), (240, 246, 255))
    d = ImageDraw.Draw(img)

    # Soft page gradient wash (top cool, bottom warm) like the web hero.
    grad = Image.new('L', (1, PAGE_H))
    for y in range(PAGE_H):
        grad.putpixel((0, y), int(14 * (y / PAGE_H)))
    warm = Image.new('RGB', (PAGE_W, PAGE_H), (255, 247, 237))
    img = Image.composite(warm, img, grad.resize((PAGE_W, PAGE_H)))
    d = ImageDraw.Draw(img)

    # ── Header band ──
    NAVYC = (11, 28, 61)
    d.rectangle([0, 0, PAGE_W, 300], fill=NAVYC)
    x = 90
    if os.path.exists(ICON_IMG):
        icon = Image.open(ICON_IMG).convert('RGBA').resize((150, 150), Image.LANCZOS)
        mask = Image.new('L', (150, 150), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, 150, 150], 34, fill=255)
        img.paste(icon, (x, 75), mask)
        x += 190
    d.text((x, 92), 'DMVSOS', font=_sf(92, 'Heavy'), fill=(255, 255, 255))
    d.text((x + 4, 196), 'DMV practice tests · All 50 states', font=_sf(34, 'Bold'), fill=(245, 158, 11))

    # ── Navy feature card ──
    CX0, CY0, CX1, CY1 = 150, 470, PAGE_W - 150, 1780
    shadow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([CX0 + 10, CY0 + 24, CX1 + 10, CY1 + 24], 48, fill=(11, 28, 61, 70))
    img = Image.alpha_composite(img.convert('RGBA'), shadow.filter(ImageFilter.GaussianBlur(18))).convert('RGB')
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([CX0, CY0, CX1, CY1], 48, fill=NAVYC, outline=(245, 158, 11), width=4)

    cx = (CX0 + CX1) // 2

    # Gold badge on the card's top edge
    badge_font = _sf(34, 'Bold')
    badge_text = '28,000+ QUESTIONS'
    bw = d.textlength(badge_text, font=badge_font) + 90
    d.rounded_rectangle([cx - bw / 2, CY0 - 34, cx + bw / 2, CY0 + 40], 37, fill=(245, 158, 11))
    d.text((cx, CY0 + 2), badge_text, font=badge_font, fill=(11, 28, 61), anchor='mm')

    # Hero car
    y = CY0 + 110
    if os.path.exists(HERO_IMG):
        hero = Image.open(HERO_IMG).convert('RGBA')
        hw = 640
        hh = int(hero.height * hw / hero.width)
        hero = hero.resize((hw, hh), Image.LANCZOS)
        img.paste(hero, (cx - hw // 2, y), hero)
        y += hh + 60
    d = ImageDraw.Draw(img)

    # Claim
    d.text((cx, y + 30), 'The largest DMV question bank.', font=_sf(74, 'Heavy'), fill=(255, 255, 255), anchor='mm')
    d.text((cx, y + 130), 'In 5 languages.', font=_sf(74, 'Heavy'), fill=(245, 158, 11), anchor='mm')
    y += 230

    # Languages line (Arial Unicode: SFNS lacks CJK)
    lang_font = ImageFont.truetype(ARIAL_UNI, 40) if ARIAL_UNI else _sf(40)
    d.text((cx, y), 'English · Español · Русский · 中文 · Українська', font=lang_font, fill=(148, 163, 184), anchor='mm')
    y += 70
    d.text((cx, y), 'Built from official handbooks like this one.', font=_sf(38), fill=(148, 163, 184), anchor='mm')
    y += 120

    # Blue CTA button (recorded for the PDF link annotation)
    btn_w, btn_h = 660, 132
    bx0, by0 = cx - btn_w // 2, y
    bx1, by1 = cx + btn_w // 2, y + btn_h
    # Two-tone flat button: brand blue with a slightly lighter top edge line.
    d.rounded_rectangle([bx0, by0, bx1, by1], 32, fill=(37, 99, 235))
    d.rounded_rectangle([bx0, by0, bx1, by1], 32, outline=(96, 143, 245), width=3)
    d.text(((bx0 + bx1) // 2, (by0 + by1) // 2), 'dmvsos.com', font=_sf(56, 'Heavy'), fill=(255, 255, 255), anchor='mm')
    y = by1 + 80

    d.text((cx, y), 'Available on the web and in the App Store', font=_sf(38), fill=(203, 213, 225), anchor='mm')
    d.text((cx, y + 66), 'Come in and learn.', font=_sf(42, 'Bold'), fill=(245, 158, 11), anchor='mm')

    # Footer honesty line
    d.text((PAGE_W // 2, PAGE_H - 90),
           'This page was added by DMVSOS.com. The official handbook begins on the next page.',
           font=_sf(30), fill=(120, 134, 156), anchor='mm')

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
