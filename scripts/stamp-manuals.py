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

def build_insert_page(state_slug, cat, lang):
    """One US-letter page, official-dress style, clickable link block."""
    state_name = title_case(state_slug)
    url = f'https://dmvsos.com/dmv-test/{state_slug}?utm_source=manual_pdf&utm_medium=pdf&utm_campaign={state_slug}-{cat}-{lang}'
    display_url = f'dmvsos.com/dmv-test/{state_slug}'

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    W, H = letter

    # Header band
    c.setFillColorRGB(*NAVY)
    c.rect(0, H - 110, W, 110, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont('Helvetica-Bold', 30)
    c.drawString(54, H - 68, 'DMVSOS')
    c.setFillColorRGB(*AMBER)
    c.setFont('Helvetica-Bold', 12)
    c.drawString(54, H - 88, 'Free DMV practice tests · All 50 states · 5 languages')

    # Title
    c.setFillColorRGB(*NAVY)
    c.setFont('Helvetica-Bold', 24)
    c.drawString(54, H - 170, f'Studying for the {state_name}')
    c.drawString(54, H - 200, 'knowledge test?')

    # Body
    c.setFillColorRGB(*GRAY)
    c.setFont('Helvetica', 13)
    body_lines = [
        'This official handbook pairs with free practice questions built from it.',
        'Check yourself before exam day: 20 free questions per test, no signup.',
        'Practice in English, Spanish, Russian, Chinese, or Ukrainian.',
    ]
    y = H - 240
    for line in body_lines:
        c.drawString(54, y, line)
        y -= 20

    # Link button
    btn_y = y - 46
    c.setFillColorRGB(*BLUE)
    c.roundRect(54, btn_y, 340, 44, 10, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont('Helvetica-Bold', 15)
    c.drawString(74, btn_y + 15, display_url)
    c.linkURL(url, (54, btn_y, 394, btn_y + 44), relative=0)

    # Footer note (honesty: the official manual is untouched, starts next page)
    c.setFillColorRGB(*GRAY)
    c.setFont('Helvetica', 9)
    c.drawString(54, 60, 'This page was added by DMVSOS.com. The official handbook begins on the next page.')

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
