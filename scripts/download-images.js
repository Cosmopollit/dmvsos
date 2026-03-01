#!/usr/bin/env node
/**
 * Download additional road sign, dashboard light, and hand signal images.
 * Extends /public/signs/ from ~30 to ~65 images.
 *
 * Sources: Wikimedia Commons (public domain MUTCD signs, dashboard icons).
 * Output: /public/signs/<id>.png (~240px thumbnails)
 *
 * Usage:
 *   node scripts/download-images.js          # download all new images
 *   node scripts/download-images.js --force   # re-download existing
 *
 * Pattern: extends scripts/download-signs.js
 */

const fs = require('fs');
const path = require('path');

const SIGNS_DIR = path.join(__dirname, '..', 'public', 'signs');
const THUMB_WIDTH = 240;
const UA = 'DMVSOSSignDownloader/1.0 (https://dmvsos.com)';
const FORCE = process.argv.includes('--force');

// Additional MUTCD signs not in download-signs.js
const NEW_SIGNS = [
  // Regulatory signs
  { id: 'roundabout', file: 'MUTCD_R6-5P.svg' },
  { id: 'no-parking', file: 'MUTCD_R8-3.svg' },
  { id: 'bicycle-crossing', file: 'MUTCD_W11-1.svg' },
  { id: 'low-clearance', file: 'MUTCD_W12-2.svg' },
  { id: 'bump', file: 'MUTCD_W8-1.svg' },
  { id: 'dip', file: 'MUTCD_W8-2.svg' },
  { id: 'detour', file: 'MUTCD_M4-8.svg' },
  { id: 'road-closed', file: 'MUTCD_R11-2.svg' },
  { id: 'crosswalk', file: 'MUTCD_R1-6a.svg' },
  { id: 'hospital', file: 'MUTCD_D9-2.svg' },
  { id: 'rest-area', file: 'MUTCD_D5-1.svg' },
  { id: 'interstate', file: 'MUTCD_M1-1.svg' },
  { id: 'route-marker', file: 'MUTCD_M1-4.svg' },
  { id: 'no-trucks', file: 'MUTCD_R5-2.svg' },
  { id: 'weight-limit', file: 'MUTCD_R12-1.svg' },
  { id: 'truck-crossing', file: 'MUTCD_W11-10.svg' },
  { id: 'added-lane', file: 'MUTCD_W4-3.svg' },
  { id: 'double-curve', file: 'MUTCD_W1-4R.svg' },
  { id: 'pedestrian-signal', file: 'MUTCD_R10-3b.svg' },
  { id: 'shared-road', file: 'MUTCD_W11-1a.svg' },
  { id: 'slow', file: 'MUTCD_R1-8.svg' },
  { id: 'chevron', file: 'MUTCD_W1-8R.svg' },
  { id: 'cattle-crossing', file: 'MUTCD_W11-4.svg' },
  { id: 'fire-station', file: 'MUTCD_W11-8.svg' },
  { id: 'playground', file: 'MUTCD_W15-1.svg' },
];

// Dashboard warning lights (ISO 7000 standard symbols - public domain)
const DASHBOARD_LIGHTS = [
  { id: 'dash-check-engine', file: 'ISO_7000_-_Ref-No_0640.svg' },
  { id: 'dash-oil-pressure', file: 'ISO_7000_-_Ref-No_0248.svg' },
  { id: 'dash-temperature', file: 'ISO_7000_-_Ref-No_0246.svg' },
  { id: 'dash-battery', file: 'ISO_7000_-_Ref-No_0247.svg' },
  { id: 'dash-brake', file: 'ISO_7000_-_Ref-No_0239.svg' },
  { id: 'dash-abs', file: 'Antilock_Braking_System.svg' },
  { id: 'dash-tire-pressure', file: 'TPMS_warning_icon.svg' },
  { id: 'dash-seatbelt', file: 'ISO_7000_-_Ref-No_0249.svg' },
  { id: 'dash-highbeam', file: 'A01_High_Beam_Indicator.svg' },
];

// Hand signals (US driving, public domain JPGs from 1977)
const HAND_SIGNALS = [
  { id: 'hand-signal-left', file: 'Bicycle_hand_signal_left_turn_USA.jpg' },
  { id: 'hand-signal-right', file: 'Bicycle_hand_signal_right_turn_USA.jpg' },
  { id: 'hand-signal-stop', file: 'Bicycle_hand_signal_stop_USA.jpg' },
];

