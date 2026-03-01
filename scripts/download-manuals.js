#!/usr/bin/env node
/**
 * Download driver manual PDFs from all 50 US states and upload to Supabase Storage.
 *
 * Structure in storage: manuals/{state}/{category}-{lang}.pdf
 * Also creates manuals-index.json with public URLs.
 *
 * Usage:
 *   node scripts/download-manuals.js                      # download all
 *   node scripts/download-manuals.js --state=california   # one state
 *   node scripts/download-manuals.js --check              # check broken links
 *   node scripts/download-manuals.js --dry-run            # list what would download
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SUPABASE_URL = 'https://yaogndpgnewqffbjrsgz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'manuals';
const DRY_RUN = process.argv.includes('--dry-run');
const CHECK_ONLY = process.argv.includes('--check');
const STATE_ARG = process.argv.find(a => a.startsWith('--state='))?.split('=')[1];
const UA = 'Mozilla/5.0 (compatible; DMVSOSBot/1.0; +https://dmvsos.com)';
const INDEX_FILE = 'manuals-index.json';
const PROGRESS_FILE = path.join(__dirname, '..', '.download-manuals-progress.json');
const CONCURRENT = 3;

if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_ROLE_KEY env var'); process.exit(1); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// Manual sources — all 50 states
// Category: car, cdl, motorcycle
// Lang: en, es, zh, ru, vi, hy, hi, pa, ht, ko, ar, etc.
// ---------------------------------------------------------------------------

const MANUALS = {
  alabama: {
    car: { en: 'https://www.alea.gov/sites/default/files/ALEA%20DL%20Manual.pdf' },
  },
  alaska: {
    car: { en: 'https://dmv.alaska.gov/media/t5ef5vi2/dlman.pdf' },
    cdl: { en: 'https://dmv.alaska.gov/media/u3lpkfmv/cdlmanual.pdf' },
    motorcycle: { en: 'https://dmv.alaska.gov/media/bbxnnsrr/mcman.pdf' },
  },
  arizona: {
    car: { en: 'https://apps.azdot.gov/files/mvd/mvd-forms-lib/99-0117.pdf' },
    cdl: { en: 'https://apps.azdot.gov/files/mvd/mvd-forms-lib/40-7802.pdf' },
  },
  arkansas: {
    car: { en: 'https://dps.arkansas.gov/wp-content/uploads/Arkansas-DL-Manual-English.pdf' },
  },
  california: {
    car: {
      en: 'https://www.dmv.ca.gov/portal/file/california-driver-handbook-pdf',
      es: 'https://www.dmv.ca.gov/portal/file/california-driver-handbook-spanish-pdf',
      zh: 'https://www.dmv.ca.gov/portal/file/california-driver-handbook-chinese-pdf',
      ru: 'https://www.dmv.ca.gov/portal/file/california-driver-handbook-russian-pdf',
      vi: 'https://www.dmv.ca.gov/portal/file/california-driver-handbook-vietnamese-pdf',
      hy: 'https://www.dmv.ca.gov/portal/file/california-driver-handbook-armenian-pdf',
      hi: 'https://www.dmv.ca.gov/portal/file/california-driver-handbook-hindi-pdf',
      pa: 'https://www.dmv.ca.gov/portal/file/california-driver-handbook-punjabi-pdf',
    },
    cdl: {
      en: 'https://www.dmv.ca.gov/portal/file/california-commercial-driver-handbook-pdf',
      es: 'https://www.dmv.ca.gov/portal/file/commercial-driver-handbook-spanish-pdf',
    },
    motorcycle: {
      en: 'https://www.dmv.ca.gov/portal/file/motorcycle-driver-handbook-pdf',
      es: 'https://www.dmv.ca.gov/portal/file/dl665_sp-pdf',
    },
  },
  colorado: {
    car: { en: 'https://dmv.colorado.gov/sites/dmv/files/documents/DR_2337_Jan2025.pdf' },
  },
  connecticut: {
    car: { en: 'https://portal.ct.gov/dmv/-/media/dmv/dmv-pdfs/drivers-manual-english.pdf' },
  },
  delaware: {
    car: { en: 'https://dmv.de.gov/forms/driver_serv_forms/pdfs/dr_frm_manual.pdf' },
    cdl: { en: 'https://dmv.de.gov/forms/driver_serv_forms/pdfs/cdl_manual_modernized.pdf' },
  },
  florida: {
    car: {
      en: 'https://www.flhsmv.gov/pdf/handbooks/englishdriverhandbook.pdf',
      es: 'https://www.flhsmv.gov/pdf/handbooks/spanishdriverhandbook.pdf',
    },
  },
  hawaii: {
    car: { en: 'https://hidot.hawaii.gov/highways/files/2021/11/ENGLISH-Original-Hawaii-Drivers-Manual.pdf' },
    cdl: { en: 'https://hidot.hawaii.gov/highways/files/2025/08/2025-06-CDL-Manual-rev.pdf' },
  },
  idaho: {
    car: { en: 'https://itd.idaho.gov/wp-content/uploads/2025/10/driver_manual.pdf' },
    cdl: { en: 'https://itd.idaho.gov/wp-content/uploads/2025/10/CDL-manual.pdf' },
  },
  // illinois: site blocks downloads (timeout), add manually later
  indiana: {
    car: { en: 'https://www.in.gov/bmv/licenses-permits-ids/files/drivers-manual.pdf' },
  },
  iowa: {
    car: {
      en: 'https://iowadot.gov/media/7308/download?inline',
      es: 'https://iowadot.gov/media/7173/download?inline',
      zh: 'https://iowadot.gov/media/7167/download?inline',
      vi: 'https://iowadot.gov/media/7174/download?inline',
      ko: 'https://iowadot.gov/media/7171/download?inline',
      ar: 'https://iowadot.gov/media/7150/download?inline',
      fr: 'https://iowadot.gov/media/7154/download?inline',
      de: 'https://iowadot.gov/media/7155/download?inline',
      ru: 'https://iowadot.gov/media/7172/download?inline',
      ua: 'https://iowadot.gov/media/7168/download?inline',
      so: 'https://iowadot.gov/media/7165/download?inline',
      sw: 'https://iowadot.gov/media/7166/download?inline',
      my: 'https://iowadot.gov/media/7152/download?inline',
      ne: 'https://iowadot.gov/media/7162/download?inline',
      hmn: 'https://iowadot.gov/media/7158/download?inline',
    },
  },
  kansas: {
    car: { en: 'https://www.ksrevenue.gov/pdf/dlhb.pdf' },
    cdl: { en: 'https://www.ksrevenue.gov/pdf/cdlhandbook.pdf' },
  },
  kentucky: {
    car: { en: 'https://drive.ky.gov/Drivers/Documents/Kentucky-Driver-Manual.pdf' },
    cdl: { en: 'https://drive.ky.gov/Drivers/Documents/2025-CDL-Manual-6-4-2025.pdf' },
  },
  maine: {
    car: { en: 'https://www.maine.gov/sos/sites/maine.gov.sos/files/inline-files/motoristhandbook.pdf' },
  },
  maryland: {
    car: { en: 'https://mva.maryland.gov/Documents/DL-002.pdf' },
  },
  massachusetts: {
    car: {
      en: 'https://www.mass.gov/doc/english-drivers-manual/download',
      es: 'https://www.mass.gov/doc/drivers-manual-spanish/download',
      zh: 'https://www.mass.gov/doc/drivers-manual-chinese/download',
      ru: 'https://www.mass.gov/doc/drivers-manual-russian/download',
      vi: 'https://www.mass.gov/doc/drivers-manual-vietnamese/download',
      ko: 'https://www.mass.gov/doc/drivers-manual-korean/download',
      ht: 'https://www.mass.gov/doc/drivers-manual-haitian-creole/download',
      pt: 'https://www.mass.gov/doc/drivers-manual-portuguese/download',
    },
    cdl: { en: 'https://www.mass.gov/doc/cdl-manual-march-2025-version/download' },
  },
  minnesota: {
    car: { en: 'https://s3.us-east-2.amazonaws.com/assets.dps.mn.gov/s3fs-public/dvs-class-d-drivers-manual-english.pdf' },
    cdl: { en: 'https://s3.us-east-2.amazonaws.com/assets.dps.mn.gov/s3fs-public/dvs-minnesota-commercial-drivers-license-manual.pdf' },
  },
  mississippi: {
    car: { en: 'https://www.driverservicebureau.dps.ms.gov/sites/default/files/2025-02/1.15.2025%20Revised%20MDPS%20Driver%27s%20Manual.pdf' },
  },
  missouri: {
    car: { en: 'https://dor.mo.gov/forms/Driver%20Guide.pdf' },
    cdl: { en: 'https://dor.mo.gov/forms/CDL%20Manual.pdf' },
  },
  montana: {
    car: { en: 'https://www.dojmt.gov/wp-content/uploads/Montana-Driver-Manual.pdf' },
  },
  nevada: {
    car: { en: 'https://dmv.nv.gov/pdfforms/dlbook.pdf' },
    cdl: { en: 'https://dmv.nv.gov/pdfforms/dlbookcomm.pdf' },
  },
  'new-jersey': {
    car: { en: 'https://www.nj.gov/mvc/pdf/license/drivermanual.pdf' },
    cdl: { en: 'https://www.nj.gov/mvc/pdf/license/CDL_Manual.pdf' },
  },
  'new-york': {
    car: { en: 'https://dmv.ny.gov/brochure/mv21.pdf' },
  },
  'north-carolina': {
    car: { en: 'https://www.ncdot.gov/dmv/license-id/driver-licenses/new-drivers/Documents/driver-handbook.pdf' },
  },
  ohio: {
    car: { en: 'https://dam.assets.ohio.gov/image/upload/publicsafety.ohio.gov/hsy7607.pdf' },
  },
  oregon: {
    car: { en: 'https://www.oregon.gov/ODOT/Forms/DMV/37.pdf' },
  },
  pennsylvania: {
    car: {
      en: 'https://www.pa.gov/content/dam/copapwp-pagov/en/penndot/documents/public/dvspubsforms/bdl/bdl-manuals/pa-drivers-manual-non-commercial/english/pub%2095.pdf',
      es: 'https://www.pa.gov/content/dam/copapwp-pagov/en/penndot/documents/public/dvspubsforms/bdl/bdl-manuals/pa-drivers-manual-non-commercial/spanish/pub%2095s.pdf',
      zh: 'https://www.pa.gov/content/dam/copapwp-pagov/en/penndot/documents/public/dvspubsforms/bdl/bdl-manuals/pa-drivers-manual-non-commercial/chinese/pub%2095c.pdf',
      ru: 'https://www.pa.gov/content/dam/copapwp-pagov/en/penndot/documents/public/dvspubsforms/bdl/bdl-manuals/pa-drivers-manual-non-commercial/russian/pub%2095r.pdf',
      vi: 'https://www.pa.gov/content/dam/copapwp-pagov/en/penndot/documents/public/dvspubsforms/bdl/bdl-manuals/pa-drivers-manual-non-commercial/vietnamese/pub%2095v.pdf',
      ko: 'https://www.pa.gov/content/dam/copapwp-pagov/en/penndot/documents/public/dvspubsforms/bdl/bdl-manuals/pa-drivers-manual-non-commercial/korean/pub%2095k.pdf',
      ar: 'https://www.pa.gov/content/dam/copapwp-pagov/en/penndot/documents/public/dvspubsforms/bdl/bdl-manuals/pa-drivers-manual-non-commercial/arabic/pub%2095a.pdf',
      fr: 'https://www.pa.gov/content/dam/copapwp-pagov/en/penndot/documents/public/dvspubsforms/bdl/bdl-manuals/pa-drivers-manual-non-commercial/french/pub%2095f.pdf',
      ua: 'https://www.pa.gov/content/dam/copapwp-pagov/en/penndot/documents/public/dvspubsforms/bdl/bdl-manuals/pa-drivers-manual-non-commercial/ukrainian/pub%2095u.pdf',
    },
  },
  tennessee: {
    car: { en: 'https://www.tn.gov/content/dam/tn/safety/documents/DL_Manual.pdf' },
  },
  texas: {
    car: { en: 'https://www.dps.texas.gov/internetforms/Forms/DL-7.pdf' },
  },
  virginia: {
    car: { en: 'https://www.dmv.virginia.gov/sites/default/files/forms/dmv39.pdf' },
  },
  washington: {
    car: {
      en: 'https://dol.wa.gov/media/pdf/4745/driver-guidepdf',
      es: 'https://dol.wa.gov/media/pdf/4748/driver-guide-espdf',
      zh: 'https://dol.wa.gov/media/pdf/4757/driver-guide-zh-hanspdf',
      ru: 'https://dol.wa.gov/media/pdf/4753/driver-guide-rupdf',
      vi: 'https://dol.wa.gov/media/pdf/4756/driver-guide-vipdf',
      ko: 'https://dol.wa.gov/media/pdf/4751/driver-guide-kopdf',
      ua: 'https://dol.wa.gov/media/pdf/4755/driver-guide-ukpdf',
      ar: 'https://dol.wa.gov/media/pdf/4747/driver-guide-arpdf',
      ja: 'https://dol.wa.gov/media/pdf/4750/driver-guide-japdf',
      hi: 'https://dol.wa.gov/media/pdf/4749/driver-guide-hipdf',
      pa: 'https://dol.wa.gov/media/pdf/4752/driver-guide-papdf',
    },
  },
};

// Language display names for the index
const LANG_NAMES = {
  en: 'English', es: 'Spanish', zh: 'Chinese', ru: 'Russian', vi: 'Vietnamese',
  hy: 'Armenian', hi: 'Hindi', pa: 'Punjabi', ht: 'Haitian Creole', ko: 'Korean',
  ar: 'Arabic', fr: 'French', de: 'German', ua: 'Ukrainian', so: 'Somali',
  sw: 'Swahili', my: 'Burmese', ne: 'Nepali', pt: 'Portuguese', ja: 'Japanese',
  hmn: 'Hmong',
};

// ---------------------------------------------------------------------------
// Supabase Storage helpers
// ---------------------------------------------------------------------------

async function storageUpload(storagePath, buffer, contentType = 'application/pdf') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000); // 120s upload timeout
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: buffer,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload ${storagePath}: ${res.status} ${err}`);
  }
  return res.json();
}

async function storageGetMeta(storagePath) {
  // Get file metadata (to check if exists and size)
  const parts = storagePath.split('/');
  const fileName = parts.pop();
  const prefix = parts.join('/');

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix, search: fileName, limit: 1 }),
  });
  if (!res.ok) return null;
  const files = await res.json();
  return files?.[0] || null;
}

function getPublicUrl(storagePath) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

// ---------------------------------------------------------------------------
// Download logic
// ---------------------------------------------------------------------------

async function downloadPdf(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(90000), // 90s total timeout
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html') && !url.includes('/download')) {
    throw new Error('Response is HTML, not PDF');
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) throw new Error('File too small (< 1KB), probably an error page');
  return buffer;
}

function md5(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

// ---------------------------------------------------------------------------
// Check mode
// ---------------------------------------------------------------------------

async function checkLinks() {
  console.log('=== Checking manual links ===\n');
  let ok = 0, broken = 0, total = 0;

  for (const [state, categories] of Object.entries(MANUALS)) {
    if (STATE_ARG && state !== STATE_ARG) continue;
    for (const [category, langs] of Object.entries(categories)) {
      for (const [lang, url] of Object.entries(langs)) {
        total++;
        try {
          const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, redirect: 'follow' });
          if (res.ok) {
            ok++;
            process.stdout.write('.');
          } else {
            broken++;
            console.log(`\n  [BROKEN] ${state}/${category}-${lang}: HTTP ${res.status}`);
          }
        } catch (e) {
          broken++;
          console.log(`\n  [ERROR]  ${state}/${category}-${lang}: ${e.message}`);
        }
        await sleep(200);
      }
    }
  }

  console.log(`\n\nResults: ${ok} ok, ${broken} broken, ${total} total`);
}

// ---------------------------------------------------------------------------
// Main download + upload
// ---------------------------------------------------------------------------

async function main() {
  if (CHECK_ONLY) {
    await checkLinks();
    return;
  }

  console.log('==============================================');
  console.log('  download-manuals: PDF -> Supabase Storage');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  if (STATE_ARG) console.log(`  State: ${STATE_ARG}`);
  console.log('==============================================\n');

  // Load progress
  let progress = {};
  if (fs.existsSync(PROGRESS_FILE)) {
    try { progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch { /* ignore */ }
  }

  const index = {};
  let uploaded = 0, skipped = 0, failed = 0, total = 0;

  const states = STATE_ARG ? { [STATE_ARG]: MANUALS[STATE_ARG] } : MANUALS;
  if (STATE_ARG && !MANUALS[STATE_ARG]) {
    console.error(`Unknown state: ${STATE_ARG}`);
    console.log('Available:', Object.keys(MANUALS).join(', '));
    process.exit(1);
  }

  for (const [state, categories] of Object.entries(states)) {
    index[state] = {};

    for (const [category, langs] of Object.entries(categories)) {
      index[state][category] = {};

      for (const [lang, url] of Object.entries(langs)) {
        total++;
        const storagePath = `${state}/${category}-${lang}.pdf`;
        const progressKey = `${state}/${category}/${lang}`;

        if (DRY_RUN) {
          console.log(`  [plan] ${storagePath} <- ${url}`);
          index[state][category][lang] = getPublicUrl(storagePath);
          continue;
        }

        // Check if already uploaded with same URL
        if (progress[progressKey]?.url === url && progress[progressKey]?.uploaded) {
          skipped++;
          index[state][category][lang] = getPublicUrl(storagePath);
          process.stdout.write('.');
          continue;
        }

        try {
          process.stdout.write(`\n  [dl] ${storagePath}... `);
          const buffer = await downloadPdf(url);
          const hash = md5(buffer);
          const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);

          // Check if same file already in storage
          if (progress[progressKey]?.hash === hash) {
            skipped++;
            index[state][category][lang] = getPublicUrl(storagePath);
            progress[progressKey].url = url;
            process.stdout.write(`same (${sizeMB}MB)`);
          } else {
            await storageUpload(storagePath, buffer);
            uploaded++;
            index[state][category][lang] = getPublicUrl(storagePath);
            progress[progressKey] = { url, hash, uploaded: true, size: buffer.length };
            process.stdout.write(`OK (${sizeMB}MB)`);
          }
        } catch (e) {
          failed++;
          process.stdout.write(`FAIL: ${e.message}`);
        }

        // Save progress after each file
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));

        await sleep(500);
      }
    }
  }

  // Save final progress
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));

  console.log(`\n\n  Done: ${uploaded} uploaded, ${skipped} skipped, ${failed} failed (${total} total)`);

  // Build complete index from ALL states (not just filtered)
  if (!STATE_ARG) {
    // Clean index: remove states with no successful downloads
    const cleanIndex = {};
    for (const [state, categories] of Object.entries(index)) {
      const stateData = {};
      for (const [category, langs] of Object.entries(categories)) {
        const langData = {};
        for (const [lang, publicUrl] of Object.entries(langs)) {
          if (publicUrl) langData[lang] = publicUrl;
        }
        if (Object.keys(langData).length > 0) stateData[category] = langData;
      }
      if (Object.keys(stateData).length > 0) cleanIndex[state] = stateData;
    }

    // Upload index file
    const indexBuffer = Buffer.from(JSON.stringify(cleanIndex, null, 2));
    if (!DRY_RUN) {
      await storageUpload(INDEX_FILE, indexBuffer, 'application/json');
      console.log(`  Index uploaded: ${INDEX_FILE} (${Object.keys(cleanIndex).length} states)`);
    } else {
      console.log(`  [dry-run] Would upload index with ${Object.keys(cleanIndex).length} states`);
    }
  }

  // Summary by state
  console.log('\n  States with non-EN manuals:');
  for (const [state, categories] of Object.entries(index)) {
    const langs = new Set();
    for (const catLangs of Object.values(categories)) {
      for (const lang of Object.keys(catLangs)) {
        if (lang !== 'en') langs.add(lang);
      }
    }
    if (langs.size > 0) {
      console.log(`    ${state}: ${[...langs].join(', ')}`);
    }
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