// Thematic illustrations for broader question categories
const THEMATIC = [
  // Traffic & intersection
  { id: 'traffic-light', file: 'Traffic_lights_icon.svg' },
  { id: 'intersection', file: 'Diagram_of_signalized_crosswalks_at_four-way_intersection,_vehicular_and_pedestrian_signals.svg' },
  { id: 'roundabout-diagram', file: 'Roundabout_intersection_diagram.svg' },
  { id: 'highway-road', file: 'Font_Awesome_5_solid_road.svg' },

  // Vehicles
  { id: 'motorcycle', file: 'Motorcycle_icon.svg' },
  { id: 'motorcycle-helmet', file: 'Full-motorcycle-helmet_-_Delapouite_-_game-icons.svg' },
  { id: 'semi-truck', file: 'Conventional_18-wheeler_truck_diagram.svg' },
  { id: 'school-bus', file: 'Big_School_Bus_Icon.svg' },
  { id: 'bicycle', file: 'USDOT_highway_sign_bicycle_symbol_-_white_on_green.svg' },
  { id: 'police-car', file: 'Emoji_u1f693.svg' },
  { id: 'ambulance', file: 'Ambulance_font_awesome.svg' },
  { id: 'fire-truck', file: 'Emoji_u1f692.svg' },

  // Safety & DUI
  { id: 'car-crash', file: 'Font_Awesome_5_solid_car-crash.svg' },
  { id: 'no-alcohol', file: 'Do_not_drink_alcohol_2.svg' },
  { id: 'bac-chart', file: 'Symptoms_of_BAC,_0.02%25_to_0.50%25_concentration.svg' },
  { id: 'seatbelt', file: 'Seatbelt.svg' },
  { id: 'speedometer', file: 'Ionicons_speedometer-sharp.svg' },

  // Driving conditions
  { id: 'hydroplaning', file: 'Hydroplaning.svg' },
  { id: 'blind-spot', file: 'Blindspot_three_cars_illus.svg' },
  { id: 'flat-tire', file: 'Flat-tire_-_Delapouite_-_game-icons.svg' },
  { id: 'crosswalk-diagram', file: 'Crosswalk_styles_(en).svg' },

  // Headlights (for night driving questions)
  { id: 'low-beam', file: 'ISO_7000_-_Ref-No_2665.svg' },

  // Following distance
  { id: 'following-distance', file: 'Zeichen_273-70_-_Verbot_des_Unterschreitens_des_angegebenen_Mindestabstandes,_StVO_2017.svg' },

  // Modern vehicles & EV
  { id: 'electric-car', file: 'Electric_Car_-_The_Noun_Project.svg' },
  { id: 'ev-charging', file: 'MUTCD_D9-11b_(IA-13).svg' },
  { id: 'airbag', file: 'ISO_7000_-_Ref-No_2108.svg' },
  { id: 'fog-light', file: 'ISO_7000_-_Ref-No_0633.svg' },
  { id: 'rear-fog-light', file: 'ISO_7000_-_Ref-No_0634.svg' },
  { id: 'parking-meter', file: 'Parking_Meter_-_The_Noun_Project.svg' },
  { id: 'tow-truck', file: 'Tow_truck.svg' },
  { id: 'no-texting', file: 'Egyptian_Road_Sign_-_No_Texting_While_Driving.svg' },
  { id: 'lane-keeping', file: 'ISO_7000_-_Ref-No_3128.svg' },
];

const ALL_IMAGES = [...NEW_SIGNS, ...DASHBOARD_LIGHTS, ...HAND_SIGNALS, ...THEMATIC];

async function getThumbUrl(filename) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&iiurlwidth=${THUMB_WIDTH}&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  if (page.missing !== undefined) return null;
  return page?.imageinfo?.[0]?.thumburl || null;
}

async function downloadFile(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
  return buffer.length;
}

async function main() {
  fs.mkdirSync(SIGNS_DIR, { recursive: true });

  console.log('==============================================');
  console.log('  download-images: additional signs + dashboard + hand signals');
  console.log(`  New images to check: ${ALL_IMAGES.length}`);
  console.log('==============================================\n');

  let downloaded = 0, failed = 0, skipped = 0;

  for (const img of ALL_IMAGES) {
    const dest = path.join(SIGNS_DIR, `${img.id}.png`);

    if (!FORCE && fs.existsSync(dest)) {
      skipped++;
      console.log(`  [skip] ${img.id} (already exists)`);
      continue;
    }

    try {
      const thumbUrl = await getThumbUrl(img.file);
      if (!thumbUrl) {
        failed++;
        console.log(`  [miss] ${img.id} (${img.file} not found on Commons)`);
        continue;
      }
      const bytes = await downloadFile(thumbUrl, dest);
      downloaded++;
      console.log(`  [ok]   ${img.id} (${(bytes / 1024).toFixed(1)} KB)`);
    } catch (e) {
      failed++;
      console.log(`  [err]  ${img.id}: ${e.message}`);
    }
    // Be nice to Wikimedia
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\nDone: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);

  // Report total signs count
  const totalSigns = fs.readdirSync(SIGNS_DIR).filter(f => f.endsWith('.png')).length;
  console.log(`Total images in /public/signs/: ${totalSigns}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
